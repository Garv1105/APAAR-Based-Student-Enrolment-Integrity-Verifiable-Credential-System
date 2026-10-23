"""Demo seed (T8.1): `python -m app.demo` rebuilds the demo database `apaar` and replays the labelled scenario
through the real API (no shortcuts past validation, RLS, ledger or audit). Idempotent: every run starts from empty.

Result: A clean, B messy (errors, excess, duplicates), C enrolment spike, D closed institution, a post-deadline
backdated withdrawal (E501), open duplicate cases, one student with an Enrolment credential and a pending consent request.

`--live`: leave Institution B out so the presenter uploads data/synthetic/B1.csv on stage (errors, excess, and the
cross-institution duplicates with A open live). The E501 event is then recorded on an A student instead.
"""
import json
import sys
from pathlib import Path

import os

from fastapi.testclient import TestClient

from . import db, seed

os.environ.setdefault("WEBHOOK_DISPATCH", "off")  # the seed registers no webhooks; no poller thread needed
SYN = Path(__file__).resolve().parent.parent / "data/synthetic"
LIVE_E501 = "277145114059"  # A/CSE/2026/0013, withdrawn after the deadline in --live mode
STUDENT = {"apaar": "328865551724", "dob": "2006-11-05", "name": "Asha Joshi"}  # A/ECE/2026/0081 in A1.csv


def _ok(r, *codes):
    if r.status_code not in codes:
        sys.exit(f"demo seed failed: {r.request.method} {r.request.url.path} -> {r.status_code} {r.text[:300]}")
    return r.json()


def run(live: bool = False) -> dict:
    sys.argv.append("--reset")
    seed.main()
    from .main import app  # after the schema exists
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
        if live:  # deadline is now in the past: record one backdated withdrawal (E501) on an A student
            e = _ok(c.get("/v1/enrolments", params={"apaar": LIVE_E501}, headers=h("inst-a")), 200)[0]
            _ok(c.patch(f"/v1/enrolments/{e['id']}", json={"status": "withdrawn", "ended_on": "2026-09-01",
                                                           "reason": "Backdated withdrawal"}, headers=h("inst-a")), 200)
        # scenario ends with the deadline in the past (to record E501); restore the real one so live edits behave normally
        real = next(y for y in json.loads(seed.SEED.read_text())["academic_years"] if y["code"] == "2026-27")
        set_deadline("2026-27", real["deadline"])

        e = _ok(c.get("/v1/enrolments", params={"apaar": STUDENT["apaar"]}, headers=h("inst-a")), 200)[0]
        vc = _ok(c.post(f"/v1/credentials/{e['id']}/issue", json={"type": "EnrolmentCredential"}, headers=h("inst-a")), 201)
        _ok(c.post("/v1/consents/requests", json={"apaar_id": STUDENT["apaar"], "purpose": "Pre-employment education check",
                                                  "fields": ["name", "programme", "institution", "status"]}, headers=h("employer")), 201)
        _ok(c.post("/v1/ledger/checkpoints", headers=h("aicte")), 200)
        aicte = _ok(c.get("/v1/dashboard/aicte", headers=h("aicte")), 200)

    return {"credential_id": vc["id"], "open_cases": aicte["open_cases"], "excess_seats": aicte["totals"]["excess_seats"],
            "active_enrolments": aicte["totals"]["active_enrolments"], "post_deadline_mutations": aicte["totals"]["post_deadline_mutations"]}


if __name__ == "__main__":
    live = "--live" in sys.argv
    out = run(live)
    print(f"""
Demo database ready (MOCK data).
  Staff logins (password: demo): inst-a, inst-b, inst-c, inst-d, aicte, auditor, employer, univ
  Student: APAAR {STUDENT['apaar']}  DOB {STUDENT['dob']}  ({STUDENT['name']}); consent OTP 123456
  Enrolment credential: {out['credential_id']} (pending consent request from employer)
  AICTE: {out['active_enrolments']} active enrolments, {out['excess_seats']} excess seats, {out['open_cases']} open duplicate cases,
         {out['post_deadline_mutations']} post-deadline change(s) (E501)""")
    if live:
        print("  LIVE mode: Institution B has not uploaded. Sign in as inst-b and upload backend/data/synthetic/B1.csv")
