"""Score a loaded synthetic world (MOCK) against its ground_truth.json. Run after tools/load_world.py:

    .venv\\Scripts\\python.exe tools/eval_world.py --dir <world>      (APAAR_DB selects the database, default apaar)

Reads the database on a regulator (aicte_officer) RLS connection: validation codes, E203 counts and the inspection
queue (visible anomaly flags + rank). Row numbers are mapped to programmes / student ids through the world's own upload
CSVs, so nothing is decrypted. Prints a pass/fail table and precision/recall per anomaly type; exit 1 on any FAIL.
"""
import argparse
import csv
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from app import auth, db, risk  # noqa: E402

# planted fault -> the flag type that should catch it (None: validation codes only)
FLAG_FOR = {"ENROLMENT_SPIKE": "ENROLMENT_SPIKE", "CATEGORY_MIX_SHIFT": "CATEGORY_MIX_SHIFT", "DOB_CLUSTER": "DOB_CLUSTER",
            "SEQUENTIAL_APAAR": "SEQUENTIAL_APAAR", "DEADLINE_DUMP": "DEADLINE_DUMP", "NEW_COLLEGE_OUTLIER": "PEER_OUTLIER",
            "SEAT_BLOCKING_PAIR": "SEAT_BLOCKING", "GHOST_RING": "SHARED_STUDENT_RING"}
