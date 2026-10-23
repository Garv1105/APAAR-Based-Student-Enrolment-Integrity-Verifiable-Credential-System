"""Vertical slice through the real API + Postgres (apaar_test database)."""
import csv
import io
import json
import threading
from datetime import date, timedelta
from pathlib import Path

from app.contracts import CSV_COLUMNS
from app.main import csv_safe
from conftest import login

SYN = Path(__file__).resolve().parent.parent / "data/synthetic"


def upload(client, user, name=None, rows=None, key=None):
    body = (SYN / name).read_bytes() if name else _csv(rows)
    h = login(client, user) | ({"Idempotency-Key": key} if key else {})
    return client.post("/v1/batches", files={"file": ("f.csv", body, "text/csv")}, headers=h)


def _csv(rows):
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=CSV_COLUMNS)
    w.writeheader()
    w.writerows(rows)
    return buf.getvalue().encode()


def pending_rows(n, start=0, prog="CSE"):
    """Rows without APAAR (reason PENDING): no registry needed, still counted (F10)."""
    base = date(2006, 1, 1)
    return [{"apaar_id": "", "apaar_reason": "PENDING", "institution_student_id": f"T/{start + i}", "student_name": "Test Student",
             "dob": (base + timedelta(days=start + i)).isoformat(), "guardian_name": "", "programme_code": prog,
             "academic_year": "2026-27", "year_of_study": "1", "seat_category": "REGULAR", "is_supernumerary": "N",
             "is_lateral_entry": "N", "is_nri": "N", "is_oci": "N", "is_fn": "N", "is_ciwg": "N",
             "admission_date": "2026-08-01", "declared_intake": ""} for i in range(n)]


def test_upload_clean_file_stores_encrypted(client, dbconn):
    r = upload(client, "inst-a", "A1.csv")
    assert r.status_code == 201, r.text
    c = r.json()["counts"]
    n = sum(1 for _ in csv.DictReader(open(SYN / "A1.csv", encoding="utf-8")))
    assert c["rows"] == n and c["accepted"] == n and c["rejected"] == 0 and c["warnings"] == 2
    raw = dbconn.execute("SELECT id, apaar_enc, name_enc, apaar_bi, apaar_masked FROM students").fetchall()
    from app import crypto
    s = raw[0]
    assert len(crypto.decrypt("students", "name", s["id"], s["name_enc"])) > 0  # decrypts only with its own row id
    first = next(csv.DictReader(open(SYN / "A1.csv", encoding="utf-8")))
    blob = b"".join(bytes(x["apaar_enc"] or b"") + bytes(x["name_enc"]) for x in raw)
    assert first["apaar_id"].encode() not in blob and first["student_name"].encode() not in blob
    assert all(x["apaar_masked"] is None or x["apaar_masked"].startswith("XXXX-XXXX-") for x in raw)


def test_idempotency_key_replays_without_duplicating(client, dbconn):
    r1 = upload(client, "inst-a", "A1.csv", key="k1")
    r2 = upload(client, "inst-a", "A1.csv", key="k1")
    assert r1.status_code == 201 and r2.status_code == 200 and r2.json()["replayed"]
    assert r1.json()["batch_id"] == r2.json()["batch_id"]
    assert dbconn.execute("SELECT count(*) n FROM enrolments").fetchone()["n"] == r1.json()["counts"]["accepted"]
    r3 = upload(client, "inst-a", "C1.csv", key="k1")  # same key, different content
    assert r3.status_code == 422 and r3.headers["content-type"] == "application/problem+json"
    assert upload(client, "inst-b", "A1.csv", key="k1").status_code == 201  # keys are per institution


def test_institution_isolation(client):
    bid = upload(client, "inst-a", "A1.csv").json()["batch_id"]
    hb = login(client, "inst-b")
    for path in (f"/v1/batches/{bid}", f"/v1/batches/{bid}/issues", f"/v1/batches/{bid}/report.csv",
                 "/v1/programmes/1-0000000001:CSE/seats"):
        assert client.get(path, headers=hb).status_code == 404, path
    assert client.get("/v1/dashboard/aicte", headers=hb).status_code == 403
    assert client.get(f"/v1/batches/{bid}", headers=login(client, "aicte")).status_code == 200


