"""D3 glue: gathers aggregate features from the database (on the caller's RLS connection) and runs the pure
rules / DQS in anomaly.py. Regulators see every institution; an institution sees only its own."""
from collections import defaultdict

from . import anomaly
from .ingest import current_year


def programme_features(conn, year: str) -> list[dict]:
    progs = conn.execute("""
        SELECT p.id, p.institution_id, p.code, a.approved_intake,
               (SELECT filled FROM programme_category_counters c WHERE c.programme_id = p.id AND c.academic_year = %(y)s
                 AND c.category_code = 'REGULAR') AS regular,
               (SELECT filled FROM programme_category_counters c WHERE c.programme_id = p.id AND c.academic_year = %(y)s
                 AND c.category_code = 'SN_FN_OCI_CIWG') AS foreign_pool,
               (SELECT count(*) FROM enrolments e WHERE e.programme_id = p.id AND e.academic_year = %(y)s AND e.status = 'active') AS active,
               (SELECT max(max_dob_cluster) FROM batch_features f WHERE f.programme_id = p.id) AS dob_cluster,
               (SELECT max(longest_apaar_run) FROM batch_features f WHERE f.programme_id = p.id) AS apaar_run
          FROM programmes p JOIN approved_intake a ON a.programme_id = p.id AND a.academic_year = %(y)s
         ORDER BY p.id""", {"y": year}).fetchall()
    hist = defaultdict(list)
    for h in conn.execute("SELECT * FROM intake_history ORDER BY academic_year"):
        hist[h["programme_id"]].append(h)
    out = []
    for p in progs:
        h = hist[p["id"]]
        foreign_hist = [x["foreign_filled"] for x in h]
        out.append({"institution_id": p["institution_id"], "programme": p["code"], "programme_id": p["id"],
                    "rows": p["active"], "fill": (p["regular"] or 0) / p["approved_intake"] if p["approved_intake"] else None,
                    "history_fills": [x["filled"] / x["approved"] for x in h if x["approved"]],
                    "foreign": p["foreign_pool"] or 0,
                    "history_foreign": foreign_hist if foreign_hist and None not in foreign_hist else None,
                    "max_dob_cluster": p["dob_cluster"] or 0, "longest_apaar_run": p["apaar_run"] or 0})
    return out


def flags(conn) -> list[dict]:
    year = current_year(conn)["code"]
    out = [f for x in programme_features(conn, year) if x["rows"] or x["max_dob_cluster"] or x["longest_apaar_run"]
           for f in anomaly.programme_flags(x)]
    minutes = defaultdict(list)
    for r in conn.execute("SELECT DISTINCT b.institution_id, f.batch_id, f.minutes_before_deadline "
                          "FROM batch_features f JOIN upload_batches b ON b.id = f.batch_id"):
        minutes[r["institution_id"]].append(r["minutes_before_deadline"])
    out += [f for inst, ms in minutes.items() for f in anomaly.institution_flags(inst, ms)]
    return out


def dqs_inputs(conn, institution_id: str, year: str, flag_count: int, updates: int) -> dict | None:
    b = conn.execute("SELECT count(*) n, coalesce(sum((row_counts_json->>'rows')::int), 0) rows, "
                     "coalesce(sum((row_counts_json->>'accepted')::int), 0) accepted FROM upload_batches WHERE institution_id = %s",
                     (institution_id,)).fetchone()
    if not b["n"]:
        return None
    one = lambda q, *a: conn.execute(q, a).fetchone()["n"]  # noqa: E731
    return {
        "rows": b["rows"], "accepted": b["accepted"],
        "active": one("SELECT count(*) n FROM enrolments e JOIN programmes p ON p.id = e.programme_id "
                      "WHERE p.institution_id = %s AND e.academic_year = %s AND e.status = 'active'", institution_id, year),
        "excess": one("SELECT coalesce(sum(greatest(c.filled - c.cap, 0)), 0) n FROM programme_category_counters c "
                      "JOIN programmes p ON p.id = c.programme_id WHERE p.institution_id = %s AND c.academic_year = %s "
                      "AND c.category_code NOT LIKE '%%:%%'", institution_id, year),
        "late_rows": one("SELECT coalesce(sum(f.rows), 0) n FROM batch_features f JOIN upload_batches b ON b.id = f.batch_id "
                         "WHERE b.institution_id = %s AND f.minutes_before_deadline <= 1440", institution_id),
        "open_cases": one("SELECT count(DISTINCT c.id) n FROM duplicate_cases c JOIN enrolments e ON e.id = ANY(c.enrolment_ids) "
                          "JOIN programmes p ON p.id = e.programme_id WHERE p.institution_id = %s "
                          "AND c.status IN ('flagged','under_investigation')", institution_id),
        "flags": flag_count, "updates": updates,
        "created": one("SELECT count(*) n FROM enrolments e JOIN programmes p ON p.id = e.programme_id WHERE p.institution_id = %s",
                       institution_id),
        "e303": one("SELECT count(*) n FROM validation_issues v JOIN upload_batches b ON b.id = v.batch_id "
                    "WHERE b.institution_id = %s AND v.code = 'E303'", institution_id),
        "e501": one("SELECT count(*) n FROM anomaly_flags WHERE institution_id = %s AND type = 'E501'", institution_id),
    }


def institution_view(conn, institution_id: str) -> dict:
    """An institution's own DQS (RLS connection of that institution)."""
    year = current_year(conn)["code"]
    fl = [f for f in flags(conn) if f["institution_id"] == institution_id]
    updates = conn.execute("SELECT own_correction_count() n").fetchone()["n"]
    m = dqs_inputs(conn, institution_id, year, len(fl), updates)
    return {"institution_id": institution_id, "dqs": anomaly.dqs(m) if m else None, "flags": fl}


def inspection_queue(conn) -> list[dict]:
    """Regulator connection: every institution, ranked by risk = (100 - DQS) x active enrolments."""
    year = current_year(conn)["code"]
    all_flags = flags(conn)
    updates = {r["institution_id"]: r["n"] for r in conn.execute(
        "SELECT institution_id, count(*) n FROM ledger_entries WHERE event_type = 'enrolment.updated' GROUP BY 1")}
    entries = []
    for i in conn.execute("SELECT * FROM institutions ORDER BY id"):
        fl = [f for f in all_flags if f["institution_id"] == i["id"]]
        m = dqs_inputs(conn, i["id"], year, len(fl), updates.get(i["id"], 0))
        entries.append({"institution_id": i["id"], "name": i["name"], "state": i["state"], "status": i["status"],
                        "active": m["active"] if m else 0, "dqs": anomaly.dqs(m) if m else None, "flags": fl})
    ranked = anomaly.inspection_queue(entries)
    for n, e in enumerate(ranked, start=1):
        e["rank"] = n
    return ranked
