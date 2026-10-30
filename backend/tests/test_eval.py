import csv
import json
from datetime import date
from pathlib import Path

from app.validation import Ctx, student_id_key, validate_batch

DATA = Path(__file__).resolve().parent.parent / "data"
SEED = json.loads((DATA / "seed/registry.json").read_text())


def run_scenario():
    reg = {p["apaar"]: p for p in json.loads((DATA / "seed/apaar_registry.json").read_text())["people"]}
    users = {u["id"]: u for u in SEED["users"]}
    insts = {i["id"]: i for i in SEED["institutions"]}
    intake = {x["programme"]: x["approved_intake"] for x in SEED["approved_intake"]}
    cats = {c["code"]: c for c in SEED["seat_categories"]}
    y = SEED["academic_years"][0]
    year = {"code": y["code"], "window_start": date.fromisoformat(y["window_start"]), "window_end": date.fromisoformat(y["window_end"])}
    active, counters, predicted = {}, {}, {}
    by_apaar = {}
    for step in json.loads((DATA / "synthetic/scenario.json").read_text())["steps"]:
        if step["op"] == "upload":
            inst = users[step["user"]]["institution_id"]
            progs = {p["code"]: {"id": f"{inst}:{p['code']}", "approved_intake": intake.get(f"{inst}:{p['code']}"),
                                 "duration_years": p["duration_years"]}
                     for p in SEED["programmes"] if p["institution_id"] == inst}
            ctx = Ctx(institution_id=inst, institution_status=insts[inst]["status"], year=year, programmes=progs,
                      seat_categories=cats, registry_lookup=reg.get,
                      own_active_bi={b for b, v in active.items() if v[0] == inst},
                      other_active_bi={b for b, v in active.items() if v[0] != inst},
                      own_active_student_ids={v[3] for v in active.values() if v[0] == inst},
                      counters=counters)
            with open(DATA / "synthetic" / step["file"], encoding="utf-8") as f:
                rows = list(csv.DictReader(f))
            for o in validate_batch(rows, ctx):
                predicted[(step["file"], o["row_no"])] = {i["code"] for i in o["issues"]}
                if o["accepted"]:
                    k = o["bi"] or ("row", step["file"], o["row_no"])
                    active[k] = (inst, o["programme_id"], o["counter_keys"], student_id_key(o["data"]["institution_student_id"]))
                    if o["bi"]:
                        by_apaar[rows[o["row_no"] - 1]["apaar_id"]] = o["bi"]
        elif step["op"] == "patch" and step["body"].get("status") in ("withdrawn", "migrated"):
            inst, pid, keys, _ = active.pop(by_apaar[step["apaar"]])
            for k in keys:
                counters[(pid, k)] -= 1
    return predicted


def test_precision_recall_per_code():
    truth = {(t["file"], t["row_no"]): set(t["expected"])
             for t in json.loads((DATA / "synthetic/ground_truth.json").read_text())["rows"]}
    pred = run_scenario()
    assert pred.keys() == truth.keys()
    all_codes = sorted(set().union(*truth.values(), *pred.values()))
    print(f"\n{'code':6} {'TP':>4} {'FP':>4} {'FN':>4} {'precision':>9} {'recall':>7}")
    failures = []
    for c in all_codes:
        tp = sum(1 for k in truth if c in truth[k] and c in pred[k])
        fp = sum(1 for k in truth if c not in truth[k] and c in pred[k])
        fn = sum(1 for k in truth if c in truth[k] and c not in pred[k])
        p = tp / (tp + fp) if tp + fp else 1.0
        r = tp / (tp + fn) if tp + fn else 1.0
        print(f"{c:6} {tp:4} {fp:4} {fn:4} {p:9.3f} {r:7.3f}")
        if p < 1.0 or r < 1.0:
            failures.append((c, [k for k in truth if (c in truth[k]) != (c in pred[k])][:5]))
    assert not failures, failures
