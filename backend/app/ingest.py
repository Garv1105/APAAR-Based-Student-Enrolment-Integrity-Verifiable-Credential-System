"""Batch ingestion and enrolment updates: one transaction per batch (PRD §7, §9.2, §10).

Concurrency (F11): counter rows for the institution's programmes are locked FOR UPDATE, and
every APAAR blind index in the batch takes a transaction advisory lock, so two parallel batches
can neither both slip under a cap nor both miss a cross-institution duplicate.
"""
import secrets
from datetime import date, datetime, timezone

from psycopg.types.json import Jsonb

from . import crypto, ledger
from .auth import audit
from .mocks import apaar_registry
from .validation import Ctx, counter_keys, validate_batch

NOTICE = "A record in batch #{batch} needs AICTE review (case #{case})"  # F4: no other-institution data


def current_year(conn) -> dict:
    return conn.execute("SELECT * FROM academic_years ORDER BY code DESC LIMIT 1").fetchone()


def seat_categories(conn) -> dict:
    return {r["code"]: r for r in conn.execute("SELECT * FROM seat_categories")}


def batch_out(b: dict, replayed=False) -> dict:
    return {"batch_id": b["id"], "institution_id": b["institution_id"], "status": b["status"], "channel": b["channel"],
            "created_at": b["created_at"], "counts": b["row_counts_json"], "replayed": replayed}


def process_batch(conn, user: dict, rows: list[dict], channel: str, idem_key: str | None, request=None) -> dict:
    inst_id = user["institution_id"]
    with conn.transaction():
        b = conn.execute("INSERT INTO upload_batches (institution_id, channel, status, idempotency_key, created_by) "
                         "VALUES (%s,%s,'processing',%s,%s) ON CONFLICT (institution_id, idempotency_key) DO NOTHING RETURNING *",
                         (inst_id, channel, idem_key, user["id"])).fetchone()
        if b is None:  # Idempotency-Key replay: return the original batch, insert nothing
            prev = conn.execute("SELECT * FROM upload_batches WHERE institution_id=%s AND idempotency_key=%s", (inst_id, idem_key)).fetchone()
            return batch_out(prev, replayed=True)

        inst = conn.execute("SELECT * FROM institutions WHERE id=%s", (inst_id,)).fetchone()
        year = current_year(conn)
        cats = seat_categories(conn)
        progs = {p["code"]: p for p in conn.execute(
            "SELECT p.id, p.code, p.duration_years, a.approved_intake FROM programmes p "
            "LEFT JOIN approved_intake a ON a.programme_id=p.id AND a.academic_year=%s WHERE p.institution_id=%s",
            (year["code"], inst_id))}
        counters = {(r["programme_id"], r["category_code"]): r["filled"] for r in conn.execute(
            "SELECT * FROM programme_category_counters WHERE programme_id = ANY(%s) AND academic_year=%s "
            "ORDER BY programme_id, category_code FOR UPDATE", ([p["id"] for p in progs.values()], year["code"]))}

        bis = sorted({crypto.apaar_bi(a) for r in rows if (a := str(r.get("apaar_id") or "").strip()).isdigit() and len(a) == 12})
        for bi in bis:
            conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (bi,))
        own, other = set(), set()
        for r in conn.execute("SELECT s.apaar_bi, p.institution_id FROM enrolments e JOIN students s ON s.id=e.student_id "
                              "JOIN programmes p ON p.id=e.programme_id "
                              "WHERE s.apaar_bi = ANY(%s) AND e.academic_year=%s AND e.status='active'", (bis, year["code"])):
            (own if r["institution_id"] == inst_id else other).add(r["apaar_bi"])

        ctx = Ctx(institution_id=inst_id, institution_status=inst["status"],
                  year={"code": year["code"], "window_start": year["window_start"], "window_end": year["window_end"]},
                  programmes=progs, seat_categories=cats, registry_lookup=apaar_registry().lookup,
                  own_active_bi=own, other_active_bi=other, counters=dict(counters))
        outcomes = validate_batch(rows, ctx)

        issues = [(b["id"], i["row_no"], i["code"], i["severity"], i["field"], i["message"]) for o in outcomes for i in o["issues"]]
        new_cases = []
        for o in outcomes:
            if not o["accepted"]:
                continue
            d = o["data"]
            sid = _student_id(conn, d, o)
            e = conn.execute(
                "INSERT INTO enrolments (student_id, programme_id, academic_year, institution_student_id, status, seat_category_code, "
                "is_supernumerary, is_lateral_entry, year_of_study, is_nri, is_oci, is_fn, is_ciwg, admission_date, batch_id) "
                "VALUES (%s,%s,%s,%s,'active',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
                (sid, o["programme_id"], year["code"], d["institution_student_id"], d["seat_category"], d["is_supernumerary"],
                 d["is_lateral_entry"], d["year_of_study"], d["is_nri"], d["is_oci"], d["is_fn"], d["is_ciwg"],
                 d["admission_date"], b["id"])).fetchone()
            ledger.append(conn, inst_id, "enrolment.created", e)
            if any(i["code"] == "E203" for i in o["issues"]):
                new_cases.append(_open_case(conn, sid, year["code"]))
        if issues:
            with conn.cursor() as cur:
                cur.executemany("INSERT INTO validation_issues (batch_id, row_no, code, severity, field, message) VALUES (%s,%s,%s,%s,%s,%s)", issues)
        for (pid, key), filled in ctx.counters.items():
            if counters.get((pid, key)) != filled:
                conn.execute("UPDATE programme_category_counters SET filled=%s WHERE programme_id=%s AND academic_year=%s AND category_code=%s",
                             (filled, pid, year["code"], key))
        sev = lambda o, s: any(i["severity"] == s for i in o["issues"])  # noqa: E731
        counts = {"rows": len(outcomes), "accepted": sum(o["accepted"] for o in outcomes),
                  "rejected": sum(not o["accepted"] for o in outcomes),
                  "warnings": sum(sev(o, "warning") for o in outcomes), "flags": sum(sev(o, "flag") for o in outcomes),
                  "cases_opened": len(set(new_cases))}
        b = conn.execute("UPDATE upload_batches SET status='completed', row_counts_json=%s WHERE id=%s RETURNING *",
                         (Jsonb(counts), b["id"])).fetchone()
        audit(conn, user, "batch.upload", "upload_batch", b["id"], request=request)
    return batch_out(b)


