"""Req 9 reports for policy, accreditation, monitoring and regulation (PRD §14). Aggregates only: no names,
APAARs or dates of birth. Every query runs on the caller's RLS connection, so an institution only ever
sees its own programmes. Rendering to CSV (with formula-injection neutralisation) happens in main.py.

Each builder returns (header, rows).
"""
from . import ledger
from .ingest import current_year

REPORTS = {
    "accreditation": "Accreditation pack: per programme intake, seats, APAAR coverage, data quality and cases",
    "state-summary": "State summary: institutions, intake, enrolment, fill, excess, duplicate cases, APAAR coverage",
    "category-utilisation": "Category-quota utilisation: cap vs filled for every programme and seat category",
    "excess-case-file": "Excess-admission case file: every over-cap row with batch/row evidence and ledger integrity",
}


def accreditation(conn, institution_id: str) -> tuple[list[str], list[dict]]:
    year = current_year(conn)["code"]
    rows = conn.execute("""
        SELECT i.id AS institution_id, i.name AS institution, i.state, i.status AS approval_status,
               p.code AS programme_code, p.name AS programme, %(y)s AS academic_year, a.approved_intake,
               coalesce(max(c.filled) FILTER (WHERE c.category_code = 'REGULAR'), 0) AS regular_filled,
               coalesce(max(c.cap)    FILTER (WHERE c.category_code = 'SN_FN_OCI_CIWG'), 0) AS supernumerary_cap,
               coalesce(max(c.filled) FILTER (WHERE c.category_code = 'SN_FN_OCI_CIWG'), 0) AS supernumerary_filled,
               coalesce(sum(greatest(c.filled - c.cap, 0)) FILTER (WHERE c.category_code NOT LIKE '%%:%%'), 0) AS excess_seats
          FROM programmes p JOIN institutions i ON i.id = p.institution_id
          JOIN approved_intake a ON a.programme_id = p.id AND a.academic_year = %(y)s
          LEFT JOIN programme_category_counters c ON c.programme_id = p.id AND c.academic_year = %(y)s
         WHERE i.id = %(inst)s
         GROUP BY i.id, p.id, a.approved_intake ORDER BY p.code""", {"y": year, "inst": institution_id}).fetchall()
    for r in rows:
        pid = f"{institution_id}:{r['programme_code']}"
        cov = {x["apaar_status"]: x["n"] for x in conn.execute(
            "SELECT s.apaar_status, count(*) n FROM enrolments e JOIN students s ON s.id = e.student_id "
            "WHERE e.programme_id = %s AND e.academic_year = %s AND e.status = 'active' GROUP BY 1", (pid, year))}
        active = sum(cov.values())
        r["active_enrolments"] = active
        r["apaar_verified"] = cov.get("VERIFIED", 0)
        r["apaar_mismatch_warning"] = cov.get("MISMATCH", 0)
        r["apaar_missing_with_reason"] = sum(cov.get(k, 0) for k in ("REFUSED", "NOT_GENERATED", "PENDING"))
        r["apaar_coverage_pct"] = round(100 * r["apaar_verified"] / active, 1) if active else None
        r["fill_pct"] = round(100 * r["regular_filled"] / r["approved_intake"], 1) if r["approved_intake"] else None
        r["open_duplicate_cases"] = conn.execute(
            "SELECT count(DISTINCT c.id) n FROM duplicate_cases c JOIN enrolments e ON e.id = ANY(c.enrolment_ids) "
            "WHERE e.programme_id = %s AND c.status IN ('flagged','under_investigation')", (pid,)).fetchone()["n"]
        r["post_deadline_changes"] = conn.execute(
            "SELECT count(*) n FROM anomaly_flags WHERE programme_id = %s AND type = 'E501'", (pid,)).fetchone()["n"]
    issues = conn.execute(
        "SELECT coalesce(sum((b.row_counts_json->>'rows')::int), 0) AS rows_submitted, "
        "coalesce(sum((b.row_counts_json->>'rejected')::int), 0) AS rows_rejected "
        "FROM upload_batches b WHERE b.institution_id = %s", (institution_id,)).fetchone()
    for r in rows:  # institution-level data quality, repeated on each programme row for a flat CSV
        r["institution_rows_submitted"] = issues["rows_submitted"]
        r["institution_rows_rejected"] = issues["rows_rejected"]
    header = ["institution_id", "institution", "state", "approval_status", "programme_code", "programme", "academic_year",
              "approved_intake", "regular_filled", "fill_pct", "supernumerary_cap", "supernumerary_filled", "excess_seats",
              "active_enrolments", "apaar_verified", "apaar_mismatch_warning", "apaar_missing_with_reason", "apaar_coverage_pct",
              "open_duplicate_cases", "post_deadline_changes", "institution_rows_submitted", "institution_rows_rejected"]
    return header, rows


