import csv
import io

from conftest import login
from test_api import upload


def get_csv(client, user, kind, **params):
    r = client.get(f"/v1/reports/{kind}.csv", params=params, headers=login(client, user))
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/csv")
    return list(csv.DictReader(io.StringIO(r.text)))


def load(client):
    for user, f in (("inst-a", "A1.csv"), ("inst-b", "B1.csv"), ("inst-c", "C1.csv")):
        assert upload(client, user, f).status_code == 201


def test_state_summary_numbers(client):
    load(client)
    rows = {r["state"]: r for r in get_csv(client, "aicte", "state-summary")}
    mh = rows["Maharashtra"]
    assert mh["approved_intake"] == "180" and mh["excess_seats"] == "9" and mh["institutions"] == "1"
    assert rows["Bihar"]["approved_institutions"] == "0" and rows["Bihar"]["active_enrolments"] == "0"
    assert float(rows["Karnataka"]["apaar_coverage_pct"]) > 90
    dash = client.get("/v1/dashboard/aicte", headers=login(client, "aicte")).json()
    assert sum(int(r["active_enrolments"]) for r in rows.values()) == dash["totals"]["active_enrolments"]


def test_category_utilisation_scoped_by_rls(client):
    load(client)
    all_rows = get_csv(client, "aicte", "category-utilisation")
    assert {r["institution"] for r in all_rows} >= {"Kalyani Devi Hegde Institute of Technology, Hubballi", "Anandrao Kulkarni College of Engineering, Solapur"}
    b = get_csv(client, "inst-b", "category-utilisation")
    assert b and {r["institution"] for r in b} == {"Anandrao Kulkarni College of Engineering, Solapur"}
    sn = next(r for r in b if r["programme_code"] == "CSE" and r["category_code"] == "SN_FN_OCI_CIWG")
    assert (sn["cap"], sn["filled"], sn["excess"], sn["utilisation_pct"]) == ("18", "22", "4", "122.2")
    sub = next(r for r in b if r["category_code"] == "SN_FN_OCI_CIWG:CIWG" and r["programme_code"] == "CSE")
    assert sub["note"].startswith("sub-cap")


def test_accreditation_pack_own_institution_only(client):
    load(client)
    b = get_csv(client, "inst-b", "accreditation", institution_id="1-0000000001")
    assert {r["institution_id"] for r in b} == {"1-0000000002"}
    cse = next(r for r in b if r["programme_code"] == "CSE")
    assert cse["excess_seats"] == "9" and cse["regular_filled"] == "125" and int(cse["open_duplicate_cases"]) >= 1
    assert cse["institution_rows_rejected"] != "0"
    a = get_csv(client, "aicte", "accreditation", institution_id="1-0000000001")
    assert {r["programme_code"] for r in a} == {"CSE", "ECE"}
    r = client.get("/v1/reports/accreditation.csv", headers=login(client, "aicte"))
    assert r.status_code == 422


def test_excess_case_file_has_evidence_and_ledger_status(client):
    load(client)
    client.post("/v1/ledger/checkpoints", headers=login(client, "aicte"))
    rows = get_csv(client, "aicte", "excess-case-file")
    assert len(rows) == 10 and {r["code"] for r in rows} == {"E301", "E302"}
    assert all(r["institution"] == "Anandrao Kulkarni College of Engineering, Solapur" for r in rows)
    assert all(r["ledger_consistent"] == "True" and r["ledger_checkpoint_root"] for r in rows)
    assert "CSE REGULAR: 125/120 (+5)" in rows[0]["current_over_cap"]


def test_reports_neutralise_formula_injection(client, dbconn):
    load(client)
    dbconn.execute("UPDATE institutions SET name = %s WHERE id = '1-0000000002'", ('=HYPERLINK("http://evil","x")',))
    dbconn.commit()
    raw = client.get("/v1/reports/category-utilisation.csv", headers=login(client, "aicte")).text
    assert "'=HYPERLINK" in raw and "\n=HYPERLINK" not in raw and ",=HYPERLINK" not in raw


def test_report_access_rules(client):
    for kind in ("state-summary", "excess-case-file"):
        assert client.get(f"/v1/reports/{kind}.csv", headers=login(client, "inst-a")).status_code == 403
    assert client.get("/v1/reports/state-summary.csv", headers=login(client, "employer")).status_code == 403
    assert client.get("/v1/reports/nope.csv", headers=login(client, "aicte")).status_code == 404
    assert [x["kind"] for x in client.get("/v1/reports", headers=login(client, "inst-a")).json()] == ["accreditation", "category-utilisation"]
    assert len(client.get("/v1/reports", headers=login(client, "auditor")).json()) == 4
