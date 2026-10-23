"""T5.11: every endpoint x every role, incl. wrong-institution (inst-b on inst-a's resources).
Expected codes: 2xx allowed, 401 no/invalid token, 403 wrong role, 404 wrong institution (no oracle)."""
from conftest import login
from test_api import pending_rows, upload

USERS = ["anon", "inst-a", "inst-b", "aicte", "auditor", "employer", "univ"]
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
        ("GET", "/v1/enrolments?student_id=A/CSE/2026/0001", {}, expect({"inst-a": 200, "inst-b": 200})),  # b gets []
        ("PATCH", f"/v1/enrolments/{eid}", {"json": {"year_of_study": 1, "reason": "access test"}}, expect(INST, 404)),
        ("GET", "/v1/programmes/1-0000000001:CSE/seats", {}, expect(INST | REG, 404)),
        ("GET", "/v1/dashboard/institution", {}, expect({"inst-a": 200, "inst-b": 200})),
        ("GET", "/v1/dashboard/aicte", {}, expect(REG)),
        ("GET", "/v1/ledger/verify", {}, expect(REG)),
        ("POST", "/v1/ledger/checkpoints", {}, expect({"aicte": 200})),
        ("GET", "/v1/ledger/checkpoints/latest", {}, {u: 200 for u in USERS}),
        ("GET", "/healthz", {}, {u: 200 for u in USERS}),
    ]
    headers = {u: ({} if u == "anon" else login(client, u)) for u in USERS}
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
