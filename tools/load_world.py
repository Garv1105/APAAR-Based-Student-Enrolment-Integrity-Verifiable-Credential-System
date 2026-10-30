import argparse
import hashlib
import json
import pathlib
from datetime import datetime

import httpx

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="http://127.0.0.1:8000")
ap.add_argument("--dir", required=True, help="world folder holding manifest.json")
ap.add_argument("--limit", type=int, default=0, help="stop after N uploads (0 = all)")
a = ap.parse_args()
root = pathlib.Path(a.dir)
m = json.loads((root / "manifest.json").read_text())
c, tokens, done, failed, clock_warned = httpx.Client(base_url=a.base, timeout=120), {}, 0, 0, False


def tok(user):
    if user not in tokens:
        r = c.post("/v1/auth/login", json={"user_id": user, "password": m["password"]})
        r.raise_for_status()
        tokens[user] = r.json()["access_token"]
    return {"Authorization": f"Bearer {tokens[user]}"}


for step in m["steps"]:
    if step["op"] == "upload":
        data = (root / step["file"]).read_bytes()
        h = {**tok(step["user"]), "Idempotency-Key": hashlib.sha256(data).hexdigest(), "X-Demo-Upload-Time": step["planned_upload_at"]}
        r = c.post("/v1/batches", headers=h, files={"file": (pathlib.Path(step["file"]).name, data, "text/csv")})
        if r.status_code not in (200, 201):
            failed += 1
            print("FAILED", step["file"], r.status_code, r.text[:300])
            continue
        b = r.json()
        done += 1
        if not clock_warned and datetime.fromisoformat(b["created_at"]) != datetime.fromisoformat(step["planned_upload_at"]):
            clock_warned = True
            print("WARNING: server ignored X-Demo-Upload-Time (start the API with DEMO_MODE=true); deadline faults won't show")
        print(f"{done:4d} {step['user']:<20} {b['counts']}")
        if a.limit and done >= a.limit:
            break
    elif step["op"] == "patch":
        r = c.get("/v1/enrolments", headers=tok(step["user"]), params={"apaar": step["apaar"]})
        ids = [e["id"] for e in r.json() if e["status"] == "active"] if r.status_code == 200 else []
        if len(ids) != 1:
            failed += 1
            print("PATCH skipped (enrolment lookup)", step["user"], r.status_code, f"{len(ids)} active matches")
            continue
        r = c.patch(f"/v1/enrolments/{ids[0]}", headers=tok(step["user"]), json=step["body"])
        failed += r.status_code != 200
        print("patch", step["user"], r.status_code, "" if r.status_code == 200 else r.text[:300])
print(f"done: {done} uploads, {failed} failures")
