"""APAAR ERP connector: push a college ERP export to the platform and receive signed webhooks.

    python connector.py push --mapping example/mapping.yaml example/erp_export.csv --user inst-a
    python connector.py receive --port 8787

The password comes from APAAR_PASSWORD or a prompt (never a command-line argument, which would show in the
process list and shell history). The webhook secret comes from APAAR_WEBHOOK_SECRET or a prompt.
Output is counts, codes and ids only: the connector never prints row data.
"""
import argparse
import base64
import csv
import getpass
import hashlib
import hmac
import io
import json
import os
import sys
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import httpx
import yaml

TOLERANCE = 300  # seconds; Standard Webhooks recommends 5 minutes
MAX_BODY = 1_000_000


# ---------- push ----------
def load_rows(path: Path) -> list[dict]:
    raw = path.read_bytes()
    if path.suffix.lower() == ".json":
        data = json.loads(raw)
        return data["rows"] if isinstance(data, dict) else data
    text = raw.decode("utf-8-sig")
    dialect = csv.Sniffer().sniff(text.splitlines()[0], delimiters=",;\t")
    return list(csv.DictReader(io.StringIO(text), dialect=dialect))


def map_rows(rows: list[dict], mapping: dict, header: list[str]) -> list[dict]:
    cols, values = mapping.get("columns", {}), mapping.get("values", {})
    defaults, dates = mapping.get("defaults", {}), set(mapping.get("dates", []))
    if unknown := (set(cols) | set(values) | set(defaults) | dates) - set(header):
        raise SystemExit(f"mapping names columns the API does not accept: {sorted(unknown)}")
    out = []
    for row in rows:
        r = {}
        for target in header:
            v = str(row.get(cols[target], "") if target in cols else "").strip()
            v = str(values.get(target, {}).get(v, v))
            if v and target in dates and mapping.get("date_format"):
                v = datetime.strptime(v, mapping["date_format"]).date().isoformat()
            r[target] = v or str(defaults.get(target, ""))
        out.append(r)
    return out


def push(path: Path, mapping_path: Path, api: str, user: str, password: str, client: httpx.Client | None = None) -> dict:
    mapping = yaml.safe_load(mapping_path.read_text(encoding="utf-8"))
    # same export + same mapping = same key, so a re-run is a no-op on the server
    key = "erp-" + hashlib.sha256(path.read_bytes() + b"\0" + mapping_path.read_bytes()).hexdigest()[:48]
    c = client or httpx.Client(base_url=api, timeout=120)
    r = c.post("/v1/auth/login", json={"user_id": user, "password": password})
    if r.status_code != 200:
        raise SystemExit(f"login failed: HTTP {r.status_code}")
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    header = c.get("/v1/batches/template.csv", headers=h).text.splitlines()[0].split(",")
    rows = map_rows(load_rows(path), mapping, header)
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=header)
    w.writeheader()
    w.writerows(rows)
    r = c.post("/v1/batches", files={"file": ("erp_export.csv", buf.getvalue().encode(), "text/csv")},
               headers=h | {"Idempotency-Key": key})
    if r.status_code not in (200, 201):
        raise SystemExit(f"upload failed: HTTP {r.status_code} {r.json().get('title', '')}")
    return r.json()


# ---------- receive ----------
def verify(secret: str, headers: dict, body: bytes, now: int | None = None, seen: set | None = None) -> tuple[bool, str]:
    """Standard Webhooks v1 check. `headers` keys are lower-case."""
    try:
        msg_id, ts, sigs = headers["webhook-id"], int(headers["webhook-timestamp"]), headers["webhook-signature"]
    except (KeyError, ValueError):
        return False, "missing webhook headers"
    now = int(time.time()) if now is None else now
    if abs(now - ts) > TOLERANCE:
        return False, "stale timestamp"
    key = base64.b64decode(secret.removeprefix("whsec_"))
    expected = base64.b64encode(hmac.new(key, f"{msg_id}.{ts}.".encode() + body, hashlib.sha256).digest()).decode()
    if not any(s.startswith("v1,") and hmac.compare_digest(s[3:], expected) for s in sigs.split()):
        return False, "bad signature"
    if seen is not None:
        if msg_id in seen:
            return False, "replayed event id"
        seen.add(msg_id)  # ponytail: in-memory; a real receiver keeps seen ids for at least the tolerance window
    return True, "ok"


def make_server(port: int, secret: str, on_event=None, host: str = "127.0.0.1") -> HTTPServer:
    seen: set[str] = set()

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            n = int(self.headers.get("content-length") or 0)
            if n > MAX_BODY:
                self.send_response(413)
                self.end_headers()
                return
            body = self.rfile.read(n)
            ok, why = verify(secret, {k.lower(): v for k, v in self.headers.items()}, body, seen=seen)
            self.send_response(204 if ok else 401)
            self.end_headers()
            event = json.loads(body) if ok else None
            if on_event:
                on_event(ok, why, event)
            else:
                print(f"{'VERIFIED' if ok else 'REJECTED'} {why}: " + (f"{event['type']} {json.dumps(event['data'])}" if ok else ""), flush=True)

        def log_message(self, *a):  # quiet: no request lines in the console
            pass

    return HTTPServer((host, port), Handler)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("push", help="map an ERP export and upload it as a batch")
    p.add_argument("export", type=Path)
    p.add_argument("--mapping", type=Path, required=True)
    p.add_argument("--api", default="http://127.0.0.1:8000")
    p.add_argument("--user", required=True)
    r = sub.add_parser("receive", help="run a local webhook receiver that verifies signatures")
    r.add_argument("--port", type=int, default=8787)
    a = ap.parse_args(argv)
    if a.cmd == "push":
        pw = os.environ.get("APAAR_PASSWORD") or getpass.getpass(f"Password for {a.user}: ")
        out = push(a.export, a.mapping, a.api, a.user, pw)
        print(f"batch #{out['batch_id']}{' (replayed: already uploaded)' if out.get('replayed') else ''}: "
              + ", ".join(f"{k} {v}" for k, v in out["counts"].items()))
    else:
        secret = os.environ.get("APAAR_WEBHOOK_SECRET") or getpass.getpass("Webhook secret (whsec_...): ")
        print(f"listening on http://127.0.0.1:{a.port}/  (Ctrl+C to stop)", flush=True)
        try:
            make_server(a.port, secret).serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    sys.exit(main())
