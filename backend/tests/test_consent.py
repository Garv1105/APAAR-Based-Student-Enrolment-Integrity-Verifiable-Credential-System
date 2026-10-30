import csv
from datetime import date
from pathlib import Path

from argon2 import PasswordHasher

from conftest import login, student_headers
from test_api import upload

SYN = Path(__file__).resolve().parent.parent / "data/synthetic"
OTP = "123456"


def rows(name):
    return list(csv.DictReader(open(SYN / name, encoding="utf-8")))


def student(client, apaar):
    return student_headers(client, apaar)


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
    assert [c["id"] for c in inbox] == [cid] and inbox[0]["requester"].startswith("Kaveri Talent Solutions")
    assert client.get(f"/v1/consents/{cid}/credential", headers=login(client, "employer")).status_code == 409

    ok = client.post(f"/v1/consents/{cid}/approve", json={"otp": OTP}, headers=hs)
    assert ok.status_code == 200, ok.text
    subj = ok.json()["credential"]["credentialSubject"]
    assert set(subj) == {"name", "programme", "institution", "consent"}
    assert subj["name"] == r["student_name"] and subj["consent"]["purpose"].startswith("Pre-employment")
    assert ok.json()["consent"]["granted_by"] == "student"

    vc = client.get(f"/v1/consents/{cid}/credential", headers=login(client, "employer")).json()
    assert vc == ok.json()["credential"] and verify(client, vc) == "VALID"

    log = client.get("/v1/students/me/access-log", headers=hs).json()
    actions = {(e["action"], e["actor"]) for e in log}
    assert {("consent.request", "employer"), ("credential.verify", "employer")} <= actions
    assert any(e["action"] == "consent.grant" for e in log)
    assert any(e["reason"] == "consent-credential-fetch" for e in log)
    client.get("/v1/credentials", headers=hs)
    assert not any(e["action"] == "credential.read" and e["role"] == "student"
                   for e in client.get("/v1/students/me/access-log", headers=hs).json())
    me = client.get("/v1/students/me", headers=hs).json()
    assert me["apaar_masked"].endswith(r["apaar_id"][-4:]) and me["enrolments"][0]["institution_student_id"] == r["institution_student_id"]


def test_refusals_wrong_otp_denied_revoked_expired(client, dbconn):
    r = adult_a_student(client)
    hs = student(client, r["apaar_id"])
    he = login(client, "employer")
    c1 = request_consent(client, r["apaar_id"]).json()["id"]
    assert client.post(f"/v1/consents/{c1}/approve", json={"otp": "000000"}, headers=hs).status_code == 401
    assert client.post(f"/v1/consents/{c1}/deny", headers=hs).json()["status"] == "denied"
    assert client.get(f"/v1/consents/{c1}/credential", headers=he).status_code == 409
    assert client.post(f"/v1/consents/{c1}/approve", json={"otp": OTP}, headers=hs).status_code == 409
    c2 = request_consent(client, r["apaar_id"], ("status", "apaar_id", "student_id")).json()["id"]
    vc = client.post(f"/v1/consents/{c2}/approve", json={"otp": OTP}, headers=hs).json()["credential"]
    assert set(vc["credentialSubject"]) == {"status", "apaarId", "studentId", "consent"}
    assert client.post(f"/v1/consents/{c2}/revoke", headers=hs).json()["status"] == "revoked"
    assert client.get(f"/v1/consents/{c2}/credential", headers=he).status_code == 403
    assert verify(client, vc) == "REVOKED"
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
    assert request_consent(client, r["apaar_id"], user="aicte").status_code == 403


VARYING = {"id", "requested_at", "expires_at"}


def test_registered_and_unregistered_apaar_look_identical_to_the_verifier(client, dbconn):
    r = adult_a_student(client)
    real = request_consent(client, r["apaar_id"])
    fake = request_consent(client, "999999999999")
    assert real.status_code == fake.status_code == 201
    strip = lambda d: {k: v for k, v in d.items() if k not in VARYING}  # noqa: E731
    assert strip(real.json()) == strip(fake.json())
    assert set(real.json()) == set(fake.json()) and "student_id" not in real.json()
    he = login(client, "employer")
    listed = {c["id"]: strip(c) for c in client.get("/v1/consents", headers=he).json()}
    assert listed[real.json()["id"]] == listed[fake.json()["id"]]
    f1 = client.get(f"/v1/consents/{real.json()['id']}/credential", headers=he)
    f2 = client.get(f"/v1/consents/{fake.json()['id']}/credential", headers=he)
    assert f1.status_code == f2.status_code == 409 and f1.json() == f2.json()
    rows = dbconn.execute("SELECT entity_id, student_id FROM audit_logs WHERE action='consent.request' ORDER BY id").fetchall()
    assert [x["entity_id"] for x in rows] == [str(real.json()["id"]), str(fake.json()["id"])]
    assert rows[0]["student_id"] is not None and rows[1]["student_id"] is None
    assert [c["id"] for c in client.get("/v1/consents", headers=student(client, r["apaar_id"])).json()] == [real.json()["id"]]


def test_consent_requests_are_rate_limited_per_verifier(client, dbconn):
    from argon2 import PasswordHasher
    dbconn.execute("INSERT INTO users (id, role, display_name, password_hash) VALUES ('employer2', 'verifier', 'Other Co', %s)",
                   (PasswordHasher().hash("demo"),))
    dbconn.commit()
    for i in range(20):
        assert request_consent(client, f"9{i:011d}").status_code == 201
    limited = request_consent(client, "100000000001")
    assert limited.status_code == 429 and limited.headers["content-type"] == "application/problem+json"
    assert request_consent(client, "100000000001", user="employer2").status_code == 201


def test_verifier_has_no_direct_sql_access_to_consents(client, dbconn):
    import psycopg
    import pytest
    from app import db
    r = adult_a_student(client)
    request_consent(client, r["apaar_id"])
    with db.app_connect({"role": "verifier", "id": "employer"}) as c:
        assert c.execute("SELECT count(*) n FROM consents").fetchone()["n"] == 0
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("INSERT INTO consents (student_id, requester_id, requester_name, purpose, scope_fields, status, expires_at) "
                      "VALUES (1, 'employer', 'x', 'probe', '{name}', 'pending', now() + interval '1 day')")


def test_verification_credentials_belong_to_the_student_not_the_institution(client):
    r = adult_a_student(client)
    cid = request_consent(client, r["apaar_id"]).json()["id"]
    vc = client.post(f"/v1/consents/{cid}/approve", json={"otp": OTP}, headers=student(client, r["apaar_id"])).json()["credential"]
    ha = login(client, "inst-a")
    assert all(c["type"] != "VerificationCredential" for c in client.get("/v1/credentials", headers=ha).json())
    st = {"credential_id": vc["id"], "purpose": "suspension", "value": True, "reason": "test"}
    assert client.post("/v1/credentials/status", json=st, headers=ha).status_code == 404
    assert verify(client, vc) == "VALID"
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
