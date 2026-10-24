"""D3: explainable anomaly rules, DQS and the risk-ranked inspection queue."""
import csv
import io
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

import pytest

from app import anomaly
from conftest import login
from test_api import _csv, upload

REPO = Path(__file__).resolve().parents[2]


def feats(**kw):
    base = {"institution_id": "I", "programme": "P", "rows": 60, "fill": 0.85, "history_fills": [0.84, 0.86, 0.85],
            "foreign": 1, "history_foreign": [0, 1, 2], "max_dob_cluster": 2, "longest_apaar_run": 1}
    return base | kw


def types(fs):
    return {f["type"] for f in fs}


def test_rules_fire_with_evidence_and_stay_quiet_on_normal_data():
    assert anomaly.programme_flags(feats()) == []
    spike = anomaly.programme_flags(feats(fill=1.0, history_fills=[0.40, 0.41, 0.49]))
    assert types(spike) == {"ENROLMENT_SPIKE"} and spike[0]["evidence"]["robust_z"] >= anomaly.SPIKE_Z
    assert "risk indicator" in spike[0]["label"].lower() and "median" in spike[0]["explanation"]
    # a big z on a tiny absolute jump is not a spike (MAD floor + minimum jump)
    assert anomaly.programme_flags(feats(fill=0.95, history_fills=[0.90, 0.90, 0.90])) == []
    assert types(anomaly.programme_flags(feats(foreign=13, history_foreign=[0, 0, 0]))) == {"CATEGORY_MIX_SHIFT"}
    assert anomaly.programme_flags(feats(foreign=4, history_foreign=[0, 0, 0])) == []
    assert anomaly.programme_flags(feats(history_foreign=None, foreign=30)) == []   # unknown history: rule skipped
    assert types(anomaly.programme_flags(feats(max_dob_cluster=25))) == {"DOB_CLUSTER"}
    assert types(anomaly.programme_flags(feats(longest_apaar_run=30))) == {"SEQUENTIAL_APAAR"}
    assert types(anomaly.institution_flags("I", [55.0, 20000.0])) == {"DEADLINE_DUMP"}
    assert anomaly.institution_flags("I", [600.0, -30.0]) == []   # hours early, or after the deadline (that's E501 territory)


def test_feature_helpers():
    assert anomaly.longest_consecutive_run(["100000000001", "100000000002", "100000000003", "100000000009", ""]) == 3
    assert anomaly.longest_consecutive_run([]) == 0
    d = date(2008, 5, 8)
    assert anomaly.max_dob_cluster([d, d, d, date(2008, 1, 1), None]) == 3


def test_dqs_points_sum_to_score_and_weights_sum_to_one():
    m = {"rows": 200, "accepted": 180, "active": 180, "excess": 9, "late_rows": 0, "open_cases": 2, "flags": 1,
         "updates": 3, "created": 180, "e303": 1, "e501": 0}
    d = anomaly.dqs(m)
    assert abs(sum(anomaly.DQS_WEIGHTS.values()) - 1) < 1e-9
    assert abs(sum(d["points"].values()) - d["score"]) < 0.1 and 0 <= d["score"] <= 100
    assert d["components"]["validation_pass_rate"] == 0.9 and d["components"]["seat_integrity"] == 0.95
    perfect = anomaly.dqs({**m, "accepted": 200, "excess": 0, "open_cases": 0, "flags": 0, "updates": 0, "e303": 0})
    assert perfect["score"] == 100.0


@pytest.mark.skipif(not __import__("importlib").util.find_spec("yaml"), reason="needs PyYAML (requirements-dev.txt)")
def test_rules_against_independent_synthetic_ground_truth(tmp_path):
    """Teammate's generator labels anomalies independently of these rules (demo preset, seed 7)."""
    out = tmp_path / "demo"
    subprocess.run([sys.executable, "-m", "synthetic.generate", "--preset", "demo", "--out", str(out), "--seed", "7"],
                   cwd=REPO, check=True, capture_output=True)
    sys.path.insert(0, str(REPO / "backend"))
    from data.eval_anomalies import evaluate, table
    res = evaluate(out)
    print("\n" + table(res))
    for t, m in res["per_type"].items():
        assert m["recall"] == 1.0, (t, m["missed"])
        assert m["false_positives"] == [], (t, m["false_positives"])   # every other flag is a planted over-admission


