import psycopg
import pytest

from app import db
from conftest import login
from test_api import upload

A, B = "1-0000000001", "1-0000000002"
SCOPED = ["enrolments", "students", "upload_batches", "validation_issues", "programme_category_counters",
          "duplicate_cases", "anomaly_flags", "audit_logs", "ledger_entries"]


def as_app(role="", inst="", user_id="x"):
    return db.app_connect({"role": role, "institution_id": inst, "id": user_id})


def counts(conn):
    out = {t: conn.execute(f"SELECT count(*) n FROM {t}").fetchone()["n"] for t in SCOPED}
    out["programme_category_counters"] = conn.execute(
        "SELECT count(*) n FROM programme_category_counters WHERE programme_id LIKE %s", (A + ":%",)).fetchone()["n"]
    return out


def test_app_role_cannot_bypass_rls(_test_db, dbconn):
    r = dbconn.execute("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname='app_user'").fetchone()
    assert r == {"rolsuper": False, "rolbypassrls": False}
    owners = {x["tableowner"] for x in dbconn.execute("SELECT tableowner FROM pg_tables WHERE schemaname='public'")}
    assert "app_user" not in owners
    forced = {x["relname"]: x["relforcerowsecurity"] for x in dbconn.execute(
        "SELECT relname, relforcerowsecurity FROM pg_class WHERE relname = ANY(%s)", (SCOPED,))}
    assert forced == {t: True for t in SCOPED}


def test_app_connections_run_as_app_user(client):
    with as_app("institution_admin", A) as c:
        assert c.execute("SELECT current_user u").fetchone()["u"] == "app_user"


def test_institution_b_sees_none_of_a(client, dbconn):
    upload(client, "inst-a", "A1.csv")
    client.post("/v1/ledger/checkpoints", headers=login(client, "aicte"))
    admin = counts(dbconn)
    assert admin["enrolments"] > 0 and admin["students"] > 0 and admin["ledger_entries"] > 0
    with as_app("institution_admin", B) as c:
        assert counts(c) == {t: 0 for t in SCOPED}
    with as_app("institution_admin", A) as c:
        mine = counts(c)
        assert mine["enrolments"] == admin["enrolments"] and mine["students"] == admin["students"]
        assert mine["ledger_entries"] == 0 and mine["audit_logs"] == 0
    with as_app("aicte_officer") as c:
        assert counts(c)["enrolments"] == admin["enrolments"]
    with as_app() as c:
        assert counts(c) == {t: 0 for t in SCOPED}


def test_b_cannot_write_into_a(client, dbconn):
    upload(client, "inst-a", "A1.csv")
    e = dbconn.execute("SELECT * FROM enrolments LIMIT 1").fetchone()
    with as_app("institution_admin", B) as c:
        assert c.execute("UPDATE enrolments SET status='withdrawn' WHERE id=%s", (e["id"],)).rowcount == 0
        assert c.execute("UPDATE programme_category_counters SET filled=0 WHERE programme_id=%s", (e["programme_id"],)).rowcount == 0
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("INSERT INTO enrolments (student_id, programme_id, academic_year, institution_student_id, status, "
                      "seat_category_code, is_supernumerary, is_lateral_entry, year_of_study, is_nri, is_oci, is_fn, is_ciwg, "
                      "admission_date, batch_id) VALUES (%s, %s, '2026-27', 'X', 'active', 'REGULAR', false, false, 1, "
                      "false, false, false, false, '2026-08-01', %s)", (e["student_id"], e["programme_id"], e["batch_id"]))
    for sql, args in (("SELECT ledger_append(%s,'x',1,repeat('a',64))", (A,)),
                      ("SELECT open_duplicate_case(%s,'2026-27')", (e["student_id"],)),
                      ("DELETE FROM enrolments", ()), ("TRUNCATE enrolments", ())):
        with as_app("institution_admin", B) as c, pytest.raises(psycopg.errors.Error):
            c.execute(sql, args)


