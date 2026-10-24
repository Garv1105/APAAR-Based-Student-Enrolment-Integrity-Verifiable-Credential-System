"""D3: explainable anomaly rules, Data Quality Score (DQS) and the risk-based inspection queue (PRD §9.4, §19 D3).

Pure functions over aggregate features, so the platform and the offline evaluator (scored against the
synthetic generator's ground_truth.json) run the SAME rules. Every flag carries the numbers that triggered it.
Flags are risk indicators for review, never proof of misconduct. No AI is involved.

Features per (institution, programme):
  fill, history_fills[]            regular seats filled / approved intake, current vs prior years
  foreign, history_foreign[]       FN/OCI/CIWG/NRI (supernumerary pool) admissions, current vs prior years
  max_dob_cluster, rows            largest group of students sharing one date of birth (computed in memory at upload)
  longest_apaar_run                longest run of consecutive APAAR numbers (computed in memory at upload)
Features per institution:
  minutes_before_deadline[]        for each upload batch
"""
import statistics
from datetime import date

from . import stats

# Thresholds (documented so a reviewer can argue with them)
SPIKE_Z, SPIKE_MIN_JUMP, MAD_FLOOR = 3.5, 0.20, 0.05   # robust z on fill ratio; MAD floored so 3 near-equal years don't hair-trigger
MIX_MIN_NEW, MIX_MIN_SHARE_JUMP = 5, 0.08              # foreign-pool admissions vs the historical maximum
DOB_CLUSTER_MIN = 10                                   # >=10 students with the same DOB in one programme
APAAR_RUN_MIN = 10                                     # >=10 consecutive APAAR numbers
DEADLINE_MINUTES = 180                                 # upload in the last 3 hours before the reporting deadline
LABEL = "Risk indicator for review, not proof of misconduct"


def robust_z(value: float, history: list[float]) -> tuple[float, float, float]:
    return stats.robust_z(value, history, MAD_FLOOR)


def programme_flags(f: dict) -> list[dict]:
    """f: {institution_id, programme, fill, history_fills, foreign, history_foreign, rows, max_dob_cluster, longest_apaar_run}"""
    out = []

    def flag(kind, score, evidence, why):
        out.append({"type": kind, "institution_id": f["institution_id"], "programme": f["programme"], "score": round(score, 2),
                    "evidence": evidence, "explanation": why, "label": LABEL})

    hist = [h for h in (f.get("history_fills") or []) if h is not None]
    if f.get("fill") is not None and len(hist) >= 2:
        z, med, mad = robust_z(f["fill"], hist)
        if z >= SPIKE_Z and f["fill"] - med >= SPIKE_MIN_JUMP:
            flag("ENROLMENT_SPIKE", z, {"fill_ratio": round(f["fill"], 3), "history_median": round(med, 3), "history_mad": round(mad, 3),
                                         "robust_z": round(z, 2), "history": [round(h, 3) for h in hist]},
                 f"fill ratio {f['fill']:.2f} vs 3-yr median {med:.2f} ({z:+.1f} robust z)")

    hf = [h for h in (f.get("history_foreign") or []) if h is not None]
    if f.get("foreign") is not None and hf and f.get("rows"):
        new = f["foreign"] - max(hf)
        share = f["foreign"] / f["rows"]
        hist_share = statistics.mean(hf) / f["rows"]
        if new >= MIX_MIN_NEW and share - hist_share >= MIX_MIN_SHARE_JUMP:
            flag("CATEGORY_MIX_SHIFT", share - hist_share, {"foreign_pool_now": f["foreign"], "foreign_pool_history": hf,
                                                            "share_now": round(share, 3), "share_history": round(hist_share, 3)},
                 f"FN/OCI/CIWG/NRI admissions {f['foreign']} vs at most {max(hf)} in prior years")

    if (f.get("max_dob_cluster") or 0) >= DOB_CLUSTER_MIN:
        flag("DOB_CLUSTER", f["max_dob_cluster"] / max(f.get("rows") or 1, 1),
             {"students_sharing_one_dob": f["max_dob_cluster"], "programme_rows": f.get("rows")},
             f"{f['max_dob_cluster']} students share one date of birth")

    if (f.get("longest_apaar_run") or 0) >= APAAR_RUN_MIN:
        flag("SEQUENTIAL_APAAR", float(f["longest_apaar_run"]), {"run_length": f["longest_apaar_run"]},
             f"{f['longest_apaar_run']} consecutive APAAR numbers")
    return out


