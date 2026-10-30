import json
from datetime import datetime, timezone

from app import mocks, seed
from conftest import login
from test_api import _csv, pending_rows

DEMO_TIME = "2026-11-15T22:30:00+05:30"


def test_seed_loads_foreign_filled_and_tolerates_missing(dbconn):
    reg = seed.load_registry()
    reg["intake_history"][0]["foreign_filled"] = 7
    reg["intake_history"][1].pop("foreign_filled", None)
    seed.reset(dbconn)
    seed.seed(dbconn, reg)
    got = {(r["programme_id"], r["academic_year"]): r["foreign_filled"] for r in dbconn.execute("SELECT * FROM intake_history")}
    h0, h1 = reg["intake_history"][:2]
    assert got[(h0["programme"], h0["academic_year"])] == 7
    assert got[(h1["programme"], h1["academic_year"])] is None


def test_world_dir_overlays_registry_and_apaar_mock(tmp_path, monkeypatch):
    (tmp_path / "seed").mkdir()
    (tmp_path / "seed/registry.json").write_text(json.dumps({
        "academic_years": seed.load_registry()["academic_years"], "seat_categories": [],
        "institutions": [{"id": "9-0000000001", "name": "World College", "state": "Kerala", "status": "approved"}],
        "users": [{"id": "inst-9-0000000001", "role": "institution_admin", "institution_id": "9-0000000001", "display_name": "x"}],
        "trust_registry": {"institutions": [{"institution_id": "9-0000000001", "valid_from": "2020-07-01T00:00:00Z", "valid_until": None}]}}))
    (tmp_path / "seed/apaar_registry.json").write_text(json.dumps({"people": [{"apaar": "999999999999", "name": "W", "dob": "2008-01-01"}]}))
    base = seed.load_registry()
    monkeypatch.setenv("WORLD_DIR", str(tmp_path))
    reg = seed.load_registry()
    assert reg["academic_years"] == base["academic_years"]
    assert reg["seat_categories"] == base["seat_categories"]
    assert {"aicte", "inst-a", "inst-9-0000000001"} <= {u["id"] for u in reg["users"]}
    assert reg["trust_registry"]["host"] and len(reg["trust_registry"]["institutions"]) == len(base["trust_registry"]["institutions"]) + 1
    repo_person = json.loads((mocks.DATA / "apaar_registry.json").read_text())["people"][0]["apaar"]
    m = mocks.MockApaarRegistry()
    assert m.lookup("999999999999") and m.lookup(repo_person)


def _upload(client, headers, n=3, start=0):
    return client.post("/v1/batches", files={"file": ("f.csv", _csv(pending_rows(n, start)), "text/csv")}, headers=headers)


def test_demo_upload_time_used_in_demo_mode(client, dbconn, monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "true")
    r = _upload(client, login(client, "inst-b") | {"X-Demo-Upload-Time": DEMO_TIME})
    assert r.status_code == 201, r.text
    bid = r.json()["batch_id"]
    assert datetime.fromisoformat(r.json()["created_at"]) == datetime.fromisoformat(DEMO_TIME)
    (f,) = dbconn.execute("SELECT minutes_before_deadline m FROM batch_features WHERE batch_id=%s", (bid,)).fetchall()
    assert abs(f["m"] - (90 - 1 / 60)) < 1e-6
    a = dbconn.execute("SELECT reason FROM audit_logs WHERE action='batch.upload' AND entity_id=%s", (str(bid),)).fetchone()
    assert DEMO_TIME[:16] in a["reason"]
    flags = client.get("/v1/anomalies", headers=login(client, "aicte")).json()
    inst_b = dbconn.execute("SELECT institution_id FROM users WHERE id='inst-b'").fetchone()["institution_id"]
    assert any(x["type"] == "DEADLINE_DUMP" and x["institution_id"] == inst_b for x in flags)


def test_demo_upload_time_rejects_bad_value_in_demo_mode(client, monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "true")
    for bad in ("tomorrow", "2026-11-15T22:30:00"):
        r = _upload(client, login(client, "inst-b") | {"X-Demo-Upload-Time": bad})
        assert r.status_code == 422 and r.headers["content-type"].startswith("application/problem+json")


def test_demo_upload_time_ignored_and_audited_without_demo_mode(client, dbconn, monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "false")
    before = datetime.now(timezone.utc)
    r = _upload(client, login(client, "inst-b") | {"X-Demo-Upload-Time": DEMO_TIME})
    assert r.status_code == 201, r.text
    bid = r.json()["batch_id"]
    assert datetime.fromisoformat(r.json()["created_at"]) >= before
    f = dbconn.execute("SELECT minutes_before_deadline m FROM batch_features WHERE batch_id=%s", (bid,)).fetchone()
    assert f["m"] > 1000
    assert dbconn.execute("SELECT 1 FROM audit_logs WHERE action='batch.demo_clock_ignored' AND actor='inst-b'").fetchone()
    assert dbconn.execute("SELECT reason FROM audit_logs WHERE action='batch.upload' AND entity_id=%s", (str(bid),)).fetchone()["reason"] is None
