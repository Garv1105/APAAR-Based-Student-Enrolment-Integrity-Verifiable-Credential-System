import csv
import json
import re
import socket
import sys
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest

from app import crypto, webhooks
from conftest import login
from test_api import SYN, upload

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/erp_connector"))
import connector  # noqa: E402

PUBLIC_IP = "93.184.216.34"
ALL_EVENTS = sorted(webhooks.EVENTS)


@pytest.fixture
def dns(monkeypatch):
    real = socket.getaddrinfo

    def fake(host, port, *a, **k):
        if host.endswith(".example.test"):
            ip = "10.1.2.3" if host.startswith("private") else PUBLIC_IP
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, port))]
        return real(host, port, *a, **k)
    monkeypatch.setattr(socket, "getaddrinfo", fake)
    monkeypatch.setenv("WEBHOOK_ALLOW_LOCALHOST", "false")


class Sink:
    def __init__(self, status=204):
        self.status, self.reqs = status, []

    def __call__(self, request):
        self.reqs.append(request)
        return httpx.Response(self.status)

    def client(self):
        return httpx.Client(transport=httpx.MockTransport(self))


def register(client, user, url="https://hooks.example.test/in", events=ALL_EVENTS, key=None):
    h = login(client, user) | ({"Idempotency-Key": key} if key else {})
    return client.post("/v1/webhooks", json={"url": url, "events": events}, headers=h)


def headers_of(req):
    return {k.lower(): v for k, v in req.headers.items()}


def later(seconds):
    return datetime.now(timezone.utc) + timedelta(seconds=seconds)


def test_signature_roundtrip_matches_connector_and_rejects_tamper_stale_replay():
    secret, body, ts = crypto.webhook_secret(), b'{"id":"e1"}', 1_800_000_000
    sig = crypto.webhook_sign([secret], "msg_1", ts, body)
    h = {"webhook-id": "msg_1", "webhook-timestamp": str(ts), "webhook-signature": sig}
    assert crypto.webhook_verify(secret, "msg_1", ts, body, sig, now=ts)
    assert connector.verify(secret, h, body, now=ts) == (True, "ok")
    assert connector.verify(secret, h, body + b" ", now=ts) == (False, "bad signature")
    assert not crypto.webhook_verify(secret, "msg_1", ts, body + b" ", sig, now=ts)
    assert connector.verify(secret, h | {"webhook-id": "msg_2"}, body, now=ts) == (False, "bad signature")
    assert connector.verify(secret, h, body, now=ts + 301) == (False, "stale timestamp")
    assert not crypto.webhook_verify(secret, "msg_1", ts, body, sig, now=ts + 301)
    assert connector.verify(crypto.webhook_secret(), h, body, now=ts)[0] is False
    seen = set()
    assert connector.verify(secret, h, body, now=ts, seen=seen)[0]
    assert connector.verify(secret, h, body, now=ts, seen=seen) == (False, "replayed event id")
    old = crypto.webhook_secret()
    both = crypto.webhook_sign([secret, old], "msg_3", ts, body)
    for s in (secret, old):
        assert connector.verify(s, h | {"webhook-id": "msg_3", "webhook-signature": both}, body, now=ts)[0]


def test_ssrf_guard(client, dns, monkeypatch):
    for url in ["http://hooks.example.test/in", "https://10.0.0.1/x", "https://169.254.169.254/latest/meta-data",
                "https://[::1]/x", "https://[::ffff:10.0.0.1]/x", "https://localhost/x", "http://127.0.0.1:9/x",
                "https://private.example.test/x", "https://user:pw@hooks.example.test/x", "ftp://hooks.example.test/x",
                "https://224.0.0.1/x", "https://0.0.0.0/x"]:
        with pytest.raises(webhooks.UrlRejected):
            webhooks.resolve(url)
    assert register(client, "inst-a", "https://private.example.test/x").status_code == 422
    assert register(client, "inst-a", "https://hooks.example.test/in").status_code == 201
    monkeypatch.setenv("WEBHOOK_ALLOW_LOCALHOST", "true")
    assert webhooks.resolve("http://127.0.0.1:9/x")[1].is_loopback
    for url in ["http://hooks.example.test/in", "https://private.example.test/x", "https://10.0.0.1/x"]:
        with pytest.raises(webhooks.UrlRejected):
            webhooks.resolve(url)


def test_delivery_connects_to_validated_ip_keeps_host_and_sni(client, dns):
    secret = register(client, "inst-a").json()["secret"]
    upload(client, "inst-a", "A1.csv")
    sink = Sink(204)
    assert webhooks.dispatch_due(later(1), sink.client()) == 1
    req = sink.reqs[0]
    h = headers_of(req)
    assert req.url.host == PUBLIC_IP and h["host"] == "hooks.example.test"
    assert req.extensions["sni_hostname"] == "hooks.example.test"
    assert connector.verify(secret, h, req.content, now=int(h["webhook-timestamp"]))[0]
    event = json.loads(req.content)
    assert event["type"] == "batch.validated" and event["data"]["counts"]["rows"] > 0
    d = client.get("/v1/webhooks/1/deliveries", headers=login(client, "inst-a")).json()["items"][0]
    assert d["status"] == "delivered" and d["attempts"] == 1 and d["last_status_code"] == 204


