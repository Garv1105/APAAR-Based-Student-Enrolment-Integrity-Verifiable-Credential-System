"""D3 glue: gathers aggregate features from the database (on the caller's RLS connection) and runs the pure
rules / DQS in anomaly.py. Regulators see every institution; an institution sees only its own."""
from collections import defaultdict

from . import anomaly
from .ingest import current_year


def programme_features(conn, year: str) -> list[dict]:
    progs = conn.execute("""
        SELECT p.id, p.institution_id, p.code, a.approved_intake, i.state,
               (SELECT filled FROM programme_category_counters c WHERE c.programme_id = p.id AND c.academic_year = %(y)s
                 AND c.category_code = 'REGULAR') AS regular,
               (SELECT filled FROM programme_category_counters c WHERE c.programme_id = p.id AND c.academic_year = %(y)s
                 AND c.category_code = 'SN_FN_OCI_CIWG') AS foreign_pool,
               (SELECT count(*) FROM enrolments e WHERE e.programme_id = p.id AND e.academic_year = %(y)s AND e.status = 'active') AS active,
               (SELECT max(max_dob_cluster) FROM batch_features f WHERE f.programme_id = p.id) AS dob_cluster,
               (SELECT max(longest_apaar_run) FROM batch_features f WHERE f.programme_id = p.id) AS apaar_run
          FROM programmes p JOIN approved_intake a ON a.programme_id = p.id AND a.academic_year = %(y)s
          JOIN institutions i ON i.id = p.institution_id
         ORDER BY p.id""", {"y": year}).fetchall()
    hist = defaultdict(list)
    for h in conn.execute("SELECT * FROM intake_history ORDER BY academic_year"):
        hist[h["programme_id"]].append(h)
    out = []
    for p in progs:
        h = hist[p["id"]]
        foreign_hist = [x["foreign_filled"] for x in h]
        hist_shares = ([x["foreign_filled"] / (x["filled"] + x["foreign_filled"]) for x in h if x["filled"] + x["foreign_filled"]]
                       if foreign_hist and None not in foreign_hist else None)
        out.append({"institution_id": p["institution_id"], "programme": p["code"], "programme_id": p["id"],
                    "state": p["state"], "approved_intake": p["approved_intake"],
                    "foreign_share": (p["foreign_pool"] or 0) / p["active"] if p["active"] else None,
                    "history_foreign_shares": hist_shares or None,
                    "rows": p["active"], "fill": (p["regular"] or 0) / p["approved_intake"] if p["approved_intake"] else None,
                    "history_fills": [x["filled"] / x["approved"] for x in h if x["approved"]],
                    "foreign": p["foreign_pool"] or 0,
                    "history_foreign": foreign_hist if foreign_hist and None not in foreign_hist else None,
                    "max_dob_cluster": p["dob_cluster"] or 0, "longest_apaar_run": p["apaar_run"] or 0})
    return out


def peer_inputs(conn, year: str, feats: list[dict]) -> tuple[list[dict], list[dict]]:
    """A1 inputs (regulator connection): programmes with submissions, and institution-level rates."""
    progs = [x for x in feats if x["rows"]]
    intake = defaultdict(float)
    for x in feats:
        intake[x["institution_id"]] += x["approved_intake"] or 0
    late = {r["institution_id"]: r for r in conn.execute(
        "SELECT b.institution_id, sum(f.rows) rows, sum(f.rows) FILTER (WHERE f.minutes_before_deadline BETWEEN 0 AND 1440) late "
        "FROM batch_features f JOIN upload_batches b ON b.id = f.batch_id GROUP BY 1")}
    insts = []
    for r in conn.execute("SELECT b.institution_id, i.state, sum((b.row_counts_json->>'rows')::int) rows, "
                          "sum((b.row_counts_json->>'rejected')::int) rejected FROM upload_batches b "
                          "JOIN institutions i ON i.id = b.institution_id GROUP BY 1, 2"):
        lt = late.get(r["institution_id"])
        insts.append({"institution_id": r["institution_id"], "state": r["state"], "total_intake": intake[r["institution_id"]],
                      "rejection_rate": r["rejected"] / r["rows"] if r["rows"] else None,
                      "late_share": (lt["late"] or 0) / lt["rows"] if lt and lt["rows"] else None})
    return progs, insts


def peer_result(conn) -> dict:
    year = current_year(conn)["code"]
    return anomaly.peer.peer_flags(*peer_inputs(conn, year, programme_features(conn, year)))