def test_review_findings_m1_m2_m3(client, dbconn):
    upload(client, "inst-a", "A1.csv")
    eid_a = dbconn.execute("SELECT id FROM enrolments LIMIT 1").fetchone()["id"]
    client.post("/v1/ledger/checkpoints", headers=login(client, "aicte"))
    for args in ((B, "enrolment.updated", eid_a), (B, "anything", eid_a)):
        with as_app("institution_admin", B) as c, pytest.raises(psycopg.errors.RaiseException):
            c.execute("SELECT ledger_append(%s, %s, %s, repeat('a', 64))", args)
    for role, inst in (("", ""), ("institution_admin", A), ("aicte_officer", "")):
        with as_app(role, inst) as c, pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("SELECT password_hash FROM users")
    assert login(client, "inst-a")
    with as_app("aicte_officer") as c, pytest.raises(psycopg.errors.InsufficientPrivilege):
        c.execute("UPDATE ledger_checkpoints SET upto_seq = 1")
    with as_app("institution_admin", A) as c, pytest.raises(psycopg.errors.InsufficientPrivilege):
        c.execute("INSERT INTO ledger_checkpoints (upto_seq, root_hash, aicte_sig) VALUES (1, 'x', 'y')")
    for stmt in ("INSERT INTO issuer_registry (did, kind, name, public_keys_json, status, valid_from) "
                 "VALUES ('did:x', 'institution', 'fake', '[]', 'active', now())",
                 "UPDATE issuer_registry SET status = 'active'",
                 "UPDATE status_lists SET bits = bits",
                 "UPDATE credentials SET vc_hash = 'x'",
                 "DELETE FROM credentials"):
        with as_app("institution_admin", A) as c, pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute(stmt)
    with as_app("institution_admin", B) as c:
        assert c.execute("SELECT count(*) n FROM issuer_registry").fetchone()["n"] == 5
        assert c.execute("SELECT count(*) n FROM status_lists").fetchone()["n"] == 10
    with as_app("institution_admin", B) as c, pytest.raises(psycopg.errors.RaiseException):
        c.execute("SELECT * FROM active_enrolment_owners(ARRAY['x'], '2025-26')")


def test_credential_functions_enforce_issuer_and_student_rules(client, dbconn):
    upload(client, "inst-a", "A1.csv")
    e = dbconn.execute("SELECT e.id, e.student_id FROM enrolments e JOIN students s ON s.id=e.student_id "
                       "WHERE s.apaar_bi IS NOT NULL LIMIT 1").fetchone()
    vc = client.post(f"/v1/credentials/{e['id']}/issue", json={"type": "EnrolmentCredential"}, headers=login(client, "inst-a")).json()
    a_did = vc["issuer_did"]
    for args in ((("institution_admin", B), "SELECT * FROM allocate_status_index(%s)", (a_did,)),
                 (("verifier", ""), "SELECT * FROM allocate_status_index(%s)", (a_did,)),
                 (("institution_admin", B), "SELECT set_credential_status(%s, 'revocation', true)", (vc["id"],)),
                 (("student", "", "x", e["student_id"]), "SELECT set_credential_status(%s, 'revocation', true)", (vc["id"],))):
        role = args[0]
        with db.app_connect({"role": role[0], "institution_id": role[1], "id": "x",
                             "student_id": role[3] if len(role) > 3 else None}) as c, pytest.raises(psycopg.errors.RaiseException):
            c.execute(args[1], args[2])
    with as_app("institution_admin", B) as c, pytest.raises(psycopg.errors.InsufficientPrivilege):
        c.execute("INSERT INTO credentials (id, type, subject_student_id, issuer_did, status_list_id, status_index, vc_enc, vc_hash) "
                  "VALUES ('urn:x', 'EnrolmentCredential', %s, %s, 'inst-1-0000000001-revocation', 5, 'x', 'x')", (e["student_id"], a_did))
    with as_app("institution_admin", B) as c:
        assert c.execute("SELECT count(*) n FROM credentials").fetchone()["n"] == 0
    with as_app("institution_admin", A, "inst-a") as c:
        c.execute("SELECT set_credential_status(%s, 'revocation', true)", (vc["id"],))
        c.commit()
        for purpose, value in (("revocation", False), ("bogus", True)):
            with pytest.raises(psycopg.errors.RaiseException):
                c.execute("SELECT set_credential_status(%s, %s, %s)", (vc["id"], purpose, value))
            c.rollback()


def test_definer_functions_refuse_other_roles(client):
    for role in ("", "verifier", "student", "aicte_officer"):
        with as_app(role) as c, pytest.raises(psycopg.errors.RaiseException):
            c.execute("SELECT * FROM active_enrolment_owners(ARRAY['x'], '2026-27')")
