from datetime import datetime, timedelta, timezone

from app.anomaly import feedback, inspection_queue
from conftest import login
from test_api import upload

A, B, C = "1-0000000001", "1-0000000002", "1-0000000003"
T0 = datetime(2026, 10, 1, tzinfo=timezone.utc)


def review(key, rule, decision, reviewer="aicte", snapshot=None, minutes=0, i=0):
    return {"id": i, "flag_key": key, "rule": rule, "decision": decision, "reviewer": reviewer,
            "evidence_snapshot": snapshot or {}, "reviewed_at": T0 + timedelta(minutes=minutes)}


def spike(inst="X", z=8.0, fill=0.9):
    return {"type": "ENROLMENT_SPIKE", "institution_id": inst, "programme": "CSE", "score": z,
            "evidence": {"fill_ratio": fill, "robust_z": z}, "explanation": "fill spike"}


def test_precision_prior_interval_and_floor():
    assert feedback.precision(0, 0) == 0.5 and feedback.precision(9, 1) == 10 / 12
    lo, hi = feedback.beta_interval(1, 1)
    assert abs(lo - 0.05) < 0.005 and abs(hi - 0.95) < 0.005
    assert feedback.weight(0, 50) == feedback.WEIGHT_FLOOR == 0.25
    assert feedback.weight(9, 1) == 10 / 12


def test_dismissed_flag_hidden_until_primary_evidence_moves_20_percent():
    f = spike(fill=0.80)
    dis = review("k", "ENROLMENT_SPIKE", "dismissed", snapshot={"fill_ratio": 0.80, "robust_z": 6.0})
    assert feedback.suppressed(f, dis)
    assert feedback.suppressed(spike(fill=0.88, z=9.0), dis)
    assert not feedback.suppressed(spike(fill=1.00), dis)
    assert not feedback.suppressed(f, {**dis, "decision": "confirmed"})
    assert not feedback.suppressed(f, {**dis, "decision": "needs_info"})
    peer = {"type": "PEER_OUTLIER", "institution_id": "X", "programme": "CSE",
            "evidence": {"metric": "fill_growth", "value": 0.85, "peer_z": 20.0, "p_value": 1e-8}}
    snap = review("p", "PEER_OUTLIER", "dismissed", snapshot={"metric": "fill_growth", "value": 0.85, "peer_z": 12.6, "p_value": 1e-9})
    assert feedback.suppressed(peer, snap)


def test_re_dismissing_cannot_ratchet_the_baseline():
    rs = [review("k", "ENROLMENT_SPIKE", "dismissed", snapshot={"fill_ratio": 0.80}, i=1),
          review("k", "ENROLMENT_SPIKE", "dismissed", snapshot={"fill_ratio": 0.92}, minutes=5, i=2)]
    latest = feedback.latest_per_flag(rs)["k"]
    assert not feedback.suppressed(spike(fill=1.00), latest)
    rs.append(review("k", "ENROLMENT_SPIKE", "confirmed", minutes=6, i=3))
    rs.append(review("k", "ENROLMENT_SPIKE", "dismissed", snapshot={"fill_ratio": 0.95}, minutes=7, i=4))
    assert feedback.suppressed(spike(fill=1.00), feedback.latest_per_flag(rs)["k"])


def test_severity_is_comparable_across_rules():
    sev = feedback.severity
    assert sev(spike(z=5.5)) == sev({"type": "PEER_OUTLIER", "evidence": {"peer_z": 5.5}}) == 0.5
    mix = sev({"type": "CATEGORY_MIX_SHIFT", "evidence": {"share_now": 0.15, "share_history": 0.05}})
    ring = sev({"type": "SHARED_STUDENT_RING", "evidence": {"shared_ratio": 0.10}})
    assert abs(mix - ring) < 1e-9 and abs(mix - 0.5) < 1e-9
    counts = [sev({"type": "DOB_CLUSTER", "evidence": {"students_sharing_one_dob": 25}}),
              sev({"type": "SEAT_BLOCKING", "evidence": {"active_shared": 12}})]
    assert all(abs(c - 0.5) <= 0.15 for c in counts)
    assert sev(spike(z=3.5)) == sev({"type": "DOB_CLUSTER", "evidence": {"students_sharing_one_dob": 10}}) == 0.1
    assert sev(spike(z=40)) == 1.0


def _entries(flags_b):
    base = {"status": "approved", "active": 100, "flags": []}
    mk = lambda inst, score, fl=(): {**base, "institution_id": inst, "name": inst, "state": "KA",  # noqa: E731
                                     "dqs": {"score": score, "components": {}}, "flags": list(fl)}
    return [mk("A", 77), mk("B", 80, flags_b), mk("C", 74)]


def test_confirming_moves_a_college_up_and_dismissing_moves_it_down():
    f = spike("B", z=8.0)
    order = lambda q: [e["institution_id"] for e in q]  # noqa: E731
    assert order(inspection_queue(_entries([f]), {})) == ["C", "B", "A"]
    confirmed = feedback.rule_weights([review("k", "ENROLMENT_SPIKE", "confirmed")])
    assert order(inspection_queue(_entries([f]), confirmed)) == ["B", "C", "A"]
    assert order(inspection_queue(_entries([]), {})) == ["C", "A", "B"]