INSTITUTION_LEVEL = {"DEADLINE_DUMP", "SEAT_BLOCKING", "SHARED_STUDENT_RING"}
CAPACITY = ("E301", "E302", "E303")
SUBTLE_TOP = 0.10  # SUBTLE_PROFILE trips no single rule: pass if the college ranks in the top 10% of the inspection queue


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="world folder holding ground_truth.json, manifest.json and uploads/")
    root = Path(ap.parse_args().dir)
    gt = json.loads((root / "ground_truth.json").read_text())
    manifest = json.loads((root / "manifest.json").read_text())

    user = {"id": "eval_world", "role": "aicte_officer"}
    with db.app_connect(user) as conn:
        latest = {r["institution_id"]: r["id"] for r in conn.execute(
            "SELECT institution_id, max(id) id FROM upload_batches WHERE status='completed' GROUP BY 1")}
        codes = defaultdict(list)  # (institution, row_no) -> codes
        for r in conn.execute("SELECT b.institution_id, v.row_no, v.code FROM validation_issues v JOIN upload_batches b "
                              "ON b.id=v.batch_id WHERE v.batch_id = ANY(%s)", (list(latest.values()),)):
            codes[(r["institution_id"], r["row_no"])].append(r["code"])
        queue = risk.inspection_queue(conn)
        auth.audit(conn, user, "anomalies.read", "anomalies", None, reason="tools/eval_world.py")
        conn.commit()

    # upload CSV row i (1-based) -> programme, student id, APAAR, for the batch that was loaded last per college
    rows = {}
    for inst in latest:
        f = root / "uploads" / f"{inst}.csv"
        if f.exists():
            with open(f, encoding="utf-8-sig", newline="") as fh:
                rows[inst] = list(csv.DictReader(fh))

    def row(inst, n):
        return rows[inst][n - 1] if inst in rows and 0 < n <= len(rows[inst]) else {}

    per_prog = Counter()  # (institution, programme, code) for capacity codes
    e203 = Counter()
    for (inst, n), cs in codes.items():
        for c in cs:
            if c in CAPACITY:
                per_prog[(inst, row(inst, n).get("programme_code"), c)] += 1
            elif c == "E203":
                e203[inst] += 1

    results = []  # (check, subject, expected, got, ok)

    def check(name, subject, expected, got, ok):
        results.append((name, subject, str(expected), str(got), ok))

    # 1. capacity codes per institution / programme (exact), and none unplanned
    planned = set()
    for f in gt["faults"]:
        if "programme" in f and any(c in CAPACITY for c in f["expected_codes"]):
            for c, n in f["expected_codes"].items():
                planned.add((f["institution_id"], f["programme"], c))
                got = per_prog[(f["institution_id"], f["programme"], c)]
                check(f["type"], f"{f['institution_id']}/{f['programme']}", f"{c}={n}", f"{c}={got}", got == n)
    stray = {k: v for k, v in per_prog.items() if k not in planned}
    check("NO_UNPLANNED_E3xx", "all programmes", 0, len(stray) and ", ".join(f"{i}/{p} {c}x{n}" for (i, p, c), n in list(stray.items())[:5]),
          not stray)

    # 2. E203 per pair / ring (exact)
    for f in gt["faults"]:
        if "institutions" in f:
            got = sum(e203[i] for i in f["institutions"])
            check(f["type"], "+".join(f["institutions"]), f"E203={f['expected_codes'].get('E203', 0)}", f"E203={got}",
                  got == f["expected_codes"].get("E203", 0))

    # 3. LEGIT_MIGRATION: the migrated students raise no E203 anywhere in the pair
    migrated = {s["user"].removeprefix("inst-"): s["apaar"] for s in manifest["steps"] if s["op"] == "patch"}
    for nc in (x for x in gt["negative_controls"] if x["type"] == "LEGIT_MIGRATION"):
        apaars = {migrated[i] for i in nc["institutions"] if i in migrated}
        hits = sum("E203" in codes[(i, n)] for i in nc["institutions"] for n, r in enumerate(rows.get(i, []), 1)
                   if r["apaar_id"].replace(" ", "") in apaars)
        check("LEGIT_MIGRATION no E203", "+".join(nc["institutions"]), "E203=0", f"E203={hits}" + ("" if apaars else " (no patch)"),
              hits == 0 and bool(apaars))

    # 4. row-level error codes by student id
    for e in gt["row_errors"]:
        ns = [n for n, r in enumerate(rows.get(e["institution_id"], []), 1) if r["institution_student_id"] == e["institution_student_id"]]
        got = sorted({c for n in ns for c in codes[(e["institution_id"], n)]})
        check("ROW_ERROR", f"{e['institution_id']}/{e['institution_student_id']}", e["code"], ",".join(got) or "-", e["code"] in got)

    # 5. anomaly flags / inspection queue
    ranked = [q for q in queue if q["risk"] is not None]
    rank = {q["institution_id"]: n for n, q in enumerate(ranked, 1)}
    flags = [(q["institution_id"], fl["programme"], fl["type"]) for q in queue for fl in q["flags"]]

    def flagged(t, inst, prog=None):
        return any(ft == t and fi == inst and (t in INSTITUTION_LEVEL or fp is None or prog is None or fp == prog) for fi, fp, ft in flags)

    truth = defaultdict(set)  # flag type -> units (institution, programme|None) that should be flagged
    explained = defaultdict(set)  # (institution, programme) -> flag types planted there
    for f in gt["faults"]:
        t = FLAG_FOR.get(f["type"])
        for inst in f.get("institutions", [f.get("institution_id")]):
            unit = (inst, None if t in INSTITUTION_LEVEL else f.get("programme"))
            subj = f"{inst}/{f.get('programme', '-')} rank {rank.get(inst, '-')}/{len(ranked)}"
            if t:
                truth[t].add(unit)
                explained[(inst, f.get("programme"))].add(t)
                check(f["type"], subj, t, "flagged" if flagged(t, *unit) else "not flagged", flagged(t, *unit))
            elif f["type"] == "SUBTLE_PROFILE":
                top = rank.get(inst, 10**9) <= max(1, round(SUBTLE_TOP * len(ranked)))
                check(f["type"], subj, f"top {SUBTLE_TOP:.0%} of queue", "yes" if top else "no", top)

    for nc in gt["negative_controls"]:
        if nc["type"] == "LEGIT_MIGRATION":
            both = all(flagged("SEAT_BLOCKING", i) for i in nc["institutions"])
            check("LEGIT_MIGRATION not seat-blocking", "+".join(nc["institutions"]), "no flag", "SEAT_BLOCKING" if both else "none", not both)
            continue
        key = (nc["institution_id"], nc["programme"])
        hit = sorted({ft for fi, fp, ft in flags if fi == key[0] and fp == key[1] and ft not in explained[key]})
        check(nc["type"] + " (must not flag)", f"{key[0]}/{key[1]}", "no flag", ",".join(hit) or "none", not hit)

    w = [max(len(r[i]) for r in results) for i in range(4)]
    print(f"{'check':<{w[0]}}  {'subject':<{w[1]}}  {'expected':<{w[2]}}  {'got':<{w[3]}}  result")
    for r in results:
        print(f"{r[0]:<{w[0]}}  {r[1]:<{w[1]}}  {r[2]:<{w[2]}}  {r[3]:<{w[3]}}  {'PASS' if r[4] else 'FAIL'}")
    failed = sum(not r[4] for r in results)
    print(f"\n{len(results) - failed}/{len(results)} checks passed\n")

    # a flag on a unit that carries a different planted fault (e.g. a spike on an EXCESS_INTAKE programme) is "excused":
    # not a false positive, not a true positive of this type either
    faulted = {(i, f.get("programme")) for f in gt["faults"] for i in f.get("institutions", [f.get("institution_id")])}

    def covers(u, v):
        return u[0] == v[0] and (u[1] is None or v[1] is None or u[1] == v[1])

    print(f"{'anomaly type':<20} {'TP':>4} {'FP':>4} {'FN':>4} {'excused':>8} {'precision':>10} {'recall':>7}")
    for t in sorted(set(FLAG_FOR.values()) | {ft for _, _, ft in flags}):
        pred = {(fi, None if t in INSTITUTION_LEVEL else fp) for fi, fp, ft in flags if ft == t}
        tp = sum(1 for u in truth[t] if flagged(t, *u))
        wrong = [u for u in pred if not any(covers(u, v) for v in truth[t])]
        excused = sum(1 for u in wrong if any(covers(u, v) for v in faulted))
        fp, fn = len(wrong) - excused, len(truth[t]) - tp
        prec = f"{tp / (tp + fp):.2f}" if tp + fp else "-"
        rec = f"{tp / (tp + fn):.2f}" if tp + fn else "-"
        print(f"{t:<20} {tp:>4} {fp:>4} {fn:>4} {excused:>8} {prec:>10} {rec:>7}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
