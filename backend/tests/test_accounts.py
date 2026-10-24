"""T-LANDING: AICTE-issued account codes, account activation, verifier access requests."""
from conftest import login

PW = "correct horse battery"
REQ = {"organisation": "Prism HR Verification Services", "contact_name": "Ritu Malhotra",
       "contact_email": "ritu.malhotra@prism-hr.example", "purpose": "Verify degrees of shortlisted candidates"}


def issue(client, user_id, key=None, reason="new principal took charge"):
    h = login(client, "aicte") | ({"Idempotency-Key": key} if key else {})
    return client.post(f"/v1/users/{user_id}/account-code", json={"reason": reason}, headers=h)


def activate(client, user_id, code, password=PW):
    return client.post("/v1/auth/activate-account", json={"user_id": user_id, "code": code, "password": password})


def test_account_code_sets_password_once(client, dbconn):
    r = issue(client, "inst-a")
    assert r.status_code == 201, r.text
    code = r.json()["code"]
    assert r.json()["display_name"] and len(code) == 12
    assert activate(client, "inst-a", "AAAA-AAAA-AA").status_code == 401
    assert activate(client, "inst-b", code).status_code == 401                   # code is bound to its account
    ok = activate(client, "inst-a", code.lower())                                 # case and dashes tolerated
    assert ok.status_code == 200 and ok.json() == {"user_id": "inst-a", "role": "institution_admin"}
    assert activate(client, "inst-a", code).status_code == 401                    # single use
    assert client.post("/v1/auth/login", json={"user_id": "inst-a", "password": PW}).status_code == 200
    assert client.post("/v1/auth/login", json={"user_id": "inst-a", "password": "demo"}).status_code == 401
    acts = {r["action"] for r in dbconn.execute("SELECT action FROM audit_logs WHERE entity='account_code'")}
    assert acts == {"account_code.issue", "account.activate"}
    assert code not in str(dbconn.execute("SELECT * FROM account_codes").fetchall())  # keyed hash only


def test_account_code_reissue_idempotency_and_unknown(client):
    first = issue(client, "inst-b").json()["code"]
    second = issue(client, "inst-b").json()["code"]
    assert activate(client, "inst-b", first).status_code == 401                   # voided by the new code
    assert activate(client, "inst-b", second).status_code == 200
    r1, r2 = issue(client, "inst-c", key="k1"), issue(client, "inst-c", key="k1")
    assert r1.status_code == 201 and r2.status_code == 200 and r2.json()["code"] is None
    assert issue(client, "inst-c", key="k1", reason="a different reason here").status_code == 422
    assert issue(client, "nobody").status_code == 404
    assert issue(client, "aicte").status_code == 404                              # regulator accounts aren't onboarded this way


def test_access_request_approve_activate_and_reject(client, dbconn):
    r = client.post("/v1/access-requests", json=REQ)
    assert r.status_code == 201 and r.json()["status"] == "pending"
    rid = r.json()["id"]
    raw = dbconn.execute("SELECT * FROM access_requests WHERE id=%s", (rid,)).fetchone()
    assert REQ["contact_email"].encode() not in bytes(raw["contact_email_enc"]) and REQ["contact_name"].encode() not in bytes(raw["contact_name_enc"])
    assert client.post("/v1/access-requests", json=REQ | {"contact_email": "not-an-email"}).status_code == 422

    listed = client.get("/v1/access-requests", headers=login(client, "auditor")).json()
    assert listed[0]["contact_email"] == REQ["contact_email"] and listed[0]["status"] == "pending"
    assert dbconn.execute("SELECT 1 FROM audit_logs WHERE action='access_request.read' AND actor='auditor'").fetchone()

    h = login(client, "aicte")
    d = client.post(f"/v1/access-requests/{rid}/decide", json={"decision": "approved", "reason": "registered employer, checked"}, headers=h)
    assert d.status_code == 200, d.text
    acct = d.json()["account"]
    uid = d.json()["request"]["user_id"]
    assert uid == acct["user_id"] and uid.startswith("prism-hr-verification-se-") and acct["code"]
    assert client.post("/v1/auth/login", json={"user_id": uid, "password": "demo"}).status_code == 401  # no password yet
    assert activate(client, uid, acct["code"]).json()["role"] == "verifier"
    v = client.post("/v1/auth/login", json={"user_id": uid, "password": PW})
    assert v.status_code == 200 and v.json()["role"] == "verifier" and v.json()["display_name"] == REQ["organisation"]

    again = client.post(f"/v1/access-requests/{rid}/decide", json={"decision": "approved", "reason": "registered employer, checked"}, headers=h)
    assert again.status_code == 200 and again.json()["replayed"] and again.json()["account"] is None
    assert client.post(f"/v1/access-requests/{rid}/decide", json={"decision": "rejected", "reason": "changed my mind"},
                       headers=h).status_code == 409

    rid2 = client.post("/v1/access-requests", json=REQ | {"organisation": "Unknown Agency"}).json()["id"]
    rej = client.post(f"/v1/access-requests/{rid2}/decide", json={"decision": "rejected", "reason": "could not verify the company"}, headers=h)
    assert rej.json()["request"]["status"] == "rejected" and rej.json()["request"]["user_id"] is None and rej.json()["account"] is None
    acts = [r["action"] for r in dbconn.execute("SELECT action FROM audit_logs WHERE entity='access_request' ORDER BY id")]
    assert acts.count("access_request.create") == 2 and "access_request.approved" in acts and "access_request.rejected" in acts