def institution_flags(institution_id: str, minutes_before_deadline: list[float]) -> list[dict]:
    late = [m for m in minutes_before_deadline if 0 <= m <= DEADLINE_MINUTES]
    if not late:
        return []
    m = min(late)
    return [{"type": "DEADLINE_DUMP", "institution_id": institution_id, "programme": None, "score": round(1 - m / DEADLINE_MINUTES, 2),
             "evidence": {"minutes_before_deadline": round(m, 1), "late_batches": len(late)},
             "explanation": f"batch uploaded {m:.0f} min before the reporting deadline", "label": LABEL}]


# ---------- features computed in memory at upload (F1: plaintext never persisted) ----------
def longest_consecutive_run(apaars: list[str]) -> int:
    nums = sorted({int(a) for a in apaars if a and a.isdigit()})
    best = run = 1 if nums else 0
    for a, b in zip(nums, nums[1:]):
        run = run + 1 if b == a + 1 else 1
        best = max(best, run)
    return best


def max_dob_cluster(dobs: list[date | str]) -> int:
    counts: dict = {}
    for d in dobs:
        if d:
            counts[d] = counts.get(d, 0) + 1
    return max(counts.values(), default=0)


# ---------- Data Quality Score ----------
DQS_WEIGHTS = {  # sum = 1.0; shown in the UI next to each institution's score
    "validation_pass_rate": 0.30,   # accepted rows / submitted rows
    "seat_integrity": 0.15,         # 1 - excess seats / active enrolments
    "timeliness": 0.15,             # share of submitted rows not uploaded in the last 24h before (or after) the deadline
    "duplicate_exposure": 0.15,     # 1 - open duplicate cases per 100 enrolments / 5 (capped)
    "anomaly_flags": 0.10,          # 1 - flags / 3 (capped)
    "correction_churn": 0.10,       # 1 - enrolment updates / enrolments (capped)
    "declarations": 0.05,           # 1 - (E303 declaration mismatches + E501 post-deadline changes) / 3 (capped)
}


def dqs(m: dict) -> dict:
    """m: rows, accepted, active, excess, late_rows, open_cases, flags, updates, created, e303, e501. Returns score + components."""
    clamp = lambda x: max(0.0, min(1.0, x))  # noqa: E731
    comps = {
        "validation_pass_rate": m["accepted"] / m["rows"] if m["rows"] else 0.0,
        "seat_integrity": clamp(1 - m["excess"] / m["active"]) if m["active"] else 1.0,
        "timeliness": clamp(1 - m["late_rows"] / m["rows"]) if m["rows"] else 0.0,
        "duplicate_exposure": clamp(1 - (100 * m["open_cases"] / m["active"]) / 5) if m["active"] else 1.0,
        "anomaly_flags": clamp(1 - m["flags"] / 3),
        "correction_churn": clamp(1 - m["updates"] / m["created"]) if m["created"] else 1.0,
        "declarations": clamp(1 - (m["e303"] + m["e501"]) / 3),
    }
    parts = {k: round(100 * DQS_WEIGHTS[k] * v, 2) for k, v in comps.items()}
    return {"score": round(sum(parts.values()), 1), "components": {k: round(v, 3) for k, v in comps.items()},
            "points": parts, "weights": DQS_WEIGHTS}


def inspection_queue(entries: list[dict], weights: dict[str, float] | None = None) -> list[dict]:
    """entries: {institution_id, name, state, status, active, dqs|None, flags[] (visible flags only)}.
    risk = active x ((100 - DQS) + sum of weight(rule) x severity x FLAG_DQS_POINTS)  (A4: flags in DQS units, so
    inspector feedback visibly reorders the queue). Approved institutions that haven't submitted come first."""
    from .feedback import flag_points  # local import: feedback imports this module's thresholds
    out = []
    for e in entries:
        if e["dqs"] is None:
            if e["status"] != "approved":
                continue
            out.append({**e, "risk": None, "why": ["no student data submitted this year"]})
            continue
        points = round(flag_points(e["flags"], weights or {}), 2)
        risk = round(e["active"] * ((100 - e["dqs"]["score"]) + points), 1)
        weakest = sorted(e["dqs"]["components"].items(), key=lambda kv: kv[1])[:2]
        why = [f"{k.replace('_', ' ')} {v:.0%}" for k, v in weakest if v < 1] + [fl["explanation"] for fl in e["flags"][:3]]
        out.append({**e, "risk": risk, "flag_points": points, "why": why or ["no issues found"]})
    return sorted(out, key=lambda e: (e["risk"] is not None, -(e["risk"] or 0)))
