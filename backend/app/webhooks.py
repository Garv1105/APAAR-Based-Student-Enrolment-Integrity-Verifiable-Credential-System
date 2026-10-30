import ipaddress
import json
import socket
import threading
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit, urlunsplit

import httpx
from fastapi import HTTPException
from psycopg.types.json import Jsonb

from . import crypto, db

EVENTS = {
    "batch.validated": {"batch_id", "counts", "codes"},
    "case.opened": {"case_id"},
    "case.resolved": {"case_id", "status"},
    "credential.issued": {"credential_id", "type", "enrolment_id"},
    "credential.revoked": {"credential_id", "enrolment_id", "reason"},
}
BACKOFF = [30, 120, 600, 3600, 21600]
MAX_ACTIVE = 5
TIMEOUT = 5.0
ROTATION_OVERLAP = timedelta(hours=24)
DISPATCHER = {"role": "webhook_dispatcher", "id": "webhook-dispatcher"}
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


class UrlRejected(ValueError):
    pass


def _payload(event: str, data: dict) -> Jsonb:
    if extra := set(data) - EVENTS[event]:
        raise ValueError(f"webhook payload for {event} has non-allowlisted keys: {sorted(extra)}")
    return Jsonb(data)


def emit(conn, event: str, institution_id: str, **data) -> None:
    conn.execute("SELECT enqueue_event(%s, %s, %s)", (event, _payload(event, data), institution_id))


def emit_case(conn, event: str, case_id: int, **data) -> None:
    conn.execute("SELECT enqueue_case_event(%s, %s, %s)", (case_id, event, _payload(event, {"case_id": case_id, **data})))


def _allow_localhost() -> bool:
    return (db._env("WEBHOOK_ALLOW_LOCALHOST") or "").lower() == "true"


