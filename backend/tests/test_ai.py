"""T-AI: Gemini explainer. Advisory, allow-listed aggregates only, rule-based fallback, cached, audited."""
import csv
import json
import re
from pathlib import Path

import httpx

from app import ai
from conftest import login
from test_api import upload

SYN = Path(__file__).resolve().parent.parent / "data/synthetic"
REAL_CALL = ai._call  # captured at import, before the conftest stub replaces it per test


def _capture(monkeypatch, reply="AI SUMMARY"):
    seen = []
    monkeypatch.setattr(ai, "enabled", lambda: True)
    monkeypatch.setattr(ai, "_call", lambda facts, task: (seen.append(json.dumps(facts)), reply)[1])
    return seen


def test_upload_summary_falls_back_to_rules_without_a_key(client, monkeypatch):
    monkeypatch.setattr(ai, "enabled", lambda: False)
    bid = upload(client, "inst-b", "B1.csv").json()["batch_id"]
    r = client.post(f"/v1/ai/upload-summary/{bid}", headers=login(client, "inst-b"))
    assert r.status_code == 200 and r.json()["source"] == "rules" and "Fix in this order" in r.json()["text"]


def test_upload_summary_sends_no_personal_data_and_is_cached(client, dbconn, monkeypatch):
    seen = _capture(monkeypatch)
    bid = upload(client, "inst-b", "B1.csv").json()["batch_id"]
    h = login(client, "inst-b")
    r1, r2 = client.post(f"/v1/ai/upload-summary/{bid}", headers=h), client.post(f"/v1/ai/upload-summary/{bid}", headers=h)
    assert r1.json()["source"] == "gemini" and r1.json()["text"] == "AI SUMMARY" and not r1.json()["cached"]
    assert r2.json()["cached"] and len(seen) == 1                                   # second answer from the cache
    sent = seen[0]
    rows = list(csv.DictReader(open(SYN / "B1.csv", encoding="utf-8")))
    assert not re.search(r"\d{12}", sent)                                           # no APAAR IDs
    for r in rows:                                                                  # no names, guardians, DOBs, student IDs
        for f in ("student_name", "guardian_name", "dob", "institution_student_id"):
            if r.get(f):
                assert r[f] not in sent, f
    assert "problem_types" in sent and "how_to_fix" in sent
    acts = [a["reason"] for a in dbconn.execute("SELECT reason FROM audit_logs WHERE action='ai.upload_summary'")]
    assert acts == ["gemini", "gemini"]


def test_explain_institution_regulators_only(client, monkeypatch):
    upload(client, "inst-c", "C1.csv")
    r = client.post("/v1/ai/explain-institution/1-0000000003", headers=login(client, "aicte"))
    assert r.status_code == 200 and r.json()["source"] == "rules" and "/100" in r.json()["text"]
    seen = _capture(monkeypatch, "Briefing")
    r = client.post("/v1/ai/explain-institution/1-0000000003", headers=login(client, "auditor"))
    assert r.json() == {"text": "Briefing", "source": "gemini", "model": ai.model(), "cached": False, "label": ai.LABEL_AI}
    facts = json.loads(seen[0])
    assert set(facts) == {"priority", "students_enrolled", "data_quality_score", "score_parts_percent", "warning_signs"}
    assert client.post("/v1/ai/explain-institution/9-nope", headers=login(client, "aicte")).status_code == 404


def test_gemini_call_uses_header_key_and_survives_errors(monkeypatch):
    sent = {}

    def fake_post(url, json, timeout, headers):
        sent.update(url=url, headers=headers, body=json)
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "Hello "}, {"text": "there"}]}}]})
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-123")
    monkeypatch.setattr(httpx, "post", fake_post)
    assert REAL_CALL({"a": 1}, "task") == "Hello there"
    assert "test-key-123" not in sent["url"] and sent["headers"]["x-goog-api-key"] == "test-key-123"
    assert sent["body"]["generationConfig"]["temperature"] <= 0.3
    monkeypatch.setattr(httpx, "post", lambda *a, **k: httpx.Response(429, json={}))
    assert REAL_CALL({"a": 1}, "task") is None                                       # free-tier limit -> fallback

    def boom(*a, **k):
        raise httpx.ConnectTimeout("slow")
    monkeypatch.setattr(httpx, "post", boom)
    assert REAL_CALL({"a": 1}, "task") is None
