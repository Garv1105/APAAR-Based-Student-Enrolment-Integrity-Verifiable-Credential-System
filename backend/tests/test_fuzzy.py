from conftest import login
from test_api import pending_rows, upload

from app.validation import names_match, probable_same_person


def test_name_variants_match():
    for a, b in [("Ravi Kumar Sharma", "Ravi Sharma"), ("Ravi Sharma", "Ravi K Sharma"), ("Sharma Ravi", "Mr. RAVI SHARMA"),
                 ("Mohd Irfan", "Muhammad Irfan"), ("Lakshmi Rao", "Laxmi Rao"), ("Amit Chaudhary", "Amit Chowdhury"),
                 ("Bhavana Iyer", "Bhavna Iyer"), ("Shruti Nair", "Sruthi Nair")]:
        assert names_match(a, b), (a, b)


def test_different_names_do_not_match():
    for a, b in [("Asha Rao", "Usha Rao"), ("Rahul Jain", "Rahil Jain"), ("Kiran Das", "Karan Das"), ("Pradip Sinha", "Pradeep Singh"),
                 ("Ravi Hegde", "Aarav H Gowda"), ("Ravi K Sharma", "Ravi M Sharma"), ("Sharma", "Sharma"), ("R Sharma", "Ravi Sharma")]:
        assert not names_match(a, b), (a, b)


def test_same_person_needs_dob_and_guardian():
    a = {"name": "Ravi Kumar Sharma", "dob": "2007-03-09", "guardian": "Suresh Sharma"}
    assert probable_same_person(a, {"name": "Ravi Sharma", "dob": "2007-03-09", "guardian": "Mr. Suresh Sharma"})
    assert probable_same_person(a, {"name": "Ravi Sharma", "dob": "2007-03-09", "guardian": None})
    assert not probable_same_person(a, {"name": "Ravi Sharma", "dob": "2007-03-10", "guardian": "Suresh Sharma"})
    assert not probable_same_person(a, {"name": "Ravi Sharma", "dob": "2007-03-09", "guardian": "Mahesh Verma"})
    assert not probable_same_person(a, {"name": "Usha Sharma", "dob": "2007-03-09", "guardian": "Suresh Sharma"})


def _row(sid, name, guardian="Suresh Sharma", dob="2007-03-09"):
    return pending_rows(1, 7000)[0] | {"institution_student_id": sid, "student_name": name, "guardian_name": guardian, "dob": dob}


def test_fuzzy_duplicate_flags_row_and_opens_neutral_case(client, dbconn):
    assert upload(client, "inst-a", rows=[_row("A/1", "Ravi Kumar Sharma")]).status_code == 201
    b = upload(client, "inst-b", rows=[_row("B/1", "RAVI SHARMA"), _row("B/2", "Usha Sharma")])
    assert b.status_code == 201, b.text
    batch = b.json()
    assert batch["counts"]["accepted"] == 2 and batch["counts"]["cases_opened"] == 1

    case = dbconn.execute("SELECT * FROM duplicate_cases ORDER BY id DESC LIMIT 1").fetchone()
    assert case["kind"] == "fuzzy" and case["status"] == "flagged" and len(case["enrolment_ids"]) == 2

    mine = client.get("/v1/cases", headers=login(client, "inst-b")).json()
    assert [c["id"] for c in mine] == [case["id"]] and "1-0000000001" not in str(mine) and "Ravi" not in str(mine)

    h = login(client, "aicte")
    regulator = next(c for c in client.get("/v1/cases", headers=h).json() if c["id"] == case["id"])
    assert "possible duplicate" in regulator["notice"]
    detail = client.post(f"/v1/cases/{case['id']}/unmask", json={"reason": "Reviewing a possible duplicate"}, headers=h).json()["detail"]
    assert {(d["institution_id"], d["name"]) for d in detail} == {("1-0000000001", "Ravi Kumar Sharma"), ("1-0000000002", "RAVI SHARMA")}

    audit = dbconn.execute("SELECT reason FROM audit_logs WHERE action='duplicates.fuzzy_compare' AND entity_id=%s",
                           (str(batch["batch_id"]),)).fetchone()
    assert audit and "Ravi" not in audit["reason"]


def test_same_institution_and_distinct_people_are_not_fuzzy_flagged(client, dbconn):
    assert upload(client, "inst-a", rows=[_row("A/1", "Ravi Kumar Sharma")]).status_code == 201
    assert upload(client, "inst-a", rows=[_row("A/2", "Ravi Sharma", dob="2007-03-09")]).status_code == 201
    assert upload(client, "inst-b", rows=[_row("B/1", "Ravi Sharma", guardian="Mahesh Verma")]).status_code == 201
    assert dbconn.execute("SELECT count(*) n FROM duplicate_cases WHERE kind='fuzzy'").fetchone()["n"] == 0
