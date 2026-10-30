import json

from conftest import login, student_headers
from test_api import upload
from test_credentials import issue, verify


def _setup(client):
    upload(client, "inst-a", "A1.csv")
    upload(client, "inst-b", "B1.csv")
    cases = client.get("/v1/cases", headers=login(client, "aicte")).json()
    assert cases and all(len(c["enrolment_ids"]) >= 2 for c in cases)
    return cases


def _inst_of(dbconn, eid):
    return dbconn.execute("SELECT p.institution_id FROM enrolments e JOIN programmes p ON p.id=e.programme_id WHERE e.id=%s",
                          (eid,)).fetchone()["institution_id"]


def test_institution_sees_neutral_case_with_own_enrolments_only(client, dbconn):
    case = _setup(client)[0]
    client.post(f"/v1/cases/{case['id']}/resolve", json={"status": "under_investigation", "note": "Kalyani Devi Hegde Institute of Technology, Hubballi says first"},
                headers=login(client, "aicte"))
    b = client.get("/v1/cases", headers=login(client, "inst-b"))
    assert b.status_code == 200 and b.json()
    mine = next(c for c in b.json() if c["id"] == case["id"])
    assert mine["enrolment_ids"] and all(_inst_of(dbconn, i) == "1-0000000002" for i in mine["enrolment_ids"])
    assert mine["resolution_note"] is None and mine["detail"] is None
    text = json.dumps(b.json())
    assert "1-0000000001" not in text and "Kalyani Devi Hegde" not in text


def test_only_officer_resolves_and_unmask_needs_reason(client):
    cid = _setup(client)[0]["id"]
    body = {"status": "false_positive", "note": "twins"}
    for u, code in [("inst-a", 403), ("auditor", 403), ("employer", 403)]:
        assert client.post(f"/v1/cases/{cid}/resolve", json=body, headers=login(client, u)).status_code == code
        assert client.post(f"/v1/cases/{cid}/unmask", json={"reason": "checking the case"}, headers=login(client, u)).status_code == code
    h = login(client, "aicte")
    assert client.post(f"/v1/cases/{cid}/unmask", json={}, headers=h).status_code == 422
    assert client.post(f"/v1/cases/{cid}/unmask", json={"reason": "x"}, headers=h).status_code == 422
    assert client.post("/v1/cases/999999/unmask", json={"reason": "checking the case"}, headers=h).status_code == 404
    assert client.post(f"/v1/cases/{cid}/resolve", json={"status": "confirmed_duplicate", "note": "dup"}, headers=h).status_code == 422
    assert client.post(f"/v1/cases/{cid}/resolve", json=body, headers=h).status_code == 200
    assert client.post(f"/v1/cases/{cid}/resolve", json=body, headers=h).status_code == 409


def test_unmask_is_audited_and_visible_to_student(client, dbconn):
    case = _setup(client)[0]
    reason = "Case review for duplicate enrolment, ticket 42"
    r = client.post(f"/v1/cases/{case['id']}/unmask", json={"reason": reason}, headers=login(client, "aicte"))
    assert r.status_code == 200, r.text
    detail = r.json()["detail"]
    assert {d["institution_id"] for d in detail} == {"1-0000000001", "1-0000000002"} and all(d["name"] for d in detail)
    log = client.get("/v1/students/me/access-log", headers=student_headers(client, detail[0]["apaar_id"])).json()
    assert any(e["action"] == "case.unmask" and e["reason"] == reason and e["actor"] == "aicte" for e in log)


def test_confirmed_duplicate_revokes_the_rejected_side_only(client, dbconn):
    case = _setup(client)[0]
    a_id, b_id = sorted(case["enrolment_ids"], key=lambda i: _inst_of(dbconn, i))
    va = issue(client, "inst-a", a_id, "EnrolmentCredential").json()["credential"]
    vb = issue(client, "inst-b", b_id, "EnrolmentCredential").json()["credential"]
    h = login(client, "aicte")
    assert client.post(f"/v1/cases/{case['id']}/resolve", json={"status": "under_investigation", "note": "asking both"},
                       headers=h).status_code == 200
    assert verify(client, va)["result"] == verify(client, vb)["result"] == "SUSPENDED"
    r = client.post(f"/v1/cases/{case['id']}/resolve", json={"status": "confirmed_duplicate", "note": "B admitted later",
                                                             "keep_enrolment_id": a_id}, headers=h)
    assert r.status_code == 200 and r.json()["status"] == "confirmed_duplicate" and r.json()["resolved_at"]
    assert verify(client, va)["result"] == "VALID" and verify(client, vb)["result"] == "REVOKED"
    assert dbconn.execute("SELECT count(*) n FROM audit_logs WHERE action LIKE 'case.%%' AND entity_id=%s",
                          (str(case["id"]),)).fetchone()["n"] == 2
