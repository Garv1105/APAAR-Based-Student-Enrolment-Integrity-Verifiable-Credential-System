"""D3 glue: gathers aggregate features from the database (on the caller's RLS connection) and runs the pure
rules / DQS in anomaly.py. Regulators see every institution; an institution sees only its own."""
from collections import defaultdict

import psycopg
from fastapi import HTTPException
from psycopg.types.json import Jsonb

from . import anomaly
from .auth import audit
from .ingest import current_year


def programme_features(conn, year: str, institution_id: str | None = None) -> list[dict]:
    """Per-programme inputs for the anomaly rules. institution_id limits it to one college (its own DQS view)."""
    progs = conn.execute("""
        WITH act AS (SELECT programme_id, count(*) n FROM enrolments WHERE academic_year = %(y)s AND status = 'active' GROUP BY 1),
             bf AS (SELECT programme_id, max(max_dob_cluster) dob, max(longest_apaar_run) run FROM batch_features GROUP BY 1),
             cc AS (SELECT programme_id, max(filled) FILTER (WHERE category_code = 'REGULAR') regular,
                           max(filled) FILTER (WHERE category_code = 'SN_FN_OCI_CIWG') foreign_pool
                      FROM programme_category_counters WHERE academic_year = %(y)s GROUP BY 1)
        SELECT p.id, p.institution_id, p.code, a.approved_intake, i.state, cc.regular, cc.foreign_pool,
               coalesce(act.n, 0) AS active, bf.dob AS dob_cluster, bf.run AS apaar_run
          FROM programmes p JOIN approved_intake a ON a.programme_id = p.id AND a.academic_year = %(y)s
          JOIN institutions i ON i.id = p.institution_id
          LEFT JOIN act ON act.programme_id = p.id LEFT JOIN bf ON bf.programme_id = p.id LEFT JOIN cc ON cc.programme_id = p.id
         WHERE %(inst)s::text IS NULL OR p.institution_id = %(inst)s
         ORDER BY p.id""", {"y": year, "inst": institution_id}).fetchall()
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


def flags(conn, regulator: bool = False, institution_id: str | None = None) -> list[dict]:
    """Own-data rules for everyone; peer comparisons (A1) only on a regulator connection (they need every college's numbers).
    institution_id (non-regulator only): compute just that college's programme flags."""
    year = current_year(conn)["code"]
    feats = programme_features(conn, year, None if regulator else institution_id)
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


def dqs_inputs_all(conn, year: str, institution_id: str | None = None) -> dict[str, dict]:
    """DQS inputs for every institution that has uploaded (or just one), in a handful of grouped queries."""
    q = {"y": year, "i": institution_id}
    only = "(%(i)s::text IS NULL OR {col} = %(i)s)"

    def per(sql: str, col: str) -> dict:
        return {r["k"]: r["n"] for r in conn.execute(sql.format(only=only.format(col=col)), q)}

    out = {r["institution_id"]: {"rows": r["rows"], "accepted": r["accepted"]} for r in conn.execute(
        "SELECT institution_id, coalesce(sum((row_counts_json->>'rows')::int), 0) rows, "
        "coalesce(sum((row_counts_json->>'accepted')::int), 0) accepted FROM upload_batches "
        "WHERE " + only.format(col="institution_id") + " GROUP BY 1", q)}
    enrol = "FROM enrolments e JOIN programmes p ON p.id = e.programme_id WHERE {only}"
    cols = {
        "active": per("SELECT p.institution_id k, count(*) n " + enrol + " AND e.academic_year = %(y)s AND e.status = 'active' GROUP BY 1",
                      "p.institution_id"),
        "excess": per("SELECT p.institution_id k, coalesce(sum(greatest(c.filled - c.cap, 0)), 0) n FROM programme_category_counters c "
                      "JOIN programmes p ON p.id = c.programme_id WHERE {only} AND c.academic_year = %(y)s "
                      "AND c.category_code NOT LIKE '%%:%%' GROUP BY 1", "p.institution_id"),
        "late_rows": per("SELECT b.institution_id k, coalesce(sum(f.rows), 0) n FROM batch_features f JOIN upload_batches b "
                         "ON b.id = f.batch_id WHERE {only} AND f.minutes_before_deadline <= 1440 GROUP BY 1", "b.institution_id"),
        # A4 fairness: an open case counts only against institutions whose enrolment was NOT submitted first
        # (lowest enrolment id = earliest upload, observed by the platform, unlike the self-declared admission date)
        "open_cases": per("SELECT p.institution_id k, count(DISTINCT c.id) n FROM duplicate_cases c "
                          "JOIN enrolments e ON e.id = ANY(c.enrolment_ids) JOIN programmes p ON p.id = e.programme_id "
                          "WHERE {only} AND c.status IN ('flagged','under_investigation') AND NOT EXISTS ("
                          "SELECT 1 FROM enrolments f JOIN programmes fp ON fp.id = f.programme_id "
                          "WHERE f.id = (SELECT min(x) FROM unnest(c.enrolment_ids) x) AND fp.institution_id = p.institution_id) "
                          "GROUP BY 1", "p.institution_id"),
        "created": per("SELECT p.institution_id k, count(*) n " + enrol + " GROUP BY 1", "p.institution_id"),
        "e303": per("SELECT b.institution_id k, count(*) n FROM validation_issues v JOIN upload_batches b ON b.id = v.batch_id "
                    "WHERE {only} AND v.code = 'E303' GROUP BY 1", "b.institution_id"),
        "e501": per("SELECT institution_id k, count(*) n FROM anomaly_flags WHERE {only} AND type = 'E501' GROUP BY 1", "institution_id"),
    }
    for inst, m in out.items():
        m.update({name: vals.get(inst, 0) for name, vals in cols.items()})
    return out