def test_auth_rejects_missing_and_tampered_tokens(client):
    assert client.get("/v1/dashboard/institution").status_code == 401
    tok = login(client, "inst-a")["Authorization"]
    assert client.get("/v1/dashboard/institution", headers={"Authorization": tok[:-2] + "xx"}).status_code == 401
    assert client.post("/v1/auth/login", json={"user_id": "inst-a", "password": "wrong"}).status_code == 401


def test_missing_columns_is_problem_json(client):
    r = client.post("/v1/batches", content=b"apaar_id,student_name\n1,x\n", headers=login(client, "inst-a") | {"Content-Type": "text/csv"})
    assert r.status_code == 422 and r.headers["content-type"] == "application/problem+json"
    assert "programme_code" in r.json()["detail"]["missing"]


def test_error_report_and_dashboards(client):
    upload(client, "inst-a", "A1.csv")
    bid = upload(client, "inst-b", "B1.csv").json()["batch_id"]
    hb = login(client, "inst-b")
    report = client.get(f"/v1/batches/{bid}/report.csv", headers=hb)
    assert report.status_code == 200 and report.text.startswith("row_no,code,severity,field,message,fix_hint")
    codes = {r["code"] for r in csv.DictReader(io.StringIO(report.text))}
    assert {"E101", "E102", "E103", "E201", "E203", "E301", "E302", "E303", "E401"} <= codes
    d = client.get("/v1/dashboard/institution", headers=hb).json()
    cse = next(p for p in d["programmes"] if p["programme_id"] == "1-0000000002:CSE")
    reg = next(line for line in cse["lines"] if line["category_code"] == "REGULAR")
    assert reg["cap"] == 120 and reg["excess"] == 5
    assert d["open_notices"] and all("1-0000000001" not in n and "Demo Institute" not in n for n in d["open_notices"])
    da = client.get("/v1/dashboard/institution", headers=login(client, "inst-a")).json()
    assert da["open_notices"]  # the other side is notified too
    agg = client.get("/v1/dashboard/aicte", headers=login(client, "aicte")).json()
    # 3 injected duplicates + the 2 "legitimate move" students, who A has NOT withdrawn in this test
    assert agg["open_cases"] == 5 and agg["totals"]["excess_seats"] >= 5 and agg["ledger_ok"]


def test_parallel_batches_cannot_both_slip_under_intake(client, dbconn):
    """F11: B CSE intake 120; two concurrent 70-row batches -> exactly 20 E301 flags."""
    results = []
    files = [pending_rows(70, 0), pending_rows(70, 1000)]
    tokens = login(client, "inst-b")

    def go(rows):
        results.append(client.post("/v1/batches", files={"file": ("f.csv", _csv(rows), "text/csv")}, headers=tokens))
    ts = [threading.Thread(target=go, args=(f,)) for f in files]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert all(r.status_code == 201 for r in results), [r.text for r in results]
    e301 = dbconn.execute("SELECT count(*) n FROM validation_issues WHERE code='E301'").fetchone()["n"]
    filled = dbconn.execute("SELECT filled FROM programme_category_counters WHERE programme_id='1-0000000002:CSE' "
                            "AND category_code='REGULAR'").fetchone()["filled"]
    assert e301 == 20 and filled == 140


def _find(client, user, apaar):
    r = client.get("/v1/enrolments", params={"apaar": apaar}, headers=login(client, user))
    assert r.status_code == 200 and len(r.json()) == 1, r.text
    return r.json()[0]


