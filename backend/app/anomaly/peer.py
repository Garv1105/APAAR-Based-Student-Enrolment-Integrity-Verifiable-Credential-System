import statistics
from collections import defaultdict

from . import stats
from .rules import LABEL

MIN_PEERS = 8
FDR_Q = 0.05
SIZE_BANDS = ((60, "S"), (180, "M"))
FLOORS = {"fill_ratio": 0.03, "fill_growth": 0.03, "foreign_share": 0.02, "foreign_share_change": 0.02,
          "rejection_rate": 0.02, "late_share": 0.05}
MIN_GAP = {"fill_ratio": 0.15, "fill_growth": 0.15, "foreign_share": 0.10, "foreign_share_change": 0.10,
           "rejection_rate": 0.10, "late_share": 0.30}
METRIC_LABEL = {"fill_ratio": "fill ratio", "fill_growth": "fill growth", "foreign_share": "foreign-pool share",
                "foreign_share_change": "foreign-pool share change", "rejection_rate": "rejected-row rate",
                "late_share": "share of rows uploaded in the last 24 h"}
SIGNED = {"fill_growth", "foreign_share_change"}
PROGRAMME_LEVELS = (("programme+state+size", lambda r: (r["programme"], r["state"], r["band"])),
                    ("programme+size", lambda r: (r["programme"], r["band"])),
                    ("programme", lambda r: (r["programme"],)))
INSTITUTION_LEVELS = (("state+size", lambda r: (r["state"], r["band"])), ("size", lambda r: (r["band"],)))


def size_band(intake: float | None) -> str:
    return next((band for limit, band in SIZE_BANDS if (intake or 0) <= limit), "L")


def programme_metrics(r: dict) -> tuple[dict, list[str]]:
    vals, tested = {}, []
    hist = r.get("history_fills") or []
    if r.get("fill") is not None:
        vals["fill_ratio"] = r["fill"]
        if hist:
            vals["fill_growth"] = r["fill"] - statistics.median(hist)
        tested.append("fill_growth" if hist else "fill_ratio")
    hfs = r.get("history_foreign_shares") or []
    if r.get("foreign_share") is not None:
        vals["foreign_share"] = r["foreign_share"]
        if hfs:
            vals["foreign_share_change"] = r["foreign_share"] - statistics.median(hfs)
        tested.append("foreign_share_change" if hfs else "foreign_share")
    return vals, tested


def group_index(units: list[dict], levels) -> dict:
    idx = defaultdict(list)
    for j, u in enumerate(units):
        for name, key in levels:
            k = key(u)
            for m, v in u["values"].items():
                idx[(name, m, k)].append((j, v))
    return idx


def peer_group(i: int, units: list[dict], metric: str, levels, index: dict | None = None) -> tuple[str, list[float]] | None:
    index = group_index(units, levels) if index is None else index
    for name, key in levels:
        peers = [v for j, v in index.get((name, metric, key(units[i])), ()) if j != i]
        if len(peers) >= MIN_PEERS:
            return name, peers
    return None

def _pct(x: float, signed: bool) -> str:
    return f"{x * 100:+.0f}%" if signed else f"{x * 100:.0f}%"


def _where(level: str, u: dict) -> str:
    if "state" in level:
        return f"{u['state']}, size {u['band']}"
    return f"size {u['band']}" if "size" in level else "national"


def peer_flags(programmes: list[dict], institutions: list[dict]) -> dict:
    prog_units, inst_units = [], []
    for r in programmes:
        vals, tested = programme_metrics(r)
        prog_units.append({**r, "band": size_band(r.get("approved_intake")), "values": vals, "tested": tested, "scope": "programme"})
    for r in institutions:
        vals = {m: r[m] for m in ("rejection_rate", "late_share") if r.get(m) is not None}
        inst_units.append({**r, "programme": None, "band": size_band(r.get("total_intake")), "values": vals,
                           "tested": list(vals), "scope": "institution"})

    tests, insufficient = [], 0
    for units, levels in ((prog_units, PROGRAMME_LEVELS), (inst_units, INSTITUTION_LEVELS)):
        index = group_index(units, levels)
        for i, u in enumerate(units):
            for m in u["tested"]:
                g = peer_group(i, units, m, levels, index)
                if g is None:
                    insufficient += 1
                    continue
                level, peers = g
                z, med, mad = stats.robust_z(u["values"][m], peers, FLOORS[m])
                tests.append({"unit": u, "metric": m, "level": level, "count": len(peers), "z": z, "median": med,
                              "mad": mad, "p": stats.normal_sf(z)})

    flags = []
    for t, survives in zip(tests, stats.benjamini_hochberg([t["p"] for t in tests], FDR_Q)):
        u, m = t["unit"], t["metric"]
        if not survives or u["values"][m] - t["median"] < MIN_GAP[m]:
            continue
        signed = m in SIGNED
        what = f"{u['programme']} {METRIC_LABEL[m]}" if u["scope"] == "programme" else f"Institution {METRIC_LABEL[m]}"
        unit_word = "programmes" if u["scope"] == "programme" else "institutions"
        flags.append({
            "type": "PEER_OUTLIER", "institution_id": u["institution_id"], "programme": u["programme"],
            "score": round(min(1.0, t["z"] / 10), 2),
            "evidence": {"metric": m, "value": round(u["values"][m], 4), "peer_median": round(t["median"], 4),
                         "peer_mad": round(t["mad"], 4), "peer_z": round(t["z"], 2), "peer_level": t["level"],
                         "peer_count": t["count"], "p_value": float(f"{t['p']:.3g}"), "bh_q": FDR_Q, "scope": u["scope"]},
            "explanation": (f"{what} {_pct(u['values'][m], signed)} vs {_pct(t['median'], signed)} median of {t['count']} "
                            f"similar {unit_word} ({_where(t['level'], u)})"),
            "label": LABEL})
    return {"flags": flags, "tests": len(tests), "insufficient": insufficient}
