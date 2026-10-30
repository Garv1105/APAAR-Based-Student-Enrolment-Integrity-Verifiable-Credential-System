import copy
import csv
from datetime import timedelta
from pathlib import Path

from app import credentials, crypto
from conftest import login, student_headers
from test_api import upload

SYN = Path(__file__).resolve().parent.parent / "data/synthetic"
D_DID = "did:web:registry.aicte-demo.in:inst:1-0000000004"


def a_rows():
    return list(csv.DictReader(open(SYN / "A1.csv", encoding="utf-8")))


def a_enrolment(client, dbconn, n=0):
    upload(client, "inst-a", "A1.csv")
    r = [r for r in a_rows() if r["apaar_id"]][n]
    e = client.get("/v1/enrolments", params={"apaar": r["apaar_id"]}, headers=login(client, "inst-a")).json()[0]
    return e, r


def issue(client, user, enrolment_id, vc_type):
    return client.post(f"/v1/credentials/{enrolment_id}/issue", json={"type": vc_type}, headers=login(client, user))


def verify(client, vc, user="employer"):
    r = client.post("/v1/verify", json={"credential": vc}, headers=login(client, user))
    assert r.status_code == 200, r.text
    return r.json()


def test_enrolment_credential_lifecycle_valid_tampered_suspended_revoked(client, dbconn):
    e, row = a_enrolment(client, dbconn)
    r = issue(client, "inst-a", e["id"], "EnrolmentCredential")
    assert r.status_code == 201, r.text
    vc = r.json()["credential"]
    s = vc["credentialSubject"]
    assert s["apaarId"] == row["apaar_id"] and s["studentId"] == row["institution_student_id"] and s["status"] == "ACTIVE"
    assert vc["proof"]["cryptosuite"] == "eddsa-jcs-2022" and vc["issuer"]["id"].endswith("inst:1-0000000001")
    assert verify(client, vc)["result"] == "VALID"

    forged = copy.deepcopy(vc)
    forged["credentialSubject"]["programme"] = "MBBS"
    out = verify(client, forged)
    assert out["result"] == "TAMPERED" and out["subject"] is None

    st = {"credential_id": vc["id"], "purpose": "suspension", "reason": "under investigation"}
    assert client.post("/v1/credentials/status", json=st | {"value": True}, headers=login(client, "inst-a")).status_code == 200
    assert verify(client, vc)["result"] == "SUSPENDED"
    assert client.post("/v1/credentials/status", json=st | {"value": False}, headers=login(client, "inst-a")).status_code == 200
    assert verify(client, vc)["result"] == "VALID"
    assert client.post("/v1/credentials/status", json=st | {"value": True}, headers=login(client, "inst-b")).status_code == 404
    assert client.post("/v1/credentials/status", json=st | {"purpose": "revocation", "value": False},
                       headers=login(client, "inst-a")).status_code == 422

    assert client.patch(f"/v1/enrolments/{e['id']}", json={"status": "withdrawn", "reason": "left"},
                        headers=login(client, "inst-a")).status_code == 200
    assert verify(client, vc)["result"] == "REVOKED"
    rows = dbconn.execute("SELECT actor, reason, student_id FROM audit_logs WHERE action='credential.verify' AND entity_id=%s ORDER BY id",
                          (vc["id"],)).fetchall()
    assert [r["reason"] for r in rows] == ["VALID", "TAMPERED", "SUSPENDED", "VALID", "REVOKED"]
    assert all(r["actor"] == "employer" for r in rows)
    assert [r["student_id"] is not None for r in rows] == [True, False, True, True, True]


def test_quoting_a_credential_id_cannot_plant_audit_entries(client, dbconn):
    e, _ = a_enrolment(client, dbconn)
    vc = issue(client, "inst-a", e["id"], "EnrolmentCredential").json()["credential"]
    assert verify(client, {"id": vc["id"]})["result"] == "MALFORMED"
    rows = dbconn.execute("SELECT student_id FROM audit_logs WHERE action='credential.verify' AND entity_id=%s", (vc["id"],)).fetchall()
    assert len(rows) == 1 and rows[0]["student_id"] is None