def _student_id(conn, d: dict, o: dict) -> int:
    if o["bi"]:
        s = conn.execute("SELECT id FROM students WHERE apaar_bi=%s", (o["bi"],)).fetchone()
        if s:
            return s["id"]
    sid = conn.execute("SELECT nextval('students_id_seq') id").fetchone()["id"]  # id first: it is part of the AAD
    enc = lambda col, v: crypto.encrypt("students", col, sid, v)  # noqa: E731
    conn.execute(
        "INSERT INTO students (id, apaar_enc, apaar_bi, apaar_masked, apaar_status, provisional_id, name_enc, dob_enc, "
        "guardian_name_enc, bi_dob_bucket, bi_name_phon) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (sid, enc("apaar", d["apaar_id"]) if o["bi"] else None, o["bi"],
         crypto.mask_apaar(d["apaar_id"]) if o["bi"] else None, o["apaar_status"],
         None if o["bi"] else f"PROV-{secrets.token_hex(6).upper()}",
         enc("name", d["student_name"]), enc("dob", d["dob"].isoformat()),
         enc("guardian_name", d["guardian_name"]) if d["guardian_name"] else None,
         crypto.dob_bucket(d["dob"].isoformat()), crypto.name_phonetic(d["student_name"])))
    return sid


def _open_case(conn, student_id: int, year: str) -> int:
    ids = [r["id"] for r in conn.execute("SELECT id FROM enrolments WHERE student_id=%s AND academic_year=%s AND status='active' ORDER BY id",
                                         (student_id, year))]
    case = conn.execute("SELECT id FROM duplicate_cases WHERE student_id=%s AND status IN ('flagged','under_investigation')", (student_id,)).fetchone()
    if case:
        conn.execute("UPDATE duplicate_cases SET enrolment_ids=%s WHERE id=%s", (ids, case["id"]))
        return case["id"]
    return conn.execute("INSERT INTO duplicate_cases (student_id, enrolment_ids, status) VALUES (%s,%s,'flagged') RETURNING id",
                        (student_id, ids)).fetchone()["id"]


class PatchError(Exception):
    def __init__(self, status: int, detail: str):
        self.status, self.detail = status, detail


def patch_enrolment(conn, user: dict, enrolment_id: int, body: dict, request=None) -> dict:
    with conn.transaction():
        e = conn.execute("SELECT e.* FROM enrolments e JOIN programmes p ON p.id=e.programme_id "
                         "WHERE e.id=%s AND p.institution_id=%s FOR UPDATE OF e", (enrolment_id, user["institution_id"])).fetchone()
        if e is None:
            raise PatchError(404, "Enrolment not found")  # same answer for "not yours" (no oracle)
        new_status = body.get("status") or e["status"]
        if e["status"] != "active" and new_status == "active":
            raise PatchError(422, "Re-admission must go through a new upload so it is validated against intake")
        flags = []
        year = conn.execute("SELECT * FROM academic_years WHERE code=%s", (e["academic_year"],)).fetchone()
        if datetime.now(timezone.utc) > year["deadline"]:
            flags.append("E501")
        if e["status"] == "active" and new_status != "active":
            cats = seat_categories(conn)
            for k in counter_keys({"seat_category": e["seat_category_code"], **e}, cats):
                conn.execute("UPDATE programme_category_counters SET filled = filled - 1 "
                             "WHERE programme_id=%s AND academic_year=%s AND category_code=%s", (e["programme_id"], e["academic_year"], k))
        ended = body.get("ended_on") or (date.today() if new_status != "active" else None)
        e = conn.execute("UPDATE enrolments SET status=%s, ended_on=%s, year_of_study=%s WHERE id=%s RETURNING *",
                         (new_status, ended, body.get("year_of_study") or e["year_of_study"], enrolment_id)).fetchone()
        ledger.append(conn, user["institution_id"], "enrolment.updated", e)
        if flags:
            conn.execute("INSERT INTO anomaly_flags (institution_id, programme_id, type, score, evidence_json) VALUES (%s,%s,'E501',1,%s)",
                         (user["institution_id"], e["programme_id"],
                          Jsonb({"enrolment_id": e["id"], "change": {"status": new_status, "ended_on": str(ended)},
                                 "deadline": year["deadline"].isoformat(), "at": datetime.now(timezone.utc).isoformat(),
                                 "reason": body.get("reason")})))
        audit(conn, user, "enrolment.update", "enrolment", e["id"], student_id=e["student_id"], reason=body.get("reason"), request=request)
    return enrolment_out(conn, e, flags)


def enrolment_out(conn, e: dict, flags=()) -> dict:
    s = conn.execute("SELECT apaar_masked, provisional_id, apaar_status FROM students WHERE id=%s", (e["student_id"],)).fetchone()
    return {"id": e["id"], "programme_id": e["programme_id"], "academic_year": e["academic_year"],
            "institution_student_id": e["institution_student_id"], **s, "status": e["status"],
            "seat_category_code": e["seat_category_code"], "flags": list(flags)}
