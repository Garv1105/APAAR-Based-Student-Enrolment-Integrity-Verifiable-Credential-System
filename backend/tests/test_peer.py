import json
import random

from app.anomaly import peer, programme_flags, stats
from conftest import login
from test_api import upload

SPEC_KEYS = {"metric", "value", "peer_median", "peer_mad", "peer_z", "peer_level", "peer_count", "p_value", "bh_q"}


def prog(i, *, code="CSE", state="KA", intake=120, fill=0.7, hist=None, fs=None, hfs=None, inst=None):
    return {"institution_id": inst or f"I{i:03d}", "programme": code, "state": state, "approved_intake": intake,
            "fill": fill, "history_fills": hist or [], "foreign_share": fs, "history_foreign_shares": hfs}


def steady(n, seed, **kw):
    rng = random.Random(seed)
    out = []
    for i in range(n):
        h = [rng.gauss(0.70, 0.05) for _ in range(3)]
        out.append(prog(i, fill=sorted(h)[1] + rng.gauss(0.02, 0.03), hist=h, **kw))
    return out


def unit(code, state, band, value):
    return {"programme": code, "state": state, "band": band, "values": {"fill_ratio": value}}


def test_fallback_picks_the_most_specific_level_with_8_peers():
    units = [unit("CSE", "KA", "M", 0.7) for _ in range(9)]
    assert peer.peer_group(0, units, "fill_ratio", peer.PROGRAMME_LEVELS)[0] == "programme+state+size"
    units = [unit("CSE", "KA", "M", 0.7) for _ in range(5)] + [unit("CSE", "TN", "M", 0.7) for _ in range(5)]
    level, peers = peer.peer_group(0, units, "fill_ratio", peer.PROGRAMME_LEVELS)
    assert level == "programme+size" and len(peers) == 9
    units = [unit("CSE", s, b, 0.7) for s, b in [("KA", "S"), ("TN", "M"), ("MH", "L")] for _ in range(3)]
    assert peer.peer_group(0, units, "fill_ratio", peer.PROGRAMME_LEVELS)[0] == "programme"
    assert peer.peer_group(0, [unit("CSE", "KA", "M", 0.7) for _ in range(8)], "fill_ratio", peer.PROGRAMME_LEVELS) is None
    assert peer.size_band(60) == "S" and peer.size_band(61) == "M" and peer.size_band(181) == "L"


def test_benjamini_hochberg_textbook_example():
    p = [0.0001, 0.0004, 0.0019, 0.0095, 0.0201, 0.0278, 0.0298, 0.0344, 0.0459, 0.3240, 0.4262, 0.5719, 0.6528, 0.7590, 1.000]
    assert stats.benjamini_hochberg(p, 0.05) == [True] * 4 + [False] * 11
    assert stats.benjamini_hochberg(list(reversed(p)), 0.05) == [False] * 11 + [True] * 4
    assert stats.benjamini_hochberg([0.5, 0.01], 0.05) == [False, True]
    assert abs(stats.normal_sf(1.96) - 0.025) < 1e-3


def test_null_world_has_no_flags_and_one_planted_outlier_is_the_only_flag():
    world = steady(50, seed=7)
    assert peer.peer_flags(world, [])["flags"] == []
    world.append(prog(99, fill=1.25, hist=[0.40, 0.40, 0.40]))
    out = peer.peer_flags(world, [])
    assert [f["institution_id"] for f in out["flags"]] == ["I099"]
    e = out["flags"][0]["evidence"]
    assert e["metric"] == "fill_growth" and e["value"] == 0.85 and e["peer_count"] == 50 and e["p_value"] < 1e-6
    assert "+85% vs +" in out["flags"][0]["explanation"] and "(KA, size M)" in out["flags"][0]["explanation"]


def test_new_college_without_history_is_caught_by_the_peer_rule_only():
    world = steady(20, seed=11) + [prog(50, fill=1.30, hist=[])]
    out = peer.peer_flags(world, [])
    assert [(f["institution_id"], f["evidence"]["metric"]) for f in out["flags"]] == [("I050", "fill_ratio")]
    history_rule = programme_flags({"institution_id": "I050", "programme": "CSE", "rows": 156, "fill": 1.30, "history_fills": [],
                                    "foreign": 0, "history_foreign": None, "max_dob_cluster": 0, "longest_apaar_run": 0})
    assert history_rule == []