def dqs_inputs(conn, institution_id: str, year: str, flag_count: int, updates: int, pre: dict | None = None) -> dict | None:
    """pre: dqs_inputs_all() result, so a ranking of every institution doesn't query once per institution."""
    m = (pre if pre is not None else dqs_inputs_all(conn, year, institution_id)).get(institution_id)
    return None if m is None else {**m, "flags": flag_count, "updates": updates}


def institution_view(conn, institution_id: str) -> dict:
    """An institution's own DQS (RLS connection of that institution)."""
    year = current_year(conn)["code"]
    # second guard: cross-institution flags (their evidence can name other colleges) never reach an institution
    fl = [f for f in flags(conn, institution_id=institution_id) if f["institution_id"] == institution_id and f["type"] not in CROSS_INSTITUTION]
    updates = conn.execute("SELECT own_correction_count() n").fetchone()["n"]
    m = dqs_inputs(conn, institution_id, year, len(fl), updates)
    return {"institution_id": institution_id, "dqs": anomaly.dqs(m) if m else None, "flags": fl}


def reviews(conn) -> list[dict]:
    return conn.execute("SELECT * FROM flag_reviews ORDER BY reviewed_at, id").fetchall()  # RLS: regulators only


def annotate(flag_list: list[dict], review_rows: list[dict], year: str) -> list[dict]:
    """A4 (regulators): stable key, latest review, rule weight, severity, and whether a dismissal still hides it."""
    latest = anomaly.feedback.latest_per_flag(review_rows)
    weights = anomaly.feedback.rule_weights(review_rows)
    out = []
    for f in flag_list:
        key = anomaly.feedback.flag_key(f, year)
        r = latest.get(key)
        out.append({**f, "flag_key": key, "weight": weights.get(f["type"]), "severity": round(anomaly.feedback.severity(f), 3),
                    "review": {k: r[k] for k in ("decision", "reason", "reviewer", "reviewed_at")} if r else None,
                    "suppressed": anomaly.feedback.suppressed(f, r)})
    return out


def regulator_flags(conn) -> list[dict]:
    year = current_year(conn)["code"]
    return annotate(flags(conn, regulator=True), reviews(conn), year)


def review_flag(conn, user: dict, key: str, decision: str, reason: str, idem_key: str | None, request_hash: str, request=None):
    if idem_key:
        prev = conn.execute("SELECT * FROM flag_reviews WHERE reviewer = %s AND idempotency_key = %s", (user["id"], idem_key)).fetchone()
        if prev:
            if prev["request_hash"] != request_hash:
                raise HTTPException(422, "Idempotency-Key was already used with a different request body")
            return prev, True
    year = current_year(conn)["code"]
    f = next((x for x in flags(conn, regulator=True) if anomaly.feedback.flag_key(x, year) == key), None)
    if f is None:
        raise HTTPException(404, "No current flag with this key (it may have been resolved by new data)")
    try:
        row = conn.execute("INSERT INTO flag_reviews (flag_key, rule, institution_id, academic_year, decision, reason, evidence_snapshot, "
                           "reviewer, idempotency_key, request_hash) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
                           (key, f["type"], f["institution_id"], year, decision, reason, Jsonb(f["evidence"]), user["id"],
                            idem_key, request_hash)).fetchone()
    except psycopg.errors.UniqueViolation:  # a concurrent request with the same Idempotency-Key won: replay it (or 422)
        conn.rollback()
        return review_flag(conn, user, key, decision, reason, idem_key, request_hash, request)
    # free-text reason stays in flag_reviews (regulators only), not in the audit log
    audit(conn, user, f"flag.{decision}", "flag", key, reason=f"{f['type']} at {f['institution_id']}", request=request)
    conn.commit()
    return row, False


def rules_performance(conn) -> dict:
    perf = anomaly.feedback.rule_performance(reviews(conn))
    return {**perf, "weight_floor": anomaly.feedback.WEIGHT_FLOOR, "flag_dqs_points": anomaly.feedback.FLAG_DQS_POINTS,
            "note": "Precision is learned only from reviewed flags, so it leans toward flags that already rank high. Recall can't "
                    "be learned from reviews (missed cases are never reviewed); it comes only from the synthetic evaluation. "
                    "No rule can be switched off: every weight stays at or above the floor."}


def inspection_queue(conn) -> list[dict]:
    """Regulator connection: every institution, ranked by risk = (100 - DQS) x active enrolments."""
    year = current_year(conn)["code"]
    review_rows = reviews(conn)
    all_flags = [f for f in annotate(flags(conn, regulator=True), review_rows, year) if not f["suppressed"]]  # dismissed: hidden
    updates = {r["institution_id"]: r["n"] for r in conn.execute(
        "SELECT institution_id, count(*) n FROM ledger_entries WHERE event_type = 'enrolment.updated' GROUP BY 1")}
    entries, pre = [], dqs_inputs_all(conn, year)
    for i in conn.execute("SELECT * FROM institutions ORDER BY id"):
        fl = [f for f in all_flags if f["institution_id"] == i["id"]]
        own = [f for f in fl if f["type"] not in CROSS_INSTITUTION]  # DQS uses the institution's own data only (matches its own view)
        m = dqs_inputs(conn, i["id"], year, len(own), updates.get(i["id"], 0), pre)
        entries.append({"institution_id": i["id"], "name": i["name"], "state": i["state"], "status": i["status"],
                        "active": m["active"] if m else 0, "dqs": anomaly.dqs(m) if m else None, "flags": fl})
    ranked = anomaly.inspection_queue(entries, anomaly.feedback.rule_weights(review_rows))
    for n, e in enumerate(ranked, start=1):
        e["rank"] = n
    return ranked
