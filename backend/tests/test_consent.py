"""T5.5, T5.6, T5.9: consent requests, consent-scoped VerificationCredentials (D5), student access log (D6)."""
import csv
from datetime import date
from pathlib import Path

from argon2 import PasswordHasher

from conftest import login
from test_api import upload

SYN = Path(__file__).resolve().parent.parent / "data/synthetic"
OTP = "123456"


def rows(name):
    return list(csv.DictReader(open(SYN / name, encoding="utf-8")))


def student(client, apaar):
    r = client.post("/v1/auth/student-login", json={"apaar_id": apaar, "otp": OTP})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def adult_a_student(client):
    upload(client, "inst-a", "A1.csv")
    return next(r for r in rows("A1.csv") if r["apaar_id"] and date.fromisoformat(r["dob"]) < date(2008, 1, 1))


def request_consent(client, apaar, fields=("name", "programme", "institution"), user="employer"):
    return client.post("/v1/consents/requests", headers=login(client, user),
                       json={"apaar_id": apaar, "purpose": "Pre-employment education check", "fields": list(fields)})


def verify(client, vc):
    return client.post("/v1/verify", json={"credential": vc}, headers=login(client, "employer")).json()["result"]


def test_full_consent_flow_minimal_fields_and_transparency_log(client):
    r = adult_a_student(client)
    req = request_consent(client, r["apaar_id"])
    assert req.status_code == 201 and req.json()["status"] == "pending"
    cid = req.json()["id"]
    hs = student(client, r["apaar_id"])
    inbox = client.get("/v1/consents", headers=hs).json()
    assert [c["id"] for c in inbox] == [cid] and inbox[0]["requester"].startswith("Acme Hiring")
    assert client.get(f"/v1/consents/{cid}/credential", headers=login(client, "employer")).status_code == 409  # not yet granted

    ok = client.post(f"/v1/consents/{cid}/approve", json={"otp": OTP}, headers=hs)
    assert ok.status_code == 200, ok.text
    subj = ok.json()["credential"]["credentialSubject"]
    assert set(subj) == {"name", "programme", "institution", "consent"}   # D5: only the approved fields
    assert subj["name"] == r["student_name"] and subj["consent"]["purpose"].startswith("Pre-employment")
    assert ok.json()["consent"]["granted_by"] == "student"

    vc = client.get(f"/v1/consents/{cid}/credential", headers=login(client, "employer")).json()
    assert vc == ok.json()["credential"] and verify(client, vc) == "VALID"

    log = client.get("/v1/students/me/access-log", headers=hs).json()
    actions = {(e["action"], e["actor"]) for e in log}
    assert {("consent.request", "employer"), ("credential.verify", "employer")} <= actions
    assert any(e["action"] == "consent.grant" for e in log)
    assert any(e["reason"] == "consent-credential-fetch" for e in log)
    client.get("/v1/credentials", headers=hs)  # the student's own wallet views don't clutter their access log
    assert not any(e["action"] == "credential.read" and e["role"] == "student"
                   for e in client.get("/v1/students/me/access-log", headers=hs).json())
    me = client.get("/v1/students/me", headers=hs).json()
    assert me["apaar_masked"].endswith(r["apaar_id"][-4:]) and me["enrolments"][0]["institution_student_id"] == r["institution_student_id"]


def test_refusals_wrong_otp_denied_revoked_expired(client, dbconn):
    r = adult_a_student(client)
    hs = student(client, r["apaar_id"])
    he = login(client, "employer")
    # wrong OTP, then deny
    c1 = request_consent(client, r["apaar_id"]).json()["id"]
    assert client.post(f"/v1/consents/{c1}/approve", json={"otp": "000000"}, headers=hs).status_code == 401
    assert client.post(f"/v1/consents/{c1}/deny", headers=hs).json()["status"] == "denied"
    assert client.get(f"/v1/consents/{c1}/credential", headers=he).status_code == 409
    assert client.post(f"/v1/consents/{c1}/approve", json={"otp": OTP}, headers=hs).status_code == 409
    # granted, then revoked: fetch refused and the credential now verifies as REVOKED
    c2 = request_consent(client, r["apaar_id"], ("status", "apaar_id", "student_id")).json()["id"]
    vc = client.post(f"/v1/consents/{c2}/approve", json={"otp": OTP}, headers=hs).json()["credential"]
    assert set(vc["credentialSubject"]) == {"status", "apaarId", "studentId", "consent"}
    assert client.post(f"/v1/consents/{c2}/revoke", headers=hs).json()["status"] == "revoked"
    assert client.get(f"/v1/consents/{c2}/credential", headers=he).status_code == 403
    assert verify(client, vc) == "REVOKED"
    # expired: pending can't be approved, granted can't be fetched
    c3 = request_consent(client, r["apaar_id"]).json()["id"]
    c4 = request_consent(client, r["apaar_id"]).json()["id"]
    client.post(f"/v1/consents/{c4}/approve", json={"otp": OTP}, headers=hs)
    dbconn.execute("UPDATE consents SET expires_at = now() - interval '1 minute' WHERE id IN (%s, %s)", (c3, c4))
    dbconn.commit()
    assert client.post(f"/v1/consents/{c3}/approve", json={"otp": OTP}, headers=hs).status_code == 409
    assert client.get(f"/v1/consents/{c4}/credential", headers=he).status_code == 410
    statuses = {c["id"]: c["status"] for c in client.get("/v1/consents", headers=hs).json()}
    assert statuses == {c1: "denied", c2: "revoked", c3: "expired", c4: "expired"}