def test_rule_performance_and_reviewer_dismissal_rates():
    rs = [review("a", "DOB_CLUSTER", "confirmed", "r1", i=1), review("b", "DOB_CLUSTER", "dismissed", "r2", i=2),
          review("c", "DOB_CLUSTER", "dismissed", "r2", i=3), review("c", "DOB_CLUSTER", "confirmed", "r1", minutes=5, i=4)]
    perf = feedback.rule_performance(rs)
    dob = next(r for r in perf["rules"] if r["rule"] == "DOB_CLUSTER")
    assert (dob["confirmed"], dob["dismissed"]) == (2, 1)
    assert dob["precision"] == round(3 / 5, 3) and dob["interval"][0] < dob["precision"] < dob["interval"][1]
    assert {r["reviewer"]: r["dismissal_rate"] for r in perf["reviewers"]} == {"r1": 0.0, "r2": 1.0}
    assert len(perf["rules"]) == len(feedback.RULES)


def test_review_endpoint_dismiss_hides_from_queue_and_is_audited(client, dbconn):
    for user, f in (("inst-a", "A1.csv"), ("inst-b", "B1.csv"), ("inst-c", "C1.csv")):
        upload(client, user, f)
    ho = login(client, "aicte")
    flag = next(f for f in client.get("/v1/anomalies", headers=ho).json() if f["type"] == "ENROLMENT_SPIKE")
    assert flag["flag_key"] and flag["weight"] == 0.5 and flag["suppressed"] is False and 0 < flag["severity"] <= 1
    url = f"/v1/flags/{flag['flag_key']}/review"
    assert client.post(url, json={"decision": "dismissed", "reason": "short"}, headers=ho).status_code == 422
    for pii in ("student APAAR 123456789012 is fine", "DOB 12/03/2007 checked on site", "called parent on 98765 43210"):
        assert client.post(url, json={"decision": "dismissed", "reason": pii}, headers=ho).status_code == 422
    assert client.post("/v1/flags/nope/review", json={"decision": "dismissed", "reason": "no such flag here"}, headers=ho).status_code == 404
    body = {"decision": "dismissed", "reason": "New hostel opened; verified on site visit"}
    r = client.post(url, json=body, headers=ho | {"Idempotency-Key": "rv-1"})
    assert r.status_code == 201 and r.json()["decision"] == "dismissed"
    again = client.post(url, json=body, headers=ho | {"Idempotency-Key": "rv-1"})
    assert again.status_code == 200 and again.json()["replayed"] and again.json()["id"] == r.json()["id"]
    assert client.post(url, json={**body, "decision": "confirmed"}, headers=ho | {"Idempotency-Key": "rv-1"}).status_code == 422
    assert client.post(url, json=body, headers=login(client, "auditor")).status_code == 403
    queue = client.get("/v1/inspection-queue", headers=ho).json()
    c = next(e for e in queue if e["institution_id"] == C)
    assert not any(f["type"] == "ENROLMENT_SPIKE" for f in c["flags"])
    listed = next(f for f in client.get("/v1/anomalies", headers=ho).json() if f["flag_key"] == flag["flag_key"])
    assert listed["suppressed"] and listed["review"]["decision"] == "dismissed"
    logged = dbconn.execute("SELECT reason FROM audit_logs WHERE action = 'flag.dismissed' AND entity_id = %s",
                            (flag["flag_key"],)).fetchall()
    assert len(logged) == 1 and "hostel" not in logged[0]["reason"]
    perf = client.get("/v1/rules/performance", headers=login(client, "auditor")).json()
    spike_row = next(x for x in perf["rules"] if x["rule"] == "ENROLMENT_SPIKE")
    assert (spike_row["dismissed"], spike_row["precision"], spike_row["weight"]) == (1, round(1 / 3, 3), round(1 / 3, 3))
    assert perf["reviewers"] == [{"reviewer": "aicte", "reviews": 1, "dismissed": 1, "dismissal_rate": 1.0}]
    assert "Recall" in perf["note"] and perf["weight_floor"] == 0.25


def test_open_case_counts_against_the_later_enrolment_only(client):
    for user, f in (("inst-a", "A1.csv"), ("inst-b", "B1.csv"), ("inst-c", "C1.csv")):
        upload(client, user, f)
    queue = {e["institution_id"]: e for e in client.get("/v1/inspection-queue", headers=login(client, "aicte")).json()}
    assert queue[A]["dqs"]["components"]["duplicate_exposure"] == 1.0
    assert queue[B]["dqs"]["components"]["duplicate_exposure"] < 1.0
    assert queue[A]["rank"] > queue[C]["rank"]
    own_a = client.get("/v1/dqs", headers=login(client, "inst-a")).json()["dqs"]["components"]["duplicate_exposure"]
    assert own_a == 1.0