def test_regulators_see_masked_credentials_only(client, dbconn):
    e, row = a_enrolment(client, dbconn)
    issue(client, "inst-a", e["id"], "EnrolmentCredential")
    for user in ("aicte", "auditor"):
        c = client.get("/v1/credentials", headers=login(client, user)).json()[0]["credential"]
        assert c["redacted"] and "proof" not in c and not {"name", "studentId", "provisionalId"} & set(c["credentialSubject"])
        assert c["credentialSubject"]["apaarId"] == crypto.mask_apaar(row["apaar_id"])


def test_issue_is_idempotent(client, dbconn):
    e, _ = a_enrolment(client, dbconn)
    h = login(client, "inst-a") | {"Idempotency-Key": "issue-1"}
    r1 = client.post(f"/v1/credentials/{e['id']}/issue", json={"type": "EnrolmentCredential"}, headers=h)
    r2 = client.post(f"/v1/credentials/{e['id']}/issue", json={"type": "EnrolmentCredential"}, headers=h)
    assert r1.status_code == 201 and r2.status_code == 200 and r1.json()["id"] == r2.json()["id"]
    e2 = client.get("/v1/enrolments", params={"apaar": [r for r in a_rows() if r["apaar_id"]][1]["apaar_id"]},
                    headers=login(client, "inst-a")).json()[0]
    assert client.post(f"/v1/credentials/{e2['id']}/issue", json={"type": "EnrolmentCredential"}, headers=h).status_code == 422
    assert dbconn.execute("SELECT count(*) n FROM credentials").fetchone()["n"] == 1


def test_non_student_documents_are_not_reported_valid(client, dbconn):
    e, _ = a_enrolment(client, dbconn)
    vc = issue(client, "inst-a", e["id"], "EnrolmentCredential").json()["credential"]
    slc = client.get("/status/" + vc["credentialStatus"][0]["statusListCredential"].split("/status/")[1]).json()
    assert slc["validUntil"] > slc["validFrom"]
    assert verify(client, slc)["result"] == "MALFORMED"
    assert verify(client, client.get("/v1/registry/snapshot").json()["snapshot"])["result"] == "MALFORMED"


def test_status_list_credential_is_spec_shaped_and_signed(client, dbconn):
    e, _ = a_enrolment(client, dbconn)
    vc = issue(client, "inst-a", e["id"], "EnrolmentCredential").json()["credential"]
    entry = next(x for x in vc["credentialStatus"] if x["statusPurpose"] == "revocation")
    idx = int(entry["statusListIndex"])
    client.patch(f"/v1/enrolments/{e['id']}", json={"status": "withdrawn", "reason": "left"}, headers=login(client, "inst-a"))
    path = entry["statusListCredential"].split("/status/")[1]
    slc = client.get(f"/status/{path}").json()
    assert slc["type"] == ["VerifiableCredential", "BitstringStatusListCredential"]
    bits = credentials.decode_list(slc["credentialSubject"]["encodedList"])
    assert len(bits) * 8 >= 131_072 and credentials.bit_is_set(bits, idx) and sum(bin(b).count("1") for b in bits) == 1
    did_doc = client.get("/dids/inst/1-0000000001/did.json").json()
    pub = crypto.public_from_multikey(did_doc["verificationMethod"][0]["publicKeyMultibase"])
    assert crypto.eddsa_jcs_2022_verify(slc, pub)


def test_status_list_bit_order_matches_spec():
    bits = bytearray(16384)
    bits[0] = 0b1000_0000
    assert credentials.bit_is_set(bytes(bits), 0) and not credentials.bit_is_set(bytes(bits), 7)
    assert credentials.decode_list(credentials.encode_list(bytes(bits))) == bytes(bits)