def test_full_every_year_and_steady_high_foreign_share_are_not_flagged():
    world = steady(20, seed=3, fs=0.02, hfs=[0.02, 0.02, 0.02])
    world.append(prog(60, fill=1.0, hist=[1.0, 1.0, 1.0], fs=0.30, hfs=[0.30, 0.31, 0.29]))
    assert peer.peer_flags(world, [])["flags"] == []
    world.append(prog(61, fill=0.7, hist=[], fs=0.30, hfs=None))
    assert [(f["institution_id"], f["evidence"]["metric"]) for f in peer.peer_flags(world, [])["flags"]] == [("I061", "foreign_share")]


def test_practical_gap_is_required_as_well_as_significance():
    base = [prog(i, fill=0.70, hist=[0.70, 0.70, 0.70]) for i in range(10)]
    small = peer.peer_flags(base + [prog(80, fill=0.80, hist=[0.70, 0.70, 0.70])], [])
    assert small["tests"] == 11 and small["flags"] == []
    z, _, _ = stats.robust_z(0.10, [0.0] * 10, peer.FLOORS["fill_growth"])
    assert stats.normal_sf(z) < 0.05
    big = peer.peer_flags(base + [prog(80, fill=1.10, hist=[0.70, 0.70, 0.70])], [])
    assert [f["institution_id"] for f in big["flags"]] == ["I080"]


def test_evidence_is_aggregate_only_and_matches_the_spec():
    world = steady(30, seed=5) + [prog(90, fill=1.30, hist=[])]
    f = peer.peer_flags(world, [])["flags"][0]
    assert set(f["evidence"]) == SPEC_KEYS | {"scope"} and f["evidence"]["scope"] == "programme"
    text = json.dumps(f["evidence"]) + f["explanation"]
    assert not any(p["institution_id"] in text for p in world if p["institution_id"] != "I090")
    assert f["label"] == "Risk indicator for review, not proof of misconduct"


def test_institution_metrics_are_tested_once_per_institution():
    rng = random.Random(13)
    insts = [{"institution_id": f"J{i:02d}", "state": "KA", "total_intake": 300, "rejection_rate": rng.uniform(0.03, 0.07),
              "late_share": rng.uniform(0.05, 0.15)} for i in range(12)]
    insts.append({"institution_id": "J99", "state": "KA", "total_intake": 300, "rejection_rate": 0.40, "late_share": 0.10})
    progs = [prog(i, inst=f["institution_id"], code=c) for i, f in enumerate(insts) for c in ("CSE", "ECE", "ME")]
    out = peer.peer_flags(progs, insts)
    inst_flags = [f for f in out["flags"] if f["evidence"]["scope"] == "institution"]
    assert [(f["institution_id"], f["programme"], f["evidence"]["metric"]) for f in inst_flags] == [("J99", None, "rejection_rate")]
    assert inst_flags[0]["evidence"]["peer_level"] == "state+size" and "similar institutions (KA, size L)" in inst_flags[0]["explanation"]


def test_small_world_reports_insufficient_peers_instead_of_flagging():
    out = peer.peer_flags([prog(i, fill=1.5 if i == 0 else 0.7) for i in range(4)],
                          [{"institution_id": "I000", "state": "KA", "total_intake": 100, "rejection_rate": 0.9, "late_share": 1.0}])
    assert out["flags"] == [] and out["tests"] == 0 and out["insufficient"] == 6


def test_peer_status_endpoint_on_the_4_college_db(client):
    upload(client, "inst-a", "A1.csv")
    r = client.get("/v1/anomalies/peer-status", headers=login(client, "aicte"))
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["flagged"] == 0 and s["insufficient"] > 0 and s["min_peers"] == 8 and "insufficient peers" in s["note"]
    assert client.get("/v1/anomalies/peer-status", headers=login(client, "inst-a")).status_code == 403
    assert not any(f["type"] == "PEER_OUTLIER" for f in client.get("/v1/anomalies", headers=login(client, "aicte")).json())