def state_summary(conn) -> tuple[list[str], list[dict]]:
    year = current_year(conn)["code"]
    rows = conn.execute("""
        SELECT i.state, count(*) AS institutions, count(*) FILTER (WHERE i.status = 'approved') AS approved_institutions
          FROM institutions i GROUP BY i.state ORDER BY i.state""").fetchall()
    for r in rows:
        act = conn.execute(
            "SELECT count(*) n, count(*) FILTER (WHERE s.apaar_status = 'VERIFIED') v FROM enrolments e "
            "JOIN programmes p ON p.id = e.programme_id JOIN institutions i ON i.id = p.institution_id JOIN students s ON s.id = e.student_id "
            "WHERE i.state = %s AND e.academic_year = %s AND e.status = 'active'", (r["state"], year)).fetchone()
        r["active_enrolments"], r["apaar_verified"] = act["n"], act["v"]
        r["approved_intake"] = conn.execute(
            "SELECT coalesce(sum(a.approved_intake), 0)::int n FROM approved_intake a JOIN programmes p ON p.id = a.programme_id "
            "JOIN institutions i ON i.id = p.institution_id WHERE i.state = %s AND a.academic_year = %s", (r["state"], year)).fetchone()["n"]
        r["excess_seats"] = conn.execute(
            "SELECT coalesce(sum(greatest(c.filled - c.cap, 0)), 0)::int n FROM programme_category_counters c "
            "JOIN programmes p ON p.id = c.programme_id JOIN institutions i ON i.id = p.institution_id "
            "WHERE i.state = %s AND c.academic_year = %s AND c.category_code NOT LIKE '%%:%%'", (r["state"], year)).fetchone()["n"]
        r["open_duplicate_cases"] = conn.execute(
            "SELECT count(DISTINCT c.id) n FROM duplicate_cases c JOIN enrolments e ON e.id = ANY(c.enrolment_ids) "
            "JOIN programmes p ON p.id = e.programme_id JOIN institutions i ON i.id = p.institution_id "
            "WHERE i.state = %s AND c.status IN ('flagged','under_investigation')", (r["state"],)).fetchone()["n"]
        r["fill_pct"] = round(100 * r["active_enrolments"] / r["approved_intake"], 1) if r["approved_intake"] else None
        r["apaar_coverage_pct"] = round(100 * r["apaar_verified"] / r["active_enrolments"], 1) if r["active_enrolments"] else None
    header = ["state", "institutions", "approved_institutions", "approved_intake", "active_enrolments", "fill_pct",
              "excess_seats", "open_duplicate_cases", "apaar_verified", "apaar_coverage_pct"]
    return header, rows


def category_utilisation(conn) -> tuple[list[str], list[dict]]:
    year = current_year(conn)["code"]
    rows = conn.execute("""
        SELECT i.name AS institution, i.state, p.code AS programme_code, p.name AS programme, c.category_code,
               c.cap, c.filled, greatest(c.filled - c.cap, 0) AS excess,
               CASE WHEN c.cap > 0 THEN round(100.0 * c.filled / c.cap, 1) END AS utilisation_pct,
               s.scope
          FROM programme_category_counters c JOIN programmes p ON p.id = c.programme_id
          JOIN institutions i ON i.id = p.institution_id
          LEFT JOIN seat_categories s ON s.code = split_part(c.category_code, ':', 1)
         WHERE c.academic_year = %s ORDER BY i.name, p.code, c.category_code""", (year,)).fetchall()
    for r in rows:
        r["note"] = "sub-cap: its excess is already inside the parent pool's excess" if ":" in r["category_code"] else ""
    return ["institution", "state", "programme_code", "programme", "category_code", "scope", "cap", "filled", "utilisation_pct",
            "excess", "note"], rows


def excess_case_file(conn) -> tuple[list[str], list[dict]]:
    """One row per over-cap admission flagged at upload (E301/E302), with the programme's current position and
    the seat ledger's integrity status, so an enforcement case can cite verifiable evidence."""
    year = current_year(conn)["code"]
    lv = ledger.verify(conn)
    cp = conn.execute("SELECT upto_seq, root_hash, published_at FROM ledger_checkpoints ORDER BY id DESC LIMIT 1").fetchone()
    rows = conn.execute("""
        SELECT i.id AS institution_id, i.name AS institution, i.state, b.id AS batch_id, b.created_at AS uploaded_at,
               v.row_no, v.code, v.params->>'detail' AS detail
          FROM validation_issues v JOIN upload_batches b ON b.id = v.batch_id JOIN institutions i ON i.id = b.institution_id
         WHERE v.code IN ('E301', 'E302') ORDER BY i.name, b.id, v.row_no""").fetchall()
    current = {(r["institution_id"], r["category_code"], r["programme_code"]): r for r in conn.execute("""
        SELECT p.institution_id, p.code AS programme_code, c.category_code, c.cap, c.filled
          FROM programme_category_counters c JOIN programmes p ON p.id = c.programme_id
         WHERE c.academic_year = %s AND c.filled > c.cap""", (year,))}
    by_inst = {}
    for k, v in current.items():
        by_inst.setdefault(k[0], []).append(f"{k[2]} {k[1]}: {v['filled']}/{v['cap']} (+{v['filled'] - v['cap']})")
    for r in rows:
        r["current_over_cap"] = "; ".join(sorted(by_inst.get(r["institution_id"], []))) or "none (resolved since upload)"
        r["ledger_consistent"] = lv["ok"]
        r["ledger_checkpoint_seq"] = cp["upto_seq"] if cp else None
        r["ledger_checkpoint_root"] = cp["root_hash"] if cp else None
    header = ["institution_id", "institution", "state", "batch_id", "uploaded_at", "row_no", "code", "detail", "current_over_cap",
              "ledger_consistent", "ledger_checkpoint_seq", "ledger_checkpoint_root"]
    return header, rows