def test_isolation_between_verifiers_and_students(client, dbconn):
    r = adult_a_student(client)
    other = next(x for x in rows("A1.csv") if x["apaar_id"] and x["apaar_id"] != r["apaar_id"])
    dbconn.execute("INSERT INTO users (id, role, display_name, password_hash) VALUES ('employer2', 'verifier', 'Other Co', %s)",
                   (PasswordHasher().hash("demo"),))
    dbconn.commit()
    cid = request_consent(client, r["apaar_id"]).json()["id"]
    client.post(f"/v1/consents/{cid}/approve", json={"otp": OTP}, headers=student(client, r["apaar_id"]))
    assert client.get(f"/v1/consents/{cid}/credential", headers=login(client, "employer2")).status_code == 404
    assert client.get("/v1/consents", headers=login(client, "employer2")).json() == []
    ho = student(client, other["apaar_id"])
    assert client.get("/v1/consents", headers=ho).json() == []
    assert client.post(f"/v1/consents/{cid}/revoke", headers=ho).status_code == 404
    assert request_consent(client, "999999999999").status_code == 404
    assert request_consent(client, r["apaar_id"], user="aicte").status_code == 403


def test_verification_credentials_belong_to_the_student_not_the_institution(client):
    r = adult_a_student(client)
    cid = request_consent(client, r["apaar_id"]).json()["id"]
    vc = client.post(f"/v1/consents/{cid}/approve", json={"otp": OTP}, headers=student(client, r["apaar_id"])).json()["credential"]
    ha = login(client, "inst-a")
    assert all(c["type"] != "VerificationCredential" for c in client.get("/v1/credentials", headers=ha).json())
    st = {"credential_id": vc["id"], "purpose": "suspension", "value": True, "reason": "test"}
    assert client.post("/v1/credentials/status", json=st, headers=ha).status_code == 404
    assert verify(client, vc) == "VALID"
    # the verifier doesn't learn who approved (guardian would reveal the student is a minor)
    assert all(c["granted_by"] is None for c in client.get("/v1/consents", headers=login(client, "employer")).json())


def test_purpose_text_is_bounded(client):
    r = adult_a_student(client)
    for purpose in ("x" * 201, "Click <a href=//evil>here</a>"):
        resp = client.post("/v1/consents/requests", headers=login(client, "employer"),
                           json={"apaar_id": r["apaar_id"], "purpose": purpose, "fields": ["name"]})
        assert resp.status_code == 422


def test_under_18_needs_guardian(client):
    upload(client, "inst-b", "B1.csv")
    young = next(r for r in rows("B1.csv") if r["apaar_id"] and r["dob"] >= "2012-01-01")
    cid = request_consent(client, young["apaar_id"]).json()["id"]
    hs = student(client, young["apaar_id"])
    assert client.post(f"/v1/consents/{cid}/approve", json={"otp": OTP}, headers=hs).status_code == 403
    assert client.post(f"/v1/consents/{cid}/approve", json={"otp": OTP, "approved_by": "guardian", "guardian_otp": "1"},
                       headers=hs).status_code == 403
    ok = client.post(f"/v1/consents/{cid}/approve", json={"otp": OTP, "approved_by": "guardian", "guardian_otp": OTP}, headers=hs)
    assert ok.status_code == 200 and ok.json()["consent"]["granted_by"] == "guardian"


def test_withdrawal_revokes_verification_credentials(client):
    r = adult_a_student(client)
    cid = request_consent(client, r["apaar_id"]).json()["id"]
    vc = client.post(f"/v1/consents/{cid}/approve", json={"otp": OTP}, headers=student(client, r["apaar_id"])).json()["credential"]
    e = client.get("/v1/enrolments", params={"apaar": r["apaar_id"]}, headers=login(client, "inst-a")).json()[0]
    client.patch(f"/v1/enrolments/{e['id']}", json={"status": "withdrawn", "reason": "left"}, headers=login(client, "inst-a"))
    assert verify(client, vc) == "REVOKED"