def test_degree_credential_by_affiliated_university_only(client, dbconn):
    e, row = a_enrolment(client, dbconn)
    assert issue(client, "univ", e["id"], "DegreeCredential").status_code == 409
    assert client.patch(f"/v1/enrolments/{e['id']}", json={"status": "completed", "reason": "graduated"},
                        headers=login(client, "inst-a")).status_code == 200
    r = issue(client, "univ", e["id"], "DegreeCredential")
    assert r.status_code == 201, r.text
    s = r.json()["credential"]["credentialSubject"]
    assert s["apaarId"] == row["apaar_id"] and s["studentId"] == row["institution_student_id"]
    assert "validUntil" not in r.json()["credential"] and verify(client, r.json()["credential"])["result"] == "VALID"
    assert issue(client, "inst-a", e["id"], "DegreeCredential").status_code == 403
    assert issue(client, "univ", e["id"], "EnrolmentCredential").status_code == 403
    assert issue(client, "inst-b", e["id"], "EnrolmentCredential").status_code == 404
    upload(client, "inst-c", "C1.csv")
    c_row = next(r for r in csv.DictReader(open(SYN / "C1.csv", encoding="utf-8")) if r["apaar_id"] and r["institution_student_id"])
    c_e = client.get("/v1/enrolments", params={"apaar": c_row["apaar_id"]}, headers=login(client, "inst-c")).json()[0]
    assert issue(client, "univ", c_e["id"], "DegreeCredential").status_code == 404


def test_untrusted_issuers_and_registry_window(client, dbconn):
    assert verify(client, client.get("/v1/demo/forged-credential", headers=login(client, "employer")).json())["result"] == "UNTRUSTED_ISSUER"
    base = {"@context": credentials.VC_CONTEXT, "id": "urn:uuid:00000000-0000-0000-0000-000000000004",
            "type": ["VerifiableCredential", "EnrolmentCredential"], "issuer": {"id": D_DID, "name": "Ram Lakhan Sinha Polytechnic, Darbhanga"},
            "credentialSubject": {"name": "X", "studentId": "D/1"}}
    key = crypto.signing_key(D_DID)
    late = crypto.eddsa_jcs_2022_sign(base | {"validFrom": "2026-08-01T00:00:00Z"}, credentials._proof_options(f"{D_DID}#key-1"), key)
    early = crypto.eddsa_jcs_2022_sign(base | {"validFrom": "2025-08-01T00:00:00Z"}, credentials._proof_options(f"{D_DID}#key-1"), key)
    assert verify(client, late)["result"] == "UNTRUSTED_ISSUER"
    assert verify(client, early)["result"] == "VALID"
    wrong_key = copy.deepcopy(early)
    wrong_key["proof"]["verificationMethod"] = "did:web:registry.aicte-demo.in:inst:1-0000000001#key-1"
    assert verify(client, wrong_key)["result"] == "UNTRUSTED_ISSUER"
    assert verify(client, {"hello": "world"})["result"] == "MALFORMED"


def test_expired_credential(client, dbconn):
    e, _ = a_enrolment(client, dbconn)
    vc = issue(client, "inst-a", e["id"], "EnrolmentCredential").json()["credential"]
    later = credentials.parse_iso(vc["validUntil"]) + timedelta(days=1)
    assert credentials.verify(dbconn, vc, at=later)["result"] == "EXPIRED"


def test_registry_snapshot_is_signed_by_aicte(client):
    body = client.get("/v1/registry/snapshot").json()
    snap = body["snapshot"]
    assert crypto.eddsa_jcs_2022_verify(snap, crypto.public_from_multikey(body["aicte_public_key"]))
    dids = {i["did"] for i in snap["credentialSubject"]["issuers"]}
    assert "did:web:registry.aicte-demo.in:univ:dtu-demo" in dids and len(dids) == 5
    assert all(i["source"] == "mock" for i in client.get("/v1/registry/issuers").json())


