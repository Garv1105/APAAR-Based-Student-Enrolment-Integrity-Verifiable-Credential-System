"""T0.6: institution isolation enforced by Postgres RLS, proven with raw SQL as app_user."""
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
    """Rows visible per table; counters restricted to A's programmes (every institution sees its own)."""
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
        assert mine["ledger_entries"] == 0 and mine["audit_logs"] == 0  # regulator-only tables
    with as_app("aicte_officer") as c:
        assert counts(c)["enrolments"] == admin["enrolments"]
    with as_app() as c:  # no settings at all
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
    for sql, args in (("SELECT ledger_append(%s,'x',1,repeat('a',64))", (A,)),          # forge A's ledger
                      ("SELECT open_duplicate_case(%s,'2026-27')", (e["student_id"],)),  # case on someone else's student
                      ("DELETE FROM enrolments", ()), ("TRUNCATE enrolments", ())):
        with as_app("institution_admin", B) as c, pytest.raises(psycopg.errors.Error):
            c.execute(sql, args)


def test_review_findings_m1_m2_m3(client, dbconn):
    """Security review t0.6: ledger forgery, password-hash exposure, unprotected credential tables."""
    upload(client, "inst-a", "A1.csv")
    eid_a = dbconn.execute("SELECT id FROM enrolments LIMIT 1").fetchone()["id"]
    client.post("/v1/ledger/checkpoints", headers=login(client, "aicte"))
    # M1: B cannot append ledger events for A's enrolment, nor invent event types
    for args in ((B, "enrolment.updated", eid_a), (B, "anything", eid_a)):
        with as_app("institution_admin", B) as c, pytest.raises(psycopg.errors.RaiseException):
            c.execute("SELECT ledger_append(%s, %s, %s, repeat('a', 64))", args)
    # M2: users table (password hashes) not readable by any app connection; login still works
    for role, inst in (("", ""), ("institution_admin", A), ("aicte_officer", "")):
        with as_app(role, inst) as c, pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("SELECT password_hash FROM users")
    assert login(client, "inst-a")
    # M3: checkpoints can't be rewritten; credential tables deny by default
    with as_app("aicte_officer") as c, pytest.raises(psycopg.errors.InsufficientPrivilege):
        c.execute("UPDATE ledger_checkpoints SET upto_seq = 1")
    with as_app("institution_admin", A) as c, pytest.raises(psycopg.errors.InsufficientPrivilege):
        c.execute("INSERT INTO ledger_checkpoints (upto_seq, root_hash, aicte_sig) VALUES (1, 'x', 'y')")
    with as_app("institution_admin", B) as c:
        for t in ("consents", "credentials", "status_lists", "issuer_registry"):
            assert c.execute(f"SELECT count(*) n FROM {t}").fetchone()["n"] == 0
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("INSERT INTO issuer_registry (did, name, public_keys_json, status, valid_from) "
                      "VALUES ('did:x', 'fake', '[]', 'active', now())")
    # LOW 3: bounded inputs
    with as_app("institution_admin", B) as c, pytest.raises(psycopg.errors.RaiseException):
        c.execute("SELECT * FROM active_enrolment_owners(ARRAY['x'], '2025-26')")


def test_definer_functions_refuse_other_roles(client):
    for role in ("", "verifier", "student", "aicte_officer"):
        with as_app(role) as c, pytest.raises(psycopg.errors.RaiseException):
            c.execute("SELECT * FROM active_enrolment_owners(ARRAY['x'], '2026-27')")