def peer_status(conn) -> dict:
    r = peer_result(conn)
    note = (f"{r['insufficient']} comparison(s) skipped: insufficient peers (needs at least {anomaly.peer.MIN_PEERS} similar "
            f"programmes or institutions per group)" if r["insufficient"] else "every comparison had enough peers")
    return {"tests": r["tests"], "flagged": len(r["flags"]), "insufficient": r["insufficient"], "min_peers": anomaly.peer.MIN_PEERS,
            "fdr_q": anomaly.peer.FDR_Q, "note": note}


CROSS_INSTITUTION = {"PEER_OUTLIER", "SHARED_STUDENT_RING", "SEAT_BLOCKING"}  # regulator-only; not part of the DQS
NETWORK_NOTE = ("historical_shared and carousel need multi-year enrolment and migration data; on the current single-year "
                "data they are close to 0, so edges mostly reflect students active at two colleges.")


def network_analysis(conn, year: str) -> tuple[dict, dict]:
    """A3 (regulator connection): edge counts from shared_student_edges(), analysed by anomaly.network."""
    edges = [dict(e) for e in conn.execute("SELECT * FROM shared_student_edges(%s)", (year,))]
    active = {r["institution_id"]: r["n"] for r in conn.execute(
        "SELECT p.institution_id, count(*) n FROM enrolments e JOIN programmes p ON p.id = e.programme_id "
        "WHERE e.academic_year = %s AND e.status = 'active' GROUP BY 1", (year,))}
    return anomaly.network.analyse(edges, active), active


def network_view(conn) -> dict:
    """Regulators only. Small counts are not suppressed because regulators can already read the underlying rows (RLS);
    if auditor access is ever narrowed to aggregates, suppress counts below 5 for auditors or drop them from /v1/network."""
    year = current_year(conn)["code"]
    res, active = network_analysis(conn, year)
    connected = {n for e in res["edges"] if e["kept"] for n in (e["inst_a"], e["inst_b"])}
    nodes = [{"id": i["id"], "name": i["name"], "state": i["state"], "active": active.get(i["id"], 0),
              "ring": res["ring_of"].get(i["id"]), "connected": i["id"] in connected}
             for i in conn.execute("SELECT id, name, state FROM institutions ORDER BY id")]
    return {"academic_year": year, "nodes": nodes, "edges": res["edges"], "components": res["components"],
            "flags": res["flags"], "edge_min": anomaly.network.EDGE_MIN, "note": NETWORK_NOTE}


def flags(conn, regulator: bool = False) -> list[dict]:
    """Own-data rules for everyone; peer comparisons (A1) only on a regulator connection (they need every college's numbers)."""
    year = current_year(conn)["code"]
    feats = programme_features(conn, year)
    out = [f for x in feats if x["rows"] or x["max_dob_cluster"] or x["longest_apaar_run"]
           for f in anomaly.programme_flags(x)]
    if regulator:
        out += anomaly.peer.peer_flags(*peer_inputs(conn, year, feats))["flags"]
        out += network_analysis(conn, year)[0]["flags"]
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
    # second guard: cross-institution flags (their evidence can name other colleges) never reach an institution
    fl = [f for f in flags(conn) if f["institution_id"] == institution_id and f["type"] not in CROSS_INSTITUTION]
    updates = conn.execute("SELECT own_correction_count() n").fetchone()["n"]
    m = dqs_inputs(conn, institution_id, year, len(fl), updates)
    return {"institution_id": institution_id, "dqs": anomaly.dqs(m) if m else None, "flags": fl}


def inspection_queue(conn) -> list[dict]:
    """Regulator connection: every institution, ranked by risk = (100 - DQS) x active enrolments."""
    year = current_year(conn)["code"]
    all_flags = flags(conn, regulator=True)
    updates = {r["institution_id"]: r["n"] for r in conn.execute(
        "SELECT institution_id, count(*) n FROM ledger_entries WHERE event_type = 'enrolment.updated' GROUP BY 1")}
    entries = []
    for i in conn.execute("SELECT * FROM institutions ORDER BY id"):
        fl = [f for f in all_flags if f["institution_id"] == i["id"]]
        own = [f for f in fl if f["type"] not in CROSS_INSTITUTION]  # DQS uses the institution's own data only (matches its own view)
        m = dqs_inputs(conn, i["id"], year, len(own), updates.get(i["id"], 0))
        entries.append({"institution_id": i["id"], "name": i["name"], "state": i["state"], "status": i["status"],
                        "active": m["active"] if m else 0, "dqs": anomaly.dqs(m) if m else None, "flags": fl})
    ranked = anomaly.inspection_queue(entries)
    for n, e in enumerate(ranked, start=1):
        e["rank"] = n
    return ranked
