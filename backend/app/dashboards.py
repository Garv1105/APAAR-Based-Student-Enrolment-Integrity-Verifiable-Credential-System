"""Dashboard aggregates (PRD §14). Plain SQL over live tables; counters are the intake source."""
import time

from . import ledger

_LEDGER_OK: tuple[float, bool] | None = None


def _ledger_ok(conn) -> bool:
    """Dashboard badge only. ponytail: 60 s per-process cache, because a full verify reads every ledger entry and enrolment
    (about 3 s at 58k rows) and the dashboard polls every 30 s. GET /v1/ledger/verify always re-checks."""
    global _LEDGER_OK
    if _LEDGER_OK is None or time.monotonic() - _LEDGER_OK[0] > 60:
        _LEDGER_OK = (time.monotonic(), ledger.verify(conn)["ok"])
    return _LEDGER_OK[1]
from .ingest import NOTICE, batch_out, current_year


def programme_seats(conn, programme_ids: list[str], year: str) -> list[dict]:
    progs = conn.execute("SELECT p.id, p.name, a.approved_intake FROM programmes p JOIN approved_intake a "
                         "ON a.programme_id=p.id AND a.academic_year=%s WHERE p.id = ANY(%s) ORDER BY p.id", (year, programme_ids)).fetchall()
    lines = {}
    for c in conn.execute("SELECT * FROM programme_category_counters WHERE programme_id = ANY(%s) AND academic_year=%s "
                          "ORDER BY category_code", (programme_ids, year)):
        lines.setdefault(c["programme_id"], []).append(
            {"category_code": c["category_code"], "filled": c["filled"], "cap": c["cap"], "excess": max(0, c["filled"] - c["cap"])})
    return [{"programme_id": p["id"], "name": p["name"], "academic_year": year, "approved_intake": p["approved_intake"],
             "source": "mock", "lines": lines.get(p["id"], [])} for p in progs]


def institution(conn, inst_id: str) -> dict:
    year = current_year(conn)["code"]
    inst = conn.execute("SELECT * FROM institutions WHERE id=%s", (inst_id,)).fetchone()
    pids = [r["id"] for r in conn.execute("SELECT id FROM programmes WHERE institution_id=%s", (inst_id,))]
    batches = conn.execute("SELECT * FROM upload_batches WHERE institution_id=%s ORDER BY id DESC LIMIT 20", (inst_id,)).fetchall()
    notices = [NOTICE.format(batch=r["batch_id"], case=r["id"]) for r in conn.execute(
        "SELECT DISTINCT c.id, e.batch_id FROM duplicate_cases c JOIN enrolments e ON e.id = ANY(c.enrolment_ids) "
        "JOIN programmes p ON p.id=e.programme_id WHERE p.institution_id=%s AND c.status IN ('flagged','under_investigation') "
        "ORDER BY c.id", (inst_id,))]
    rejected = conn.execute("SELECT coalesce(sum((row_counts_json->>'rejected')::int),0) n FROM upload_batches WHERE institution_id=%s",
                            (inst_id,)).fetchone()["n"]
    coverage = {r["apaar_status"]: r["n"] for r in conn.execute(
        "SELECT s.apaar_status, count(*) n FROM enrolments e JOIN students s ON s.id=e.student_id "
        "WHERE e.programme_id = ANY(%s) AND e.academic_year=%s AND e.status='active' GROUP BY 1", (pids, year))}
    return {"institution_id": inst_id, "name": inst["name"], "programmes": programme_seats(conn, pids, year),
            "batches": [batch_out(b) for b in batches], "open_notices": notices,
            "rejected_rows_total": rejected, "apaar_coverage": coverage}


def aicte(conn) -> dict:
    year = current_year(conn)["code"]
    one = lambda q, *a: conn.execute(q, a).fetchone()["n"]  # noqa: E731
    excess = conn.execute(
        "SELECT p.id programme_id, p.name, i.name institution, i.state, c.category_code, c.filled, c.cap, c.filled - c.cap excess "
        "FROM programme_category_counters c JOIN programmes p ON p.id=c.programme_id JOIN institutions i ON i.id=p.institution_id "
        "WHERE c.academic_year=%s AND c.filled > c.cap ORDER BY excess DESC", (year,)).fetchall()
    mix = conn.execute(
        "SELECT count(*) FILTER (WHERE seat_category_code='REGULAR') regular, count(*) FILTER (WHERE is_nri) nri, "
        "count(*) FILTER (WHERE is_oci) oci, count(*) FILTER (WHERE is_fn) fn, count(*) FILTER (WHERE is_ciwg) ciwg, "
        "count(*) FILTER (WHERE s.apaar_bi IS NULL) no_apaar "
        "FROM enrolments e JOIN students s ON s.id=e.student_id WHERE e.academic_year=%s AND e.status='active'", (year,)).fetchone()
    by_state = conn.execute(
        "SELECT i.state, sum(a.approved_intake)::int approved, coalesce(sum(f.filled),0)::int filled "
        "FROM approved_intake a JOIN programmes p ON p.id=a.programme_id JOIN institutions i ON i.id=p.institution_id "
        "LEFT JOIN (SELECT programme_id, count(*) filled FROM enrolments WHERE academic_year=%s AND status='active' GROUP BY 1) f "
        "ON f.programme_id=p.id WHERE a.academic_year=%s GROUP BY i.state ORDER BY i.state", (year, year)).fetchall()
    for s in by_state:
        s["fill_pct"] = round(100 * s["filled"] / s["approved"], 1) if s["approved"] else None
    compliance = conn.execute(
        "SELECT i.id, i.name, i.state, i.status, max(b.created_at) last_upload, count(b.id)::int batches "
        "FROM institutions i LEFT JOIN upload_batches b ON b.institution_id=i.id GROUP BY i.id ORDER BY i.id").fetchall()
    reissues = {r["institution_id"]: r["reissues"] for r in conn.execute("SELECT * FROM activation_reissue_counts()")}
    for c in compliance:
        c["activation_reissues"] = reissues.get(c["id"], 0)
    open_cases = one("SELECT count(*) n FROM duplicate_cases WHERE status IN ('flagged','under_investigation')")
    return {
        "totals": {"institutions": one("SELECT count(*) n FROM institutions"),
                   "active_enrolments": one("SELECT count(*) n FROM enrolments WHERE academic_year=%s AND status='active'", year),
                   "approved_intake": one("SELECT coalesce(sum(approved_intake),0)::int n FROM approved_intake WHERE academic_year=%s", year),
                   # sub-cap rows (e.g. SN_FN_OCI_CIWG:CIWG) overflow inside their parent pool: don't count them twice
                   "excess_seats": sum(r["excess"] for r in excess if ":" not in r["category_code"]),
                   "batches": one("SELECT count(*) n FROM upload_batches"),
                   "post_deadline_mutations": one("SELECT count(*) n FROM anomaly_flags WHERE type='E501'")},
        "excess_ranking": excess, "category_mix": mix, "by_state": by_state, "open_cases": open_cases,
        "upload_compliance": compliance, "ledger_ok": _ledger_ok(conn),
    }
