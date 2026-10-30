import json
import re
import sys
from pathlib import Path

import os

from fastapi.testclient import TestClient

from . import db, seed

os.environ.setdefault("WEBHOOK_DISPATCH", "off")
SYN = Path(__file__).resolve().parent.parent / "data/synthetic"
LIVE_E501 = "277145114059"
STUDENT = {"apaar": "328865551724", "dob": "2006-11-05", "name": "Asha Joshi"}


def _ok(r, *codes):
    if r.status_code not in codes:
        sys.exit(f"demo seed failed: {r.request.method} {r.request.url.path} -> {r.status_code} {r.text[:300]}")
    return r.json()


def demo_env() -> str:
    text = db.ENV_FILE.read_text(encoding="utf-8") if db.ENV_FILE.exists() else ""
    m = re.search(r"^PASSKEY_FIRST_COOLDOWN_HOURS=(.*)$", text, re.M)
    if m is None:
        with open(db.ENV_FILE, "a", encoding="utf-8") as f:
            f.write("\n# demo: a first passkey may approve consent at once (production default: 24 h)\nPASSKEY_FIRST_COOLDOWN_HOURS=0\n")
        return "0 (written to backend/.env)"
    return f"{m.group(1).strip()} (from backend/.env; 0 lets a first passkey approve at once)"


def run(live: bool = False) -> dict:
    sys.argv.append("--reset")
    seed.main()
    from .main import app
    tokens = {}

    with TestClient(app) as c:
        def h(user):
            if user not in tokens:
                tokens[user] = _ok(c.post("/v1/auth/login", json={"user_id": user, "password": seed.DEMO_PASSWORD}), 200)["access_token"]
            return {"Authorization": f"Bearer {tokens[user]}"}

        def set_deadline(year, deadline):
            with db.connect() as conn:
                conn.execute("UPDATE academic_years SET deadline=%s WHERE code=%s", (deadline, year))
                conn.commit()

        for step in json.loads((SYN / "scenario.json").read_text())["steps"]:
            if live and step.get("user") == "inst-b":
                continue
            if step["op"] == "set_deadline":
                set_deadline(step["academic_year"], step["deadline"])
            elif step["op"] == "upload":
                _ok(c.post("/v1/batches", files={"file": (step["file"], (SYN / step["file"]).read_bytes(), "text/csv")},
                           headers=h(step["user"])), 201)
            elif step["op"] == "patch":
                e = _ok(c.get("/v1/enrolments", params={"apaar": step["apaar"]}, headers=h(step["user"])), 200)[0]
                _ok(c.patch(f"/v1/enrolments/{e['id']}", json=step["body"], headers=h(step["user"])), 200)
        if live:
            e = _ok(c.get("/v1/enrolments", params={"apaar": LIVE_E501}, headers=h("inst-a")), 200)[0]
            _ok(c.patch(f"/v1/enrolments/{e['id']}", json={"status": "withdrawn", "ended_on": "2026-09-01",
                                                           "reason": "Backdated withdrawal"}, headers=h("inst-a")), 200)
        real = next(y for y in json.loads(seed.SEED.read_text())["academic_years"] if y["code"] == "2026-27")
        set_deadline("2026-27", real["deadline"])

        e = _ok(c.get("/v1/enrolments", params={"apaar": STUDENT["apaar"]}, headers=h("inst-a")), 200)[0]
        vc = _ok(c.post(f"/v1/credentials/{e['id']}/issue", json={"type": "EnrolmentCredential"}, headers=h("inst-a")), 201)
        act = _ok(c.post(f"/v1/enrolments/{e['id']}/activation-code", json={"kind": "student", "reason": "Demo: first passkey activation"},
                         headers=h("inst-a")), 200)
        _ok(c.post("/v1/consents/requests", json={"apaar_id": STUDENT["apaar"], "purpose": "Pre-employment education check",
                                                  "fields": ["name", "programme", "institution", "status"]}, headers=h("employer")), 201)
        _ok(c.post("/v1/ledger/checkpoints", headers=h("aicte")), 200)
        aicte = _ok(c.get("/v1/dashboard/aicte", headers=h("aicte")), 200)

    return {"credential_id": vc["id"], "activation_code": act["code"], "open_cases": aicte["open_cases"], "excess_seats": aicte["totals"]["excess_seats"],
            "active_enrolments": aicte["totals"]["active_enrolments"], "post_deadline_mutations": aicte["totals"]["post_deadline_mutations"]}


if __name__ == "__main__":
    live = "--live" in sys.argv
    cooldown = demo_env() if live else None
    out = run(live)
    print(f"""
Demo database ready (MOCK data).
  Staff logins (password: demo): inst-a, inst-b, inst-c, inst-d, aicte, auditor, employer, univ
  Student: APAAR {STUDENT['apaar']} ({STUDENT['name']}), passkey activation code {out['activation_code']}
           (open http://localhost:5173, not 127.0.0.1). Fallback: start the API with DEMO_MODE=true for the MOCK
           DOB sign-in ({STUDENT['dob']}) and OTP 123456.
  Enrolment credential: {out['credential_id']} (pending consent request from employer)
  AICTE: {out['active_enrolments']} active enrolments, {out['excess_seats']} excess seats, {out['open_cases']} open duplicate cases,
         {out['post_deadline_mutations']} post-deadline change(s) (E501)""")
    if live:
        print("  LIVE mode: Institution B has not uploaded. Sign in as inst-b and upload backend/data/synthetic/B1.csv")
        print(f"  PASSKEY_FIRST_COOLDOWN_HOURS = {cooldown}")