def test_retries_back_off_resign_each_attempt_then_fail_and_redeliver(client, dns):
    secret = register(client, "inst-a", events=["batch.validated"]).json()["secret"]
    upload(client, "inst-a", "A1.csv")
    sink, t = Sink(500), later(1)
    expected_gaps = webhooks.BACKOFF
    for attempt in range(len(expected_gaps) + 1):
        assert webhooks.dispatch_due(t, sink.client()) == 1
        assert webhooks.dispatch_due(t + timedelta(seconds=5), sink.client()) == 0
        h = headers_of(sink.reqs[-1])
        assert int(h["webhook-timestamp"]) == int(t.timestamp())
        assert connector.verify(secret, h, sink.reqs[-1].content, now=int(t.timestamp()))[0]
        if attempt < len(expected_gaps):
            t += timedelta(seconds=expected_gaps[attempt])
    assert len({headers_of(r)["webhook-id"] for r in sink.reqs}) == 1
    assert (t - later(1)).total_seconds() > 3600
    first = headers_of(sink.reqs[0])
    assert connector.verify(secret, first, sink.reqs[0].content, now=int(t.timestamp()))[1] == "stale timestamp"
    h = login(client, "inst-a")
    d = client.get("/v1/webhooks/1/deliveries", headers=h).json()["items"][0]
    assert d["status"] == "failed" and d["attempts"] == 6 and d["last_status_code"] == 500 and d["last_error"] == "HTTP 500"
    assert client.post(f"/v1/webhooks/deliveries/{d['id']}/redeliver", headers=h).json()["status"] == "pending"
    assert webhooks.dispatch_due(later(1), Sink(204).client()) == 1
    assert client.get("/v1/webhooks/1/deliveries", headers=h).json()["items"][0]["status"] == "delivered"


def _names():
    return {r["student_name"] for f in ("A1.csv", "B1.csv") for r in csv.DictReader(open(SYN / f, encoding="utf-8"))
            if r["student_name"]}


def test_events_are_emitted_neutral_and_pii_free(client, dbconn, dns):
    register(client, "inst-a")
    register(client, "inst-b")
    upload(client, "inst-a", "A1.csv")
    upload(client, "inst-b", "B1.csv")
    ev = lambda inst: [(r["event_type"], r["payload"]) for r in dbconn.execute(  # noqa: E731
        "SELECT d.event_type, d.payload FROM webhook_deliveries d JOIN webhook_endpoints w ON w.id=d.endpoint_id "
        "WHERE w.institution_id=%s ORDER BY d.id", (inst,))]
    b = ev("1-0000000002")
    opened = [p for t, p in b if t == "case.opened"]
    assert [t for t, _ in b].count("batch.validated") == 1 and len(opened) == 5
    assert all(set(p) == {"case_id"} for p in opened)
    assert sorted(p["case_id"] for t, p in ev("1-0000000001") if t == "case.opened") == sorted(p["case_id"] for p in opened)
    batch = next(p for t, p in b if t == "batch.validated")
    assert batch["codes"]["E203"] >= 5 and batch["counts"]["rows"] == 208

    ha, hb, ho = login(client, "inst-a"), login(client, "inst-b"), login(client, "aicte")
    case = client.get("/v1/cases", headers=ho).json()[0]
    inst_of = {e: dbconn.execute("SELECT p.institution_id i FROM enrolments e JOIN programmes p ON p.id=e.programme_id WHERE e.id=%s",
                                 (e,)).fetchone()["i"] for e in case["enrolment_ids"]}
    a_e = next(e for e, i in inst_of.items() if i == "1-0000000001")
    b_e = next(e for e, i in inst_of.items() if i == "1-0000000002")
    cred = client.post(f"/v1/credentials/{b_e}/issue", json={"type": "EnrolmentCredential"}, headers=hb).json()["id"]
    assert client.post(f"/v1/cases/{case['id']}/resolve", json={"status": "confirmed_duplicate", "note": "B later",
                                                                "keep_enrolment_id": a_e}, headers=ho).status_code == 200
    b = ev("1-0000000002")
    assert ("credential.issued", {"credential_id": cred, "type": "EnrolmentCredential", "enrolment_id": b_e}) in b
    assert ("credential.revoked", {"credential_id": cred, "enrolment_id": b_e, "reason": "confirmed_duplicate"}) in b
    assert ("case.resolved", {"case_id": case["id"], "status": "confirmed_duplicate"}) in b
    assert ("case.resolved", {"case_id": case["id"], "status": "confirmed_duplicate"}) in ev("1-0000000001")

    a2 = client.post(f"/v1/credentials/{a_e}/issue", json={"type": "EnrolmentCredential"}, headers=ha).json()["id"]
    client.patch(f"/v1/enrolments/{a_e}", json={"status": "withdrawn", "reason": "left"}, headers=ha)
    assert ("credential.revoked", {"credential_id": a2, "enrolment_id": a_e, "reason": "withdrawn"}) in ev("1-0000000001")

    names = _names()
    for row in dbconn.execute("SELECT payload FROM webhook_deliveries"):
        text = json.dumps(row["payload"])
        assert not re.search(r"\d{12}", text) and not re.search(r"\d{4}-\d{2}-\d{2}", text), text
        assert not any(n in text for n in names), text