def resolve(url: str):
    u = urlsplit(url)
    if u.scheme not in ("https", "http") or not u.hostname or u.username or u.password or u.fragment:
        raise UrlRejected("URL must be https://host/path with no credentials or fragment")
    host = u.hostname.lower()
    local_ok = host in LOCAL_HOSTS and _allow_localhost()
    if u.scheme == "http" and not local_ok:
        raise UrlRejected("only https URLs are allowed")
    try:
        infos = socket.getaddrinfo(host, u.port or (443 if u.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except (OSError, UnicodeError):
        raise UrlRejected("host does not resolve") from None
    ips = []
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        ip = getattr(ip, "ipv4_mapped", None) or ip
        if not (local_ok and ip.is_loopback) and (not ip.is_global or ip.is_multicast):
            raise UrlRejected("host resolves to a private, loopback, link-local or reserved address")
        ips.append(ip)
    return u, ips[0]


def _target(u, ip) -> tuple[str, dict, dict]:
    netloc = (f"[{ip}]" if ip.version == 6 else str(ip)) + (f":{u.port}" if u.port else "")
    host_header = u.hostname + (f":{u.port}" if u.port else "")
    ext = {"sni_hostname": u.hostname} if u.scheme == "https" else {}
    return urlunsplit((u.scheme, netloc, u.path or "/", u.query, "")), {"host": host_header}, ext


def body_of(d: dict) -> bytes:
    return json.dumps({"id": str(d["event_id"]), "type": d["event_type"], "created_at": d["created_at"].isoformat(),
                       "data": d["payload"]}, separators=(",", ":"), sort_keys=True).encode()


def _secrets(d: dict, now: datetime) -> list[str]:
    s = [crypto.decrypt("webhook_endpoints", "secret", d["endpoint_id"], d["secret_enc"])]
    if d["prev_secret_enc"] and d["prev_expires_at"] and d["prev_expires_at"] > now:
        s.append(crypto.decrypt("webhook_endpoints", "prev_secret", d["endpoint_id"], d["prev_secret_enc"]))
    return s


def _send(client: httpx.Client, d: dict, now: datetime) -> tuple[int | None, str | None]:
    try:
        u, ip = resolve(d["url"])
    except UrlRejected as e:
        return None, f"url rejected: {e}"
    body, ts, mid = body_of(d), int(now.timestamp()), str(d["event_id"])
    url, headers, ext = _target(u, ip)
    headers |= {"content-type": "application/json", "user-agent": "apaar-webhooks/1", "webhook-id": mid,
                "webhook-timestamp": str(ts), "webhook-signature": crypto.webhook_sign(_secrets(d, now), mid, ts, body)}
    try:
        r = client.post(url, content=body, headers=headers, extensions=ext)
    except httpx.HTTPError as e:
        return None, type(e).__name__
    return r.status_code, None if r.is_success else f"HTTP {r.status_code}"


def dispatch_due(now: datetime | None = None, client: httpx.Client | None = None, limit: int = 20) -> int:
    now = now or datetime.now(timezone.utc)
    own = client is None
    client = client or httpx.Client(timeout=TIMEOUT, follow_redirects=False)
    n = 0
    try:
        with db.app_connect(DISPATCHER) as conn:
            while n < limit:
                with conn.transaction():
                    d = conn.execute(
                        "SELECT d.*, w.url, w.secret_enc, w.prev_secret_enc, w.prev_expires_at, w.active FROM webhook_deliveries d "
                        "JOIN webhook_endpoints w ON w.id = d.endpoint_id WHERE d.status = 'pending' AND d.next_attempt_at <= %s "
                        "ORDER BY d.next_attempt_at, d.id LIMIT 1 FOR UPDATE OF d SKIP LOCKED", (now,)).fetchone()
                    if d is None:
                        break
                    if not d["active"]:
                        conn.execute("UPDATE webhook_deliveries SET status='cancelled' WHERE id=%s", (d["id"],))
                        continue
                    code, err = _send(client, d, now)
                    attempts = d["attempts"] + 1
                    if code is not None and 200 <= code < 300:
                        status, nxt = "delivered", d["next_attempt_at"]
                    elif attempts > len(BACKOFF):
                        status, nxt = "failed", d["next_attempt_at"]
                    else:
                        status, nxt = "pending", now + timedelta(seconds=BACKOFF[attempts - 1])
                    conn.execute("UPDATE webhook_deliveries SET status=%s, attempts=%s, next_attempt_at=%s, last_status_code=%s, "
                                 "last_error=%s, delivered_at=%s WHERE id=%s",
                                 (status, attempts, nxt, code, err[:200] if err else None,
                                  now if status == "delivered" else None, d["id"]))
                n += 1
    finally:
        if own:
            client.close()
    return n


def start_poller() -> threading.Thread | None:
    if (db._env("WEBHOOK_DISPATCH") or "on").lower() == "off":
        return None

    def loop():
        while True:
            try:
                dispatch_due()
            except Exception as e:
                print(f"webhook dispatcher: {type(e).__name__}")
            time.sleep(2)

    t = threading.Thread(target=loop, daemon=True, name="webhook-dispatcher")
    t.start()
    return t


def endpoint_out(w: dict) -> dict:
    return {"id": w["id"], "url": w["url"], "events": w["events"], "active": w["active"], "secret_fp": w["secret_fp"],
            "created_at": w["created_at"],
            "previous_secret_valid_until": w["prev_expires_at"] if w["prev_secret_enc"] and w["prev_expires_at"]
            and w["prev_expires_at"] > datetime.now(timezone.utc) else None}


def _get(conn, endpoint_id: int) -> dict:
    w = conn.execute("SELECT * FROM webhook_endpoints WHERE id=%s", (endpoint_id,)).fetchone()
    if w is None:
        raise HTTPException(404, "Webhook not found")
    return w


def register(conn, user: dict, url: str, events: list[str], idem_key: str | None, request_hash: str) -> dict:
    inst = user["institution_id"]
    if idem_key:
        prev = conn.execute("SELECT * FROM webhook_endpoints WHERE institution_id=%s AND idempotency_key=%s", (inst, idem_key)).fetchone()
        if prev:
            if prev["request_hash"] != request_hash:
                raise HTTPException(422, "Idempotency-Key was already used with a different request body")
            return endpoint_out(prev) | {"secret": crypto.decrypt("webhook_endpoints", "secret", prev["id"], prev["secret_enc"])}
    try:
        resolve(url)
    except UrlRejected as e:
        raise HTTPException(422, f"Webhook URL rejected: {e}") from None
    conn.execute("SELECT pg_advisory_xact_lock(hashtextextended('webhooks:' || %s, 0))", (inst,))
    if conn.execute("SELECT count(*) n FROM webhook_endpoints WHERE institution_id=%s AND active", (inst,)).fetchone()["n"] >= MAX_ACTIVE:
        raise HTTPException(409, f"At most {MAX_ACTIVE} active webhooks per institution")
    wid = conn.execute("SELECT nextval('webhook_endpoints_id_seq') id").fetchone()["id"]
    secret = crypto.webhook_secret()
    w = conn.execute("INSERT INTO webhook_endpoints (id, institution_id, url, events, secret_enc, secret_fp, idempotency_key, "
                     "request_hash, created_by) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
                     (wid, inst, url, sorted(set(events)), crypto.encrypt("webhook_endpoints", "secret", wid, secret),
                      crypto.sha256_hex(secret.encode())[:8], idem_key, request_hash, user["id"])).fetchone()
    return endpoint_out(w) | {"secret": secret}


def deactivate(conn, endpoint_id: int) -> dict:
    _get(conn, endpoint_id)
    w = conn.execute("UPDATE webhook_endpoints SET active=false WHERE id=%s RETURNING *", (endpoint_id,)).fetchone()
    conn.execute("UPDATE webhook_deliveries SET status='cancelled' WHERE endpoint_id=%s AND status='pending'", (endpoint_id,))
    return endpoint_out(w)


def rotate(conn, endpoint_id: int) -> dict:
    w = _get(conn, endpoint_id)
    if not w["active"]:
        raise HTTPException(409, "Webhook is deactivated")
    old = crypto.decrypt("webhook_endpoints", "secret", w["id"], w["secret_enc"])
    secret = crypto.webhook_secret()
    w = conn.execute("UPDATE webhook_endpoints SET secret_enc=%s, secret_fp=%s, prev_secret_enc=%s, prev_expires_at=%s WHERE id=%s RETURNING *",
                     (crypto.encrypt("webhook_endpoints", "secret", w["id"], secret), crypto.sha256_hex(secret.encode())[:8],
                      crypto.encrypt("webhook_endpoints", "prev_secret", w["id"], old),
                      datetime.now(timezone.utc) + ROTATION_OVERLAP, w["id"])).fetchone()
    return endpoint_out(w) | {"secret": secret}


def deliveries(conn, endpoint_id: int, cursor: int, limit: int) -> dict:
    _get(conn, endpoint_id)
    rows = conn.execute("SELECT * FROM webhook_deliveries WHERE endpoint_id=%s AND id > %s ORDER BY id LIMIT %s",
                        (endpoint_id, cursor, limit + 1)).fetchall()
    return {"items": rows[:limit], "next_cursor": rows[limit - 1]["id"] if len(rows) > limit else None}


def redeliver(conn, delivery_id: int) -> dict:
    d = conn.execute("SELECT d.*, w.active FROM webhook_deliveries d JOIN webhook_endpoints w ON w.id = d.endpoint_id "
                     "WHERE d.id=%s", (delivery_id,)).fetchone()
    if d is None:
        raise HTTPException(404, "Delivery not found")
    if not d["active"]:
        raise HTTPException(409, "Webhook is deactivated")
    return conn.execute("UPDATE webhook_deliveries SET status='pending', next_attempt_at=now() WHERE id=%s RETURNING *",
                        (delivery_id,)).fetchone()
