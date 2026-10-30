import csv
import json
import re
from itertools import combinations

import psycopg
import pytest

from app import crypto, db
from app.anomaly import network
from conftest import login
from test_api import SYN, upload

A, B = "1-0000000001", "1-0000000002"


def edge(a, b, act=0, hist=0, car=0):
    return {"inst_a": min(a, b), "inst_b": max(a, b), "active_shared": act, "historical_shared": hist, "carousel": car}


def complete(names, **kw):
    return [edge(a, b, **kw) for a, b in combinations(names, 2)]


def kinds(flags):
    return sorted({(f["type"], f["institution_id"]) for f in flags})


def test_union_find_components():
    assert network.components(list("abcdef"), [("a", "b"), ("b", "c"), ("d", "e")]) == [["a", "b", "c"], ["d", "e"], ["f"]]
    assert network.two_core(list("abcde"), [("a", "b"), ("b", "c"), ("c", "a"), ("c", "d"), ("d", "e")]) == {"a", "b", "c"}


def test_planted_ring_with_carousel_flags_all_four_colleges():
    ring = list("ABCD")
    out = network.analyse(complete(ring, act=1, hist=4, car=1), {n: 300 for n in ring})
    assert kinds(out["flags"]) == [("SHARED_STUDENT_RING", n) for n in ring]
    e = out["flags"][0]["evidence"]
    assert {"colleges", "density", "shared_students", "carousel", "shared_ratio", "has_cycle"} <= set(e)
    assert (e["colleges"], e["density"], e["shared_students"], e["carousel"], e["has_cycle"]) == (4, 1.0, 30, 6, True)
    assert out["flags"][0]["explanation"].startswith("4 colleges share 30 students; 6 moved in a loop between them")
    assert out["ring_of"] == {n: "R1" for n in ring}


def test_negative_controls_are_not_flagged():
    assert network.analyse([edge("A", "B", hist=2)], {"A": 100, "B": 100})["flags"] == []
    out = network.analyse([edge("A", "B", hist=1), edge("B", "C", hist=1)], {"A": 100, "B": 100, "C": 100})
    assert out["flags"] == [] and not any(e["kept"] for e in out["edges"])
    big = network.analyse(complete("XYZ", act=1, hist=4), {"X": 50_000, "Y": 50_000, "Z": 50_000})
    assert big["flags"] == [] and big["components"][0]["shared_ratio"] < network.RING_SHARED_RATIO


def test_seat_blocking_for_pairs_outside_rings():
    assert kinds(network.analyse([edge("A", "B", act=6)], {"A": 100, "B": 100})["flags"]) == [("SEAT_BLOCKING", "A"), ("SEAT_BLOCKING", "B")]
    assert network.analyse([edge("A", "B", act=4)], {"A": 100, "B": 100})["flags"] == []


def test_active_sharing_inside_a_ring_is_part_of_the_ring_flag():
    ring = list("ABCD")
    out = network.analyse(complete(ring, act=6), {n: 200 for n in ring})
    assert kinds(out["flags"]) == [("SHARED_STUDENT_RING", n) for n in ring]
    f = out["flags"][0]
    assert f["evidence"]["active_shared_inside"] == 36 and "36 of them are active at two of these colleges" in f["explanation"]


def test_ring_detection_uses_the_2_core_so_attached_chains_are_not_flagged():
    ring = list("ABCD")
    chain = [edge("D", "E", hist=6), edge("E", "F", hist=6), edge("F", "G", hist=6), edge("G", "H", hist=6)]
    out = network.analyse(complete(ring, act=3) + chain, {n: 100 for n in "ABCDEFGH"})
    assert kinds(out["flags"]) == [("SHARED_STUDENT_RING", n) for n in ring]
    assert all(e["kept"] for e in out["edges"][-4:])


def _conn(user):
    return db.app_connect(user)


def test_sql_edges_regulator_only_and_counts(client, dbconn):
    upload(client, "inst-a", "A1.csv")
    upload(client, "inst-b", "B1.csv")
    with _conn({"role": "aicte_officer", "id": "aicte"}) as c:
        rows = c.execute("SELECT * FROM shared_student_edges('2026-27')").fetchall()
    assert [(r["inst_a"], r["inst_b"], r["active_shared"]) for r in rows] == [(A, B, 5)]
    with _conn({"role": "institution_admin", "institution_id": A, "id": "inst-a"}) as c:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("SELECT * FROM shared_student_edges('2026-27')")


def test_sql_counts_a_return_trip_as_carousel(client, dbconn):
    upload(client, "inst-a", "A1.csv")
    upload(client, "inst-b", "B1.csv")
    sid = dbconn.execute("SELECT id FROM students WHERE apaar_bi=%s", (crypto.apaar_bi("590573056992"),)).fetchone()["id"]
    ens = {r["institution_id"]: r for r in dbconn.execute(
        "SELECT e.*, p.institution_id FROM enrolments e JOIN programmes p ON p.id = e.programme_id WHERE e.student_id=%s", (sid,))}
    dbconn.execute("UPDATE enrolments SET admission_date='2026-07-01', status='migrated' WHERE id=%s", (ens[A]["id"],))
    dbconn.execute("UPDATE enrolments SET admission_date='2026-08-01', status='migrated' WHERE id=%s", (ens[B]["id"],))
    cols = [c for c in ens[A] if c not in ("id", "institution_id")]
    vals = {**{c: ens[A][c] for c in cols}, "admission_date": "2026-09-01", "status": "active",
            "institution_student_id": ens[A]["institution_student_id"] + "-R"}
    dbconn.execute(f"INSERT INTO enrolments ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))})", [vals[c] for c in cols])
    dbconn.commit()
    with _conn({"role": "auditor", "id": "auditor"}) as c:
        r = c.execute("SELECT * FROM shared_student_edges('2026-27')").fetchone()
    assert r["carousel"] == 1 and r["historical_shared"] >= 1


def test_network_endpoint_is_regulator_only_and_has_no_student_data(client):
    upload(client, "inst-a", "A1.csv")
    upload(client, "inst-b", "B1.csv")
    r = client.get("/v1/network", headers=login(client, "aicte"))
    assert r.status_code == 200, r.text
    out = r.json()
    assert [(e["inst_a"], e["inst_b"], e["active_shared"], e["kept"]) for e in out["edges"]] == [(A, B, 5, True)]
    assert kinds(out["flags"]) == [("SEAT_BLOCKING", A), ("SEAT_BLOCKING", B)]
    assert {n["id"] for n in out["nodes"] if n["connected"]} == {A, B} and "multi-year" in out["note"]
    names = {row["student_name"] for f in ("A1.csv", "B1.csv") for row in csv.DictReader(open(SYN / f, encoding="utf-8"))}
    text = json.dumps(out)
    assert not re.search(r"\d{12}", text) and not re.search(r"\d{4}-\d{2}-\d{2}", text) and not any(n in text for n in names if n)
    assert client.get("/v1/network", headers=login(client, "inst-a")).status_code == 403
    assert any(f["type"] == "SEAT_BLOCKING" for f in client.get("/v1/anomalies", headers=login(client, "aicte")).json())
    own = {f["type"] for f in client.get("/v1/dqs", headers=login(client, "inst-a")).json()["flags"]}
    assert not own & {"PEER_OUTLIER", "SHARED_STUDENT_RING", "SEAT_BLOCKING"}
    assert dbconn_has_audit(client)


def dbconn_has_audit(client):
    from app import db as _db
    with _db.connect() as c:
        return c.execute("SELECT count(*) n FROM audit_logs WHERE action = 'network.read'").fetchone()["n"] >= 1
