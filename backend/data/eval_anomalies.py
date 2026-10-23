r"""Score the D3 anomaly rules against the synthetic generator's labelled anomalies (ground_truth.json).

    ..\.venv\Scripts\python.exe data/eval_anomalies.py <dataset dir>      (from backend/)

The teammate's generator (synthetic/) writes messy uploads; they are read with its own reference parser
(synthetic.selfcheck.read_batch + canon), turned into the same aggregate features the platform computes at
upload, and run through app.anomaly — the exact functions the API uses. The labels were written by a
different author than the rules, so this is an independent check of the rules (on synthetic data).

Two precision figures are reported. "strict" counts every flag outside the anomaly labels as a false positive.
"excess-explained" does not count spike / category-mix flags on programmes that the generator deliberately
over-filled (E301/E302 programme faults): those flags point at real over-admission that the labels record
as a programme fault rather than as an anomaly. Both are printed; neither is tuned away.
"""
import csv
import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND.parent))
from app import anomaly  # noqa: E402
from synthetic.selfcheck import canon, read_batch  # noqa: E402

FOREIGN = {"FN", "OCI", "CIWG", "NRI"}


def features(root: Path) -> tuple[list[dict], dict]:
    man = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    year, deadline = man["academic_year"], datetime.fromisoformat(man["reporting_deadline"])
    intake = {(r["institution_id"], r["programme"]): int(r["approved_intake"])
              for r in csv.DictReader(open(root / "registry/approved_intake.csv", encoding="utf-8")) if r["academic_year"] == year}
    hist = defaultdict(list)
    for r in csv.DictReader(open(root / "history/enrolment_history.csv", encoding="utf-8")):
        hist[(r["institution_id"], r["programme"])].append(
            (r["academic_year"], int(r["enrolled_regular"]) / int(r["approved_intake"]), int(r["enrolled_foreign_pool"])))
    progs = defaultdict(lambda: {"regular": 0, "foreign": 0, "rows": 0, "dobs": [], "apaars": []})
    minutes = defaultdict(list)
    for b in man["batches"]:
        minutes[b["institution_id"]].append((deadline - datetime.fromisoformat(b["upload_at"])).total_seconds() / 60)
        for raw in read_batch(root, b):
            r = canon(raw, b["dialect"])
            if r["status"] != "active" or not r["programme"]:
                continue
            p = progs[(b["institution_id"], r["programme"])]
            p["rows"] += 1
            p["regular"] += r["seat"] == "REGULAR"
            p["foreign"] += r["seat"] in FOREIGN
            p["dobs"].append(r["dob"])
            p["apaars"].append(r["apaar"])
    feats = []
    for (inst, prog), p in progs.items():
        h = sorted(hist.get((inst, prog), []))
        feats.append({"institution_id": inst, "programme": prog, "rows": p["rows"],
                      "fill": p["regular"] / intake[(inst, prog)] if intake.get((inst, prog)) else None,
                      "history_fills": [x[1] for x in h], "foreign": p["foreign"], "history_foreign": [x[2] for x in h],
                      "max_dob_cluster": anomaly.max_dob_cluster(p["dobs"]),
                      "longest_apaar_run": anomaly.longest_consecutive_run(p["apaars"])})
    return feats, minutes


def evaluate(root: Path) -> dict:
    feats, minutes = features(root)
    pred = {(f["type"], f["institution_id"], f["programme"]) for x in feats for f in anomaly.programme_flags(x)}
    pred |= {(f["type"], f["institution_id"], None) for inst, ms in minutes.items() for f in anomaly.institution_flags(inst, ms)}
    gt = json.loads((root / "ground_truth.json").read_text(encoding="utf-8"))
    truth = {(a["type"], a["institution_id"], a["programme"]) for a in gt["anomalies"]}
    excess = {(p["institution_id"], p["programme"]) for p in gt["programme_faults"] if p["code"] in ("E301", "E302")}
    explainable = {"ENROLMENT_SPIKE", "CATEGORY_MIX_SHIFT"}
    units = {"programme": len(feats), "institution": len(minutes)}
    out = {}
    for t in sorted({k[0] for k in truth | pred} | {"ENROLMENT_SPIKE", "CATEGORY_MIX_SHIFT", "DOB_CLUSTER", "SEQUENTIAL_APAAR", "DEADLINE_DUMP"}):
        tp = len({k for k in pred & truth if k[0] == t})
        fps = {k for k in pred - truth if k[0] == t}
        explained = {k for k in fps if t in explainable and k[1:] in excess}
        fn = len({k for k in truth - pred if k[0] == t})
        p = lambda n_fp: tp / (tp + n_fp) if tp + n_fp else None  # noqa: E731
        out[t] = {"tp": tp, "fp": len(fps), "fp_explained_by_excess": len(explained), "fn": fn,
                  "precision": p(len(fps)), "precision_excess_explained": p(len(fps - explained)),
                  "recall": tp / (tp + fn) if tp + fn else None,
                  "false_positives": sorted(k[1:] for k in fps - explained)[:5],
                  "explained": sorted(k[1:] for k in explained)[:5],
                  "missed": sorted(k[1:] for k in truth - pred if k[0] == t)[:5]}
    return {"units": units, "per_type": out}


def table(res: dict) -> str:
    lines = [f"units scored: {res['units']['programme']} programmes, {res['units']['institution']} institutions",
             f"{'rule':20} {'TP':>4} {'FP':>4} {'(excess)':>8} {'FN':>4} {'precision':>9} {'prec*':>7} {'recall':>7}"]
    fmt = lambda v: "   n/a" if v is None else f"{v:.3f}"  # noqa: E731
    for t, m in res["per_type"].items():
        lines.append(f"{t:20} {m['tp']:4} {m['fp']:4} {m['fp_explained_by_excess']:8} {m['fn']:4} {fmt(m['precision']):>9} "
                     f"{fmt(m['precision_excess_explained']):>7} {fmt(m['recall']):>7}")
    lines.append("prec* = precision when flags on deliberately over-filled programmes (E301/E302) count as explained")
    return "\n".join(lines)


if __name__ == "__main__":
    r = evaluate(Path(sys.argv[1]))
    print(table(r))
    for t, m in r["per_type"].items():
        if m["false_positives"] or m["missed"] or m["explained"]:
            print(f"  {t}: unexplained FP {m['false_positives']} | explained by excess {m['explained']} | missed {m['missed']}")