def test_endpoint_management_limits_rotation_and_isolation(client, dbconn, dns):
    h, hb = login(client, "inst-a"), login(client, "inst-b")
    first = register(client, "inst-a", key="k1").json()
    again = register(client, "inst-a", key="k1").json()
    assert again["id"] == first["id"] and again["secret"] == first["secret"]
    assert register(client, "inst-a", url="https://hooks.example.test/other", key="k1").status_code == 422
    for i in range(4):
        assert register(client, "inst-a", url=f"https://hooks.example.test/{i}").status_code == 201
    assert register(client, "inst-a", url="https://hooks.example.test/6").status_code == 409
    listed = client.get("/v1/webhooks", headers=h)
    assert len(listed.json()) == 5 and first["secret"] not in listed.text and "secret_enc" not in listed.text
    assert client.get("/v1/webhooks", headers=hb).json() == []

    wid = first["id"]
    for method, path in [("DELETE", f"/v1/webhooks/{wid}"), ("POST", f"/v1/webhooks/{wid}/rotate"),
                         ("GET", f"/v1/webhooks/{wid}/deliveries")]:
        assert client.request(method, path, headers=hb).status_code == 404

    rot = client.post(f"/v1/webhooks/{wid}/rotate", headers=h).json()
    assert rot["secret"] != first["secret"] and rot["previous_secret_valid_until"]
    upload(client, "inst-a", "A1.csv")
    sink = Sink(204)
    webhooks.dispatch_due(later(1), sink.client())
    req = next(r for r in sink.reqs if r.url.path == "/in")
    hh = headers_of(req)
    assert len(hh["webhook-signature"].split()) == 2
    for s in (first["secret"], rot["secret"]):
        assert connector.verify(s, hh, req.content, now=int(hh["webhook-timestamp"]))[0]
    dbconn.execute("UPDATE webhook_endpoints SET prev_expires_at = now() - interval '1 second' WHERE id=%s", (wid,))
    dbconn.execute("UPDATE webhook_deliveries SET status='pending' WHERE endpoint_id=%s", (wid,))
    dbconn.commit()
    sink2 = Sink(204)
    webhooks.dispatch_due(later(1), sink2.client())
    assert len(headers_of(sink2.reqs[0])["webhook-signature"].split()) == 1

    did = dbconn.execute("SELECT id FROM webhook_deliveries WHERE endpoint_id=%s LIMIT 1", (wid,)).fetchone()["id"]
    assert client.post(f"/v1/webhooks/deliveries/{did}/redeliver", headers=hb).status_code == 404
    assert client.post(f"/v1/webhooks/deliveries/{did}/redeliver", headers=h).status_code == 200
    assert client.delete(f"/v1/webhooks/{wid}", headers=h).json()["active"] is False
    assert {r["status"] for r in dbconn.execute("SELECT status FROM webhook_deliveries WHERE endpoint_id=%s", (wid,))} == {"cancelled"}
    assert client.post(f"/v1/webhooks/deliveries/{did}/redeliver", headers=h).status_code == 409
    assert register(client, "inst-a", url="https://hooks.example.test/6").status_code == 201
    actions = {r["action"] for r in dbconn.execute("SELECT action FROM audit_logs WHERE entity LIKE 'webhook%%'")}
    assert {"webhook.create", "webhook.rotate", "webhook.delete", "webhook.redeliver"} <= actions


def test_erp_connector_end_to_end(client, monkeypatch):
    monkeypatch.setenv("WEBHOOK_ALLOW_LOCALHOST", "true")
    got = []
    server = connector.make_server(0, "", on_event=lambda ok, why, ev: got.append((ok, why, ev)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        port = server.server_address[1]
        hook = register(client, "inst-a", url=f"http://127.0.0.1:{port}/hook", events=["batch.validated"]).json()
        verify = connector.verify
        monkeypatch.setattr(connector, "verify", lambda _s, *a, **k: verify(hook["secret"], *a, **k))
        ex = ROOT / "tools/erp_connector/example"
        out = connector.push(ex / "erp_export.csv", ex / "mapping.yaml", "", "inst-a", "demo", client=client)
        assert out["counts"]["rows"] == 25 and out["counts"]["accepted"] == 25 and not out["replayed"]
        assert connector.push(ex / "erp_export.csv", ex / "mapping.yaml", "", "inst-a", "demo", client=client)["replayed"]
        assert webhooks.dispatch_due() == 1
        assert got and got[0][0] is True and got[0][2]["type"] == "batch.validated"
        assert got[0][2]["data"]["batch_id"] == out["batch_id"]
    finally:
        server.shutdown()