def test_patch_withdraw_post_deadline_and_ledger_tamper(client, dbconn):
    upload(client, "inst-a", "A1.csv")
    apaar = next(r["apaar_id"] for r in csv.DictReader(open(SYN / "A1.csv", encoding="utf-8")) if r["apaar_id"] and r["seat_category"] == "REGULAR")
    e = _find(client, "inst-a", apaar)
    before = dbconn.execute("SELECT filled FROM programme_category_counters WHERE programme_id=%s AND category_code='REGULAR'",
                            (e["programme_id"],)).fetchone()["filled"]
    h = login(client, "inst-a")
    r = client.patch(f"/v1/enrolments/{e['id']}", json={"status": "withdrawn", "reason": "left"}, headers=h)
    assert r.status_code == 200 and r.json()["flags"] == []
    after = dbconn.execute("SELECT filled FROM programme_category_counters WHERE programme_id=%s AND category_code='REGULAR'",
                           (e["programme_id"],)).fetchone()["filled"]
    assert after == before - 1
    # other institution can't touch it, and can't tell it exists
    assert client.patch(f"/v1/enrolments/{e['id']}", json={"status": "completed", "reason": "x" * 3}, headers=login(client, "inst-b")).status_code == 404

    dbconn.execute("UPDATE academic_years SET deadline = now() - interval '1 day'")
    dbconn.commit()
    e2 = _find(client, "inst-a", next(r["apaar_id"] for r in csv.DictReader(open(SYN / "A1.csv", encoding="utf-8"))
                                      if r["apaar_id"] and r["apaar_id"] != apaar))
    r = client.patch(f"/v1/enrolments/{e2['id']}", json={"status": "withdrawn", "ended_on": "2026-08-01", "reason": "backdated"}, headers=h)
    assert r.json()["flags"] == ["E501"]

    ha = login(client, "aicte")
    assert client.post("/v1/ledger/checkpoints", headers=ha).status_code == 200
    assert client.get("/v1/ledger/verify", headers=ha).json()["ok"]
    dbconn.execute("UPDATE enrolments SET status='active', ended_on=NULL WHERE id=%s", (e2["id"],))  # silent edit
    dbconn.commit()
    v = client.get("/v1/ledger/verify", headers=ha).json()
    assert not v["ok"] and any(f"enrolment {e2['id']}" in p for p in v["problems"])
    dbconn.execute("UPDATE enrolments SET status='withdrawn', ended_on='2026-08-01' WHERE id=%s", (e2["id"],))
    dbconn.execute("UPDATE ledger_entries SET payload_hash = repeat('0', 64) WHERE seq = 3")  # rewrite history
    dbconn.commit()
    assert not client.get("/v1/ledger/verify", headers=ha).json()["ok"]


def test_csv_formula_injection_neutralised():
    assert csv_safe("=HYPERLINK(1)") == "'=HYPERLINK(1)" and csv_safe("@x") == "'@x" and csv_safe("ok") == "ok"


def test_scenario_eval_through_api(client, dbconn, capsys):
    """Full labelled scenario through API + DB, including E501 on patches. Do not loosen."""
    truth = {(t["file"], t["row_no"]): set(t["expected"]) for t in json.loads((SYN / "ground_truth.json").read_text())["rows"]}
    pred, patch_fail = {}, []
    for step in json.loads((SYN / "scenario.json").read_text())["steps"]:
        if step["op"] == "set_deadline":
            dbconn.execute("UPDATE academic_years SET deadline=%s WHERE code=%s", (step["deadline"], step["academic_year"]))
            dbconn.commit()
        elif step["op"] == "upload":
            r = upload(client, step["user"], step["file"])
            assert r.status_code == 201, r.text
            n = r.json()["counts"]["rows"]
            for i in range(1, n + 1):
                pred[(step["file"], i)] = set()
            for row in dbconn.execute("SELECT row_no, code FROM validation_issues WHERE batch_id=%s", (r.json()["batch_id"],)):
                pred[(step["file"], row["row_no"])].add(row["code"])
        elif step["op"] == "patch":
            e = _find(client, step["user"], step["apaar"])
            r = client.patch(f"/v1/enrolments/{e['id']}", json=step["body"], headers=login(client, step["user"]))
            if r.json().get("flags") != step["expected"]:
                patch_fail.append((step, r.json()))
    assert pred.keys() == truth.keys()
    wrong = {k: (truth[k], pred[k]) for k in truth if truth[k] != pred[k]}
    with capsys.disabled():
        print(f"\nAPI eval: {len(truth)} rows, {len(truth) - len(wrong)} exact, patches ok: {not patch_fail}")
    assert not wrong, list(wrong.items())[:5]
    assert not patch_fail, patch_fail