def test_platform_flags_spike_and_ghost_batches(client, dbconn):
    for user, f in (("inst-a", "A1.csv"), ("inst-b", "B1.csv"), ("inst-c", "C1.csv")):
        upload(client, user, f)
    flags = client.get("/v1/anomalies", headers=login(client, "aicte")).json()
    # A3: the 5 students active at both A and B also raise SEAT_BLOCKING on both (a pair, not a ring)
    assert [(f["type"], f["institution_id"], f["programme"]) for f in flags] == [
        ("ENROLMENT_SPIKE", "1-0000000003", "MBA"), ("SEAT_BLOCKING", "1-0000000001", None), ("SEAT_BLOCKING", "1-0000000002", None)]
    ev = flags[0]["evidence"]
    assert ev["fill_ratio"] > 0.95 and ev["history_median"] == 0.6   # 118/120 vs 72/120 median
    # ghost batch at A: 12 students sharing one DOB, and 12 consecutive APAARs (rejected: not in the registry)
    names = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliet", "Kilo", "Lima"]
    rows = []
    for i, n in enumerate(names):
        rows.append({"apaar_id": "", "apaar_reason": "PENDING", "institution_student_id": f"G/{i}", "student_name": f"{n} Rao",
                     "dob": "2008-05-08", "guardian_name": "", "programme_code": "ECE", "academic_year": "2026-27",
                     "year_of_study": "1", "seat_category": "REGULAR", "is_supernumerary": "N", "is_lateral_entry": "N",
                     "is_nri": "N", "is_oci": "N", "is_fn": "N", "is_ciwg": "N", "admission_date": "2026-08-01", "declared_intake": ""})
        rows.append({**rows[-1], "apaar_id": f"5000000000{i:02d}", "apaar_reason": "", "institution_student_id": f"S/{i}",
                     "dob": (date(2007, 1, 1) + timedelta(days=i * 31)).isoformat(), "student_name": f"{n} Iyer"})
    r = client.post("/v1/batches", files={"file": ("g.csv", _csv(rows), "text/csv")}, headers=login(client, "inst-a"))
    assert r.status_code == 201 and r.json()["counts"]["rejected"] == 12   # sequential IDs fail E103, yet the batch is suspicious
    got = {(f["type"], f["programme"]) for f in client.get("/v1/anomalies", headers=login(client, "aicte")).json()
           if f["institution_id"] == "1-0000000001"}
    assert got == {("DOB_CLUSTER", "ECE"), ("SEQUENTIAL_APAAR", "ECE"), ("SEAT_BLOCKING", None)}
    # only aggregates were stored: no DOBs or APAARs in batch_features
    assert set(dbconn.execute("SELECT * FROM batch_features LIMIT 1").fetchone()) == {
        "batch_id", "programme_id", "rows", "max_dob_cluster", "longest_apaar_run", "minutes_before_deadline"}


def test_deadline_dump(client, dbconn):
    dbconn.execute("UPDATE academic_years SET deadline = now() + interval '1 hour'")
    dbconn.commit()
    upload(client, "inst-c", "C1.csv")
    dd = [f for f in client.get("/v1/anomalies", headers=login(client, "aicte")).json() if f["type"] == "DEADLINE_DUMP"]
    assert len(dd) == 1 and dd[0]["institution_id"] == "1-0000000003" and 0 < dd[0]["evidence"]["minutes_before_deadline"] <= 60


def test_inspection_queue_and_own_dqs(client):
    upload(client, "inst-a", "A1.csv")
    upload(client, "inst-b", "B1.csv")
    q = client.get("/v1/inspection-queue", headers=login(client, "aicte")).json()
    ids = [e["institution_id"] for e in q]
    assert "1-0000000004" not in ids                           # closed: not expected to submit
    assert q[0]["institution_id"] == "1-0000000003" and q[0]["dqs"] is None   # approved but nothing submitted -> first
    assert ids.index("1-0000000002") < ids.index("1-0000000001")   # B (rejects, excess, cases) above clean A
    b = next(e for e in q if e["institution_id"] == "1-0000000002")
    assert abs(sum(b["dqs"]["points"].values()) - b["dqs"]["score"]) < 0.1 and b["why"]
    assert b["risk"] == round((100 - b["dqs"]["score"]) * b["active"], 1)
    own = client.get("/v1/dqs", headers=login(client, "inst-b")).json()
    assert own["institution_id"] == "1-0000000002" and own["dqs"]["score"] == b["dqs"]["score"]
    assert client.get("/v1/dqs", headers=login(client, "inst-c")).json()["dqs"] is None
