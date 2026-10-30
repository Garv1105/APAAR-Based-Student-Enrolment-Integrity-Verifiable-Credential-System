import re
import secrets

import psycopg
from argon2 import PasswordHasher
from fastapi import HTTPException

from . import auth, crypto
from .ingest import current_year

SUPPRESS_BELOW = 10
ACTIVATE_FAILED = "Account ID and code don't match, or the code has expired or was already used"


def _ip(request) -> str:
    return request.client.host if request is not None and request.client else "unknown"


def _rid(request):
    return request.state.request_id if request is not None else None


def public_stats(conn, request=None) -> dict:
    auth.throttle("pubstats:" + _ip(request), 120, 60)
    year = current_year(conn)["code"]
    s = conn.execute("SELECT public_stats(%s) s", (year,)).fetchone()["s"]
    states = [{**st, "students": st["students"] if st["students"] >= SUPPRESS_BELOW else None} for st in s["states"]]
    return {"academic_year": year, "institutions_approved": s["institutions_approved"],
            "institutions_reporting": s["institutions_reporting"], "students_recorded": s["students_recorded"],
            "states_covered": sum(1 for st in s["states"] if st["reporting"]), "credentials_issued": s["credentials_issued"],
            "states": states}


def search(conn, q: str | None, state: str | None, kind: str, limit: int, request=None) -> list[dict]:
    auth.throttle("pubsearch:" + _ip(request), 120, 60)
    q = (q or "").strip()[:80] or None
    if q is not None and len(q) < 2:
        return []
    if q is None and not state and kind == "institution":
        return []
    like = re.sub(r"([\\%_])", r"\\\1", q) if q else None
    return conn.execute("SELECT * FROM public_account_search(%s, %s, %s, %s)", (like, state or None, kind, limit)).fetchall()


def _code_error(conn, err: psycopg.Error):
    conn.rollback()
    if err.sqlstate == "P0002":
        return HTTPException(404, "Account not found")
    if err.sqlstate == "P0003":
        return HTTPException(422, "Idempotency-Key was already used with a different request body")
    return None


def issue_code(conn, user: dict, user_id: str, reason: str, idem_key: str | None, request_hash: str, request=None,
               commit: bool = True) -> dict:
    code = crypto.activation_code()
    try:
        r = conn.execute("SELECT * FROM issue_account_code(%s, %s, %s, %s, %s)",
                         (user_id, crypto.activation_code_hash(code), reason, idem_key, request_hash)).fetchone()
    except psycopg.Error as err:
        if (e := _code_error(conn, err)) is not None:
            raise e from None
        raise
    out = {"user_id": r["user_id"], "display_name": r["display_name"], "expires_at": r["expires_at"]}
    if r["replay"]:
        return out | {"status": "already_issued", "code": None}
    auth.audit(conn, user, "account_code.issue", "account_code", r["code_id"], reason=f"{user_id}: {reason}", request=request)
    if commit:
        conn.commit()
    return out | {"status": "issued", "code": code}


def activate(conn, user_id: str, code: str, password: str, request=None) -> dict:
    auth.throttle("acctip:" + _ip(request), 20, 15 * 60)
    key = "acct:" + user_id
    auth.throttle(key, 5, 15 * 60)
    pw_hash = PasswordHasher().hash(password)
    r = conn.execute("SELECT * FROM redeem_account_code(%s, %s, %s, %s)",
                     (user_id, crypto.activation_code_hash(code), pw_hash, _rid(request))).fetchone()
    conn.commit()
    if r is None:
        raise HTTPException(401, ACTIVATE_FAILED)
    auth.clear_throttle(key)
    return {"user_id": r["user_id"], "role": r["role"]}


def create_request(conn, body: dict, request=None) -> dict:
    auth.throttle("accreq:" + _ip(request), 5, 60 * 60)
    rid = conn.execute("SELECT nextval('access_requests_id_seq') id").fetchone()["id"]
    conn.execute("SELECT create_access_request(%s, %s, %s, %s, %s, %s)",
                 (rid, body["organisation"].strip(), crypto.encrypt("access_requests", "contact_name", rid, body["contact_name"].strip()),
                  crypto.encrypt("access_requests", "contact_email", rid, body["contact_email"]), body["purpose"].strip(), _rid(request)))
    conn.commit()
    return {"id": rid, "status": "pending"}


def _out(r: dict) -> dict:
    return {k: r[k] for k in ("id", "organisation", "purpose", "status", "decided_by", "decision_reason", "decided_at", "user_id",
                              "created_at")} | {
        "contact_name": crypto.decrypt("access_requests", "contact_name", r["id"], r["contact_name_enc"]),
        "contact_email": crypto.decrypt("access_requests", "contact_email", r["id"], r["contact_email_enc"])}


def list_requests(conn, user: dict, request=None) -> list[dict]:
    rows = conn.execute("SELECT * FROM access_requests ORDER BY (status = 'pending') DESC, id DESC LIMIT 200").fetchall()
    for r in rows:
        auth.audit(conn, user, "access_request.read", "access_request", r["id"], request=request)
    conn.commit()
    return [_out(r) for r in rows]


def _verifier_id(org: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", org.lower()).strip("-")[:24].strip("-") or "verifier"
    return f"{slug}-{secrets.token_hex(2)}"


def decide(conn, user: dict, req_id: int, decision: str, reason: str, request=None) -> dict:
    cur = conn.execute("SELECT status FROM access_requests WHERE id=%s", (req_id,)).fetchone()
    if cur is None:
        raise HTTPException(404, "Access request not found")
    if cur["status"] != "pending":
        if cur["status"] != decision:
            raise HTTPException(409, f"Request was already {cur['status']}")
        r = conn.execute("SELECT * FROM access_requests WHERE id=%s", (req_id,)).fetchone()
        return {"request": _out(r), "account": None, "replayed": True}
    new_user = _verifier_id(conn.execute("SELECT organisation FROM access_requests WHERE id=%s", (req_id,)).fetchone()["organisation"])
    r = conn.execute("SELECT * FROM decide_access_request(%s, %s, %s, %s)", (req_id, decision, reason, new_user)).fetchone()
    if r["status"] != decision:
        conn.rollback()
        raise HTTPException(409, f"Request was already {r['status']}")
    auth.audit(conn, user, f"access_request.{decision}", "access_request", req_id, reason=reason, request=request)
    account = None
    if decision == "approved":
        account = issue_code(conn, user, new_user, f"access request #{req_id} approved: {reason}", None,
                             crypto.sha256_hex(f"accreq|{req_id}".encode()), request, commit=False)
    conn.commit()
    return {"request": _out(r), "account": account, "replayed": False}
