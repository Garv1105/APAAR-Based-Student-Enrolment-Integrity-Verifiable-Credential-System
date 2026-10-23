"""T5.7: printed-certificate QR (Req 10) — Base45 per RFC 9285, AV1 payload, certificate endpoint."""
import pytest

from app import credentials
from conftest import login
from test_credentials import a_enrolment, issue, verify


def test_base45_rfc9285_examples():
    # RFC 9285 §4.3 / §4.4 examples
    assert credentials.b45encode(b"AB") == "BB8"
    assert credentials.b45encode(b"Hello!!") == "%69 VD92EX0"
    assert credentials.b45encode(b"base-45") == "UJCLQE7W581"
    assert credentials.b45decode("QED8WEX0") == b"ietf!"
    for bad in ("GGW", "A", "a1"):  # out-of-range triplet, bad length, lowercase not in the alphabet
        with pytest.raises(ValueError):
            credentials.b45decode(bad)


def test_certificate_qr_round_trip_and_verification(client, dbconn, capsys):
    e, row = a_enrolment(client, dbconn)
    client.patch(f"/v1/enrolments/{e['id']}", json={"status": "completed", "reason": "graduated"}, headers=login(client, "inst-a"))
    vc = issue(client, "univ", e["id"], "DegreeCredential").json()["credential"]
    cert = client.get("/v1/credentials/certificate", params={"id": vc["id"]}, headers=login(client, "univ"))
    assert cert.status_code == 200, cert.text
    body = cert.json()
    s = body["credential"]["credentialSubject"]
    assert s["apaarId"] == row["apaar_id"] and s["studentId"] == row["institution_student_id"]  # both IDs printed (Req 10)
    assert body["qr_svg"].startswith("<?xml") or body["qr_svg"].startswith("<svg")
    assert credentials.from_qr_payload(body["qr_payload"]) == vc
    with capsys.disabled():  # PRD §11.8: measure the real payload size
        print(f"\nDegreeCredential QR payload: {body['qr_payload_chars']} Base45 chars (QR alphanumeric, EC level M)")
    assert body["qr_payload_chars"] < 3391  # QR version 40-M alphanumeric capacity

    r = client.post("/v1/verify", json={"qr": body["qr_payload"]}, headers=login(client, "employer")).json()
    assert r["result"] == "VALID"
    tampered = credentials.qr_payload({**vc, "credentialSubject": {**vc["credentialSubject"], "degree": "MBBS"}})
    assert client.post("/v1/verify", json={"qr": tampered}, headers=login(client, "employer")).json()["result"] == "TAMPERED"
    assert client.post("/v1/verify", json={"qr": "AV1:not base45"}, headers=login(client, "employer")).json()["result"] == "MALFORMED"
    assert client.post("/v1/verify", json={}, headers=login(client, "employer")).status_code == 422


def test_certificate_visible_to_issuer_and_subject_only(client, dbconn):
    e, row = a_enrolment(client, dbconn)
    vc = issue(client, "inst-a", e["id"], "EnrolmentCredential").json()["credential"]
    tok = client.post("/v1/auth/student-login", json={"apaar_id": row["apaar_id"], "otp": "123456"}).json()["access_token"]
    assert client.get("/v1/credentials/certificate", params={"id": vc["id"]},
                      headers={"Authorization": f"Bearer {tok}"}).status_code == 200
    assert client.get("/v1/credentials/certificate", params={"id": vc["id"]}, headers=login(client, "inst-a")).status_code == 200
    assert client.get("/v1/credentials/certificate", params={"id": vc["id"]}, headers=login(client, "inst-b")).status_code == 404
    assert client.get("/v1/credentials/certificate", params={"id": vc["id"]}, headers=login(client, "employer")).status_code == 403


def test_registrar_finds_only_affiliated_enrolments(client, dbconn):
    e, row = a_enrolment(client, dbconn)
    found = client.get("/v1/enrolments", params={"apaar": row["apaar_id"]}, headers=login(client, "univ")).json()
    assert [x["id"] for x in found] == [e["id"]]
    from test_api import upload
    import csv
    from pathlib import Path
    upload(client, "inst-c", "C1.csv")
    c_row = next(r for r in csv.DictReader(open(Path(__file__).parent.parent / "data/synthetic/C1.csv", encoding="utf-8")) if r["apaar_id"])
    assert client.get("/v1/enrolments", params={"apaar": c_row["apaar_id"]}, headers=login(client, "univ")).json() == []