def test_student_login_needs_apaar_and_dob(client, dbconn):
    e, row = a_enrolment(client, dbconn)
    issue(client, "inst-a", e["id"], "EnrolmentCredential")
    wrong = client.post("/v1/auth/student-login", json={"apaar_id": row["apaar_id"], "dob": "1999-01-01"})
    unknown = client.post("/v1/auth/student-login", json={"apaar_id": "999999999999", "dob": row["dob"]})
    assert wrong.status_code == unknown.status_code == 401 and wrong.json() == unknown.json()
    ok = client.post("/v1/auth/student-login", json={"apaar_id": row["apaar_id"], "dob": row["dob"]})
    assert ok.status_code == 200 and ok.json()["role"] == "student"
    hs = {"Authorization": f"Bearer {ok.json()['access_token']}"}
    mine = client.get("/v1/credentials", headers=hs).json()
    assert len(mine) == 1 and mine[0]["credential"]["credentialSubject"]["apaarId"] == row["apaar_id"]
    other = next(r for r in a_rows() if r["apaar_id"] and r["apaar_id"] != row["apaar_id"])
    assert client.get("/v1/credentials", headers=student_headers(client, other["apaar_id"])).json() == []
    assert client.get("/v1/credentials", headers=login(client, "inst-b")).json() == []
    assert len(client.get("/v1/credentials", headers=login(client, "aicte")).json()) == 1


def test_student_login_locks_out_after_repeated_failures(client, dbconn):
    upload(client, "inst-a", "A1.csv")
    row = [r for r in a_rows() if r["apaar_id"]][5]
    for _ in range(5):
        assert client.post("/v1/auth/student-login", json={"apaar_id": row["apaar_id"], "dob": "1990-01-01"}).status_code == 401
    assert client.post("/v1/auth/student-login", json={"apaar_id": row["apaar_id"], "dob": row["dob"]}).status_code == 429


def test_parallel_guesses_cannot_race_past_the_lockout(client, dbconn):
    import threading
    upload(client, "inst-a", "A1.csv")
    row = [r for r in a_rows() if r["apaar_id"]][6]
    codes = []

    def guess(i):
        codes.append(client.post("/v1/auth/student-login", json={"apaar_id": row["apaar_id"], "dob": f"1990-01-{i + 1:02d}"}).status_code)
    ts = [threading.Thread(target=guess, args=(i,)) for i in range(20)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert sorted(codes) == [401] * 5 + [429] * 15
    for _ in range(5):
        client.post("/v1/auth/student-login", json={"apaar_id": "999999999999", "dob": "2000-01-01"})
    assert client.post("/v1/auth/student-login", json={"apaar_id": "999999999999", "dob": "2000-01-01"}).status_code == 429


def test_migration_revokes_the_old_institutions_credential(client, dbconn):
    e, _ = a_enrolment(client, dbconn, 2)
    vc = issue(client, "inst-a", e["id"], "EnrolmentCredential").json()["credential"]
    assert verify(client, vc)["result"] == "VALID"
    r = client.patch(f"/v1/enrolments/{e['id']}", json={"status": "migrated", "reason": "moved to another institution"},
                     headers=login(client, "inst-a"))
    assert r.status_code == 200
    assert verify(client, vc)["result"] == "REVOKED"


def test_status_indexes_are_random_not_sequential(client, dbconn):
    e1, _ = a_enrolment(client, dbconn, 0)
    e2 = client.get("/v1/enrolments", params={"apaar": [r for r in a_rows() if r["apaar_id"]][1]["apaar_id"]},
                    headers=login(client, "inst-a")).json()[0]
    i1 = issue(client, "inst-a", e1["id"], "EnrolmentCredential").json()["credential"]["credentialStatus"][0]["statusListIndex"]
    i2 = issue(client, "inst-a", e2["id"], "EnrolmentCredential").json()["credential"]["credentialStatus"][0]["statusListIndex"]
    assert i1 != i2 and {i1, i2} != {"0", "1"}
