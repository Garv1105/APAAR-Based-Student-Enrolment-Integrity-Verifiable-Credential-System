"""T5.11: every endpoint x every role, incl. wrong-institution (inst-b on inst-a's resources).
Expected codes: 2xx allowed, 401 no/invalid token, 403 wrong role, 404 wrong institution (no oracle)."""
import csv
from pathlib import Path

from conftest import login, student_headers
from test_api import pending_rows, upload

USERS = ["anon", "inst-a", "inst-b", "aicte", "auditor", "employer", "univ", "student"]
INST, REG = {"inst-a": 200}, {"aicte": 200, "auditor": 200}


def expect(ok: dict, wrong_inst=None):
    out = {u: 403 for u in USERS}
    out["anon"] = 401
    if wrong_inst:
        out["inst-b"] = wrong_inst
    out.update(ok)
    return out


def test_access_matrix(client, dbconn):
    bid = upload(client, "inst-a", "A1.csv").json()["batch_id"]
    eid = dbconn.execute("SELECT id FROM enrolments ORDER BY id LIMIT 1").fetchone()["id"]
    row = {k: v for k, v in pending_rows(1, 5000)[0].items() if k not in ("declared_intake",)}
    row.update(apaar_id=None, is_supernumerary=False, is_lateral_entry=False, is_nri=False, is_oci=False, is_fn=False,
               is_ciwg=False, year_of_study=1, guardian_name=None)
    cases = [
        ("POST", "/v1/batches", {"json": {"rows": [row]}}, expect({"inst-a": 201, "inst-b": 201})),
        ("GET", "/v1/batches/template.csv", {}, expect({"inst-a": 200, "inst-b": 200})),
        ("GET", f"/v1/batches/{bid}", {}, expect(INST | REG, 404)),
        ("GET", f"/v1/batches/{bid}/issues", {}, expect(INST | REG, 404)),
        ("GET", f"/v1/batches/{bid}/report.csv", {}, expect(INST | REG, 404)),
        ("GET", "/v1/enrolments?student_id=A/CSE/2026/0001", {}, expect({"inst-a": 200, "inst-b": 200, "univ": 200})),  # b: []
        ("GET", "/v1/credentials/certificate?id=urn:uuid:nope", {},
         expect({"inst-a": 404, "inst-b": 404, "univ": 404, "student": 404})),
        ("PATCH", f"/v1/enrolments/{eid}", {"json": {"year_of_study": 1, "reason": "access test"}}, expect(INST, 404)),
        ("GET", "/v1/programmes/1-0000000001:CSE/seats", {}, expect(INST | REG, 404)),
        ("GET", "/v1/dashboard/institution", {}, expect({"inst-a": 200, "inst-b": 200})),
        ("GET", "/v1/dashboard/aicte", {}, expect(REG)),
        ("GET", "/v1/ledger/verify", {}, expect(REG)),
        ("POST", "/v1/ledger/checkpoints", {}, expect({"aicte": 200})),
        ("GET", "/v1/ledger/checkpoints/latest", {}, {u: 200 for u in USERS}),
        # duplicate cases (PRD §10): institutions list their own (RLS-filtered), only the AICTE officer resolves/unmasks
        ("GET", "/v1/cases", {}, expect({"inst-a": 200, "inst-b": 200} | REG)),
        ("POST", "/v1/cases/999999/resolve", {"json": {"status": "false_positive", "note": "test"}}, expect({"aicte": 404})),
        ("POST", "/v1/cases/999999/unmask", {"json": {"reason": "access matrix test"}}, expect({"aicte": 404})),
        # passkeys (P1): sign-in endpoints are public and anonymous (a token sent along is ignored)
        ("GET", "/v1/auth/config", {}, {u: 200 for u in USERS}),
        ("POST", "/v1/auth/activate", {"json": {"apaar_id": "not-an-apaar", "code": "AAAA-AAAA-AA"}}, {u: 401 for u in USERS}),
        ("POST", "/v1/auth/passkey/options", {}, {u: 200 for u in USERS}),
        ("POST", "/v1/auth/passkey/verify", {"json": {"credential": {}}}, {u: 400 for u in USERS}),
        ("POST", "/v1/passkeys/register/options", {}, expect({})),       # setup sessions only
        ("POST", "/v1/passkeys/register/verify", {"json": {"credential": {}}}, expect({})),
        ("GET", "/v1/passkeys", {}, expect({"student": 200})),
        ("DELETE", "/v1/passkeys/999999", {}, expect({"student": 404})),
        ("POST", f"/v1/enrolments/{eid}/activation-code", {"json": {"kind": "student", "reason": "access matrix test"}},
         expect(INST, 404)),
        ("POST", "/v1/consents/999999/approve/options", {}, expect({"student": 404})),
        # webhooks (Req 7): institutions manage their own; 404 for anything that isn't theirs (public IP literal: no DNS)
        ("POST", "/v1/webhooks", {"json": {"url": "https://93.184.216.34/hook", "events": ["batch.validated"]}},
         expect({"inst-a": 201, "inst-b": 201})),
        ("GET", "/v1/webhooks", {}, expect({"inst-a": 200, "inst-b": 200})),
        ("POST", "/v1/webhooks/999999/rotate", {}, expect({"inst-a": 404, "inst-b": 404})),
        ("GET", "/v1/webhooks/999999/deliveries", {}, expect({"inst-a": 404, "inst-b": 404})),
        ("POST", "/v1/webhooks/deliveries/999999/redeliver", {}, expect({"inst-a": 404, "inst-b": 404})),
        ("DELETE", "/v1/webhooks/999999", {}, expect({"inst-a": 404, "inst-b": 404})),
        # credentials (Req 5, 6, 10)
        ("POST", f"/v1/credentials/{eid}/issue", {"json": {"type": "EnrolmentCredential"}}, expect({"inst-a": 201}, 404)),
        ("POST", f"/v1/credentials/{eid}/issue", {"json": {"type": "DegreeCredential"}},
         expect({"univ": 409, "inst-a": 403}, 404)),  # univ: 409 = role allowed, enrolment not completed; inst-b: RLS hides it
        ("GET", "/v1/credentials", {}, expect({"inst-a": 200, "inst-b": 200, "univ": 200, "student": 200} | REG)),  # RLS filters
        ("POST", "/v1/credentials/status",
         {"json": {"credential_id": "urn:uuid:nope", "purpose": "suspension", "value": True, "reason": "test"}},
         expect({"inst-a": 404, "inst-b": 404, "univ": 404})),
        ("POST", "/v1/verify", {"json": {"credential": {}}},
         expect({"inst-a": 200, "inst-b": 200, "employer": 200, "univ": 200, "student": 200} | REG)),
        ("GET", "/v1/demo/forged-credential", {}, expect({"employer": 200} | REG)),
        # consent + student self-service (Req 5, 8; D5, D6)
        ("POST", "/v1/consents/requests", {"json": {"apaar_id": "999999999999", "purpose": "check", "fields": ["name"]}},
         expect({"employer": 201})),  # same 201 whether or not the APAAR is registered (no existence oracle)
        ("GET", "/v1/consents", {}, expect({"employer": 200, "student": 200} | REG)),
        ("POST", "/v1/consents/999999/approve", {"json": {"otp": "123456"}}, expect({"student": 404})),
        ("POST", "/v1/consents/999999/deny", {}, expect({"student": 404})),
        ("POST", "/v1/consents/999999/revoke", {}, expect({"student": 404})),
        ("GET", "/v1/consents/999999/credential", {}, expect({"employer": 404})),
        ("GET", "/v1/students/me", {}, expect({"student": 200})),
        ("GET", "/v1/students/me/access-log", {}, expect({"student": 200})),
        ("GET", "/v1/registry/issuers", {}, {u: 200 for u in USERS}),
        ("GET", "/v1/registry/snapshot", {}, {u: 200 for u in USERS}),
        ("GET", "/status/inst-1-0000000001-revocation", {}, {u: 200 for u in USERS}),
        ("GET", "/dids/inst/1-0000000001/did.json", {}, {u: 200 for u in USERS}),
        # D3
        ("GET", "/v1/anomalies", {}, expect(REG)),
        ("GET", "/v1/inspection-queue", {}, expect(REG)),
        ("GET", "/v1/dqs", {}, expect({"inst-a": 200, "inst-b": 200})),
        # reports (Req 9)
        ("GET", "/v1/reports", {}, expect({"inst-a": 200, "inst-b": 200} | REG)),
        ("GET", "/v1/reports/state-summary.csv", {}, expect(REG)),
        ("GET", "/v1/reports/excess-case-file.csv", {}, expect(REG)),
        ("GET", "/v1/reports/category-utilisation.csv", {}, expect({"inst-a": 200, "inst-b": 200} | REG)),
        ("GET", "/v1/reports/accreditation.csv?institution_id=1-0000000001", {}, expect({"inst-a": 200, "inst-b": 200} | REG)),
        ("GET", "/healthz", {}, {u: 200 for u in USERS}),
    ]
    headers = {u: ({} if u == "anon" else login(client, u)) for u in USERS if u != "student"}
    a1 = csv.DictReader(open(Path(__file__).parent.parent / "data/synthetic/A1.csv", encoding="utf-8"))
    apaar = next(r["apaar_id"] for r in a1 if r["apaar_id"])
    headers["student"] = student_headers(client, apaar)
    bad = []
    for method, path, kw, exp in cases:
        for u in USERS:
            got = client.request(method, path, headers=headers[u], **kw).status_code
            if got != exp[u]:
                bad.append(f"{method} {path} as {u}: expected {exp[u]}, got {got}")
    assert not bad, "\n".join(bad)


def test_wrong_institution_lookup_returns_nothing(client):
    upload(client, "inst-a", "A1.csv")
    sid = "A/CSE/2026/0001"
    assert client.get("/v1/enrolments", params={"student_id": sid}, headers=login(client, "inst-a")).json()
    assert client.get("/v1/enrolments", params={"student_id": sid}, headers=login(client, "inst-b")).json() == []
