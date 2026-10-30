import math

from .. import crypto
from . import network
from .rules import APAAR_RUN_MIN, DEADLINE_MINUTES, DOB_CLUSTER_MIN

WEIGHT_FLOOR = 0.25
FLAG_DQS_POINTS = 10
REAPPEAR_CHANGE = 0.20
RULES = ("ENROLMENT_SPIKE", "CATEGORY_MIX_SHIFT", "DOB_CLUSTER", "SEQUENTIAL_APAAR", "DEADLINE_DUMP", "PEER_OUTLIER",
         "SHARED_STUDENT_RING", "SEAT_BLOCKING")
PRIMARY_FIELD = {"PEER_OUTLIER": "value", "ENROLMENT_SPIKE": "fill_ratio", "CATEGORY_MIX_SHIFT": "share_now",
                 "DOB_CLUSTER": "students_sharing_one_dob", "SEQUENTIAL_APAAR": "run_length",
                 "DEADLINE_DUMP": "minutes_before_deadline", "SHARED_STUDENT_RING": "shared_students",
                 "SEAT_BLOCKING": "active_shared"}
Z_BASE, Z_SPAN, RATIO_FULL = 3.0, 5.0, 0.2
COUNT_THRESHOLD = {"DOB_CLUSTER": ("students_sharing_one_dob", DOB_CLUSTER_MIN), "SEQUENTIAL_APAAR": ("run_length", APAAR_RUN_MIN),
                   "SEAT_BLOCKING": ("active_shared", network.SEAT_BLOCKING_MIN)}


def flag_key(flag: dict, year: str) -> str:
    ev = flag.get("evidence") or {}
    qualifier = ev.get("metric") or ev.get("with_institution") or ""
    return crypto.sha256_hex(f"{flag['type']}|{flag['institution_id']}|{flag.get('programme') or ''}|{year}|{qualifier}".encode())


def severity(flag: dict) -> float:
    ev, t = flag.get("evidence") or {}, flag["type"]
    clamp = lambda x: max(0.0, min(1.0, x))  # noqa: E731
    if t in ("ENROLMENT_SPIKE", "PEER_OUTLIER"):
        return clamp((ev.get("robust_z", ev.get("peer_z", 0)) - Z_BASE) / Z_SPAN)
    if t == "CATEGORY_MIX_SHIFT":
        return clamp((ev.get("share_now", 0) - ev.get("share_history", 0)) / RATIO_FULL)
    if t == "SHARED_STUDENT_RING":
        return clamp(ev.get("shared_ratio", 0) / RATIO_FULL)
    if t in COUNT_THRESHOLD:
        field, threshold = COUNT_THRESHOLD[t]
        return clamp(0.1 + (ev.get(field, 0) / threshold - 1) / 3)
    if t == "DEADLINE_DUMP":
        return clamp(1 - ev.get("minutes_before_deadline", DEADLINE_MINUTES) / DEADLINE_MINUTES)
    return 0.5


def precision(confirmed: int, dismissed: int) -> float:
    return (confirmed + 1) / (confirmed + dismissed + 2)


def beta_interval(a: float, b: float, mass: float = 0.9, n: int = 4000) -> tuple[float, float]:
    logc = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
    xs = [(i + 0.5) / n for i in range(n)]
    pdf = [math.exp(logc + (a - 1) * math.log(x) + (b - 1) * math.log(1 - x)) for x in xs]
    total, acc, lo, hi = sum(pdf), 0.0, None, None
    for x, p in zip(xs, pdf):
        acc += p / total
        if lo is None and acc >= (1 - mass) / 2:
            lo = x
        if hi is None and acc >= 1 - (1 - mass) / 2:
            hi = x
    return round(lo, 3), round(hi, 3)


def weight(confirmed: int, dismissed: int) -> float:
    return max(WEIGHT_FLOOR, precision(confirmed, dismissed))


def evidence_changed(flag_type: str, snapshot: dict, current: dict) -> bool:
    field = PRIMARY_FIELD.get(flag_type)
    old, new = snapshot.get(field), current.get(field)
    if not isinstance(old, (int, float)) or not isinstance(new, (int, float)):
        return True
    return abs(new - old) / max(abs(old), 1e-9) > REAPPEAR_CHANGE


def suppressed(flag: dict, latest_review: dict | None) -> bool:
    if not (latest_review and latest_review["decision"] == "dismissed"):
        return False
    baseline = latest_review.get("baseline_snapshot", latest_review["evidence_snapshot"])
    return not evidence_changed(flag["type"], baseline, flag.get("evidence") or {})


def latest_per_flag(reviews: list[dict]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for r in sorted(reviews, key=lambda r: (r["reviewed_at"], r["id"])):
        prev = out.get(r["flag_key"])
        keep = prev and prev["decision"] == "dismissed" and r["decision"] == "dismissed"
        out[r["flag_key"]] = {**r, "baseline_snapshot": prev["baseline_snapshot"] if keep else r["evidence_snapshot"]}
    return out


def rule_performance(reviews: list[dict]) -> dict:
    latest = latest_per_flag(reviews).values()
    rules = []
    for rule in RULES:
        mine = [r for r in latest if r["rule"] == rule]
        c, d = sum(r["decision"] == "confirmed" for r in mine), sum(r["decision"] == "dismissed" for r in mine)
        rules.append({"rule": rule, "confirmed": c, "dismissed": d, "needs_info": sum(r["decision"] == "needs_info" for r in mine),
                      "precision": round(precision(c, d), 3), "interval": list(beta_interval(c + 1, d + 1)),
                      "weight": round(weight(c, d), 3)})
    by_reviewer: dict[str, list[dict]] = {}
    for r in reviews:
        by_reviewer.setdefault(r["reviewer"], []).append(r)
    reviewers = [{"reviewer": who, "reviews": len(rs), "dismissed": sum(r["decision"] == "dismissed" for r in rs),
                  "dismissal_rate": round(sum(r["decision"] == "dismissed" for r in rs) / len(rs), 3)}
                 for who, rs in sorted(by_reviewer.items())]
    return {"rules": rules, "reviewers": reviewers}


def rule_weights(reviews: list[dict]) -> dict[str, float]:
    return {r["rule"]: r["weight"] for r in rule_performance(reviews)["rules"]}


def flag_points(flags: list[dict], weights: dict[str, float]) -> float:
    return sum(weights.get(f["type"], 0.5) * severity(f) * FLAG_DQS_POINTS for f in flags)
