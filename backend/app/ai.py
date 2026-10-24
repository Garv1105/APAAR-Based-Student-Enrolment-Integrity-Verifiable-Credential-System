"""Gemini explainer: the ONLY module that talks to an LLM (CLAUDE.md rule).

- Advisory only: it puts numbers the deterministic code already produced into plain words. It never decides validity,
  seat limits, duplicates or rankings.
- Free tier (owner's decision): Google may use free-tier prompts, so inputs are built here from an allow-list of
  aggregates (codes, counts, percentages, labels). Never names, DOB, APAAR IDs, guardian names or row contents.
- No key, a timeout, an error or the free-tier rate limit -> the rule-based summary below, so every page still works.
- Answers are cached per input for CACHE_TTL to save the free quota; callers audit every request.
"""
import json
import threading
import time

import httpx

from . import crypto, db

DEFAULT_MODEL = "gemini-3.5-flash-lite"
URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
TIMEOUT = 12.0
CACHE_TTL = 6 * 3600
SYSTEM = ("You explain data-quality findings on India's AICTE student-enrolment platform to busy officials. "
          "Use ONLY the facts given as JSON; never invent numbers, names or causes. You do not decide anything: describe what to "
          "check, not who is guilty. Warning signs are not proof of wrongdoing. Plain English, short sentences, no markdown "
          "headings or tables, no greeting.")
LABEL_AI = "AI-generated summary (Gemini). Advisory only: check the numbers above before acting."
LABEL_RULES = "Automatic summary from the platform's own rules."

_cache: dict[str, tuple[float, str]] = {}
_lock = threading.Lock()


def model() -> str:
    return db._env("GEMINI_MODEL") or DEFAULT_MODEL


def enabled() -> bool:
    return bool(db._env("GEMINI_API_KEY"))


def _call(facts: dict, task: str) -> str | None:
    """One generateContent call; None on any failure (the caller falls back to rules)."""
    body = {"systemInstruction": {"parts": [{"text": SYSTEM}]},
            "contents": [{"role": "user", "parts": [{"text": f"{task}\n\nFacts (JSON):\n{json.dumps(facts, ensure_ascii=False)}"}]}],
            "generationConfig": {"temperature": 0.2, "maxOutputTokens": 400}}
    try:
        r = httpx.post(URL.format(model=model()), json=body, timeout=TIMEOUT,
                       headers={"x-goog-api-key": db._env("GEMINI_API_KEY") or ""})  # header, so the key never sits in a URL
        if r.status_code != 200:
            return None
        parts = r.json()["candidates"][0]["content"]["parts"]
        text = "".join(p.get("text", "") for p in parts).strip()
        return text or None
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        return None


def generate(purpose: str, facts: dict, task: str, fallback: str) -> dict:
    """{text, source: gemini|rules, model, cached, label}. `facts` must come from the allow-listed builders below."""
    key = crypto.sha256_hex(json.dumps([purpose, model(), facts], sort_keys=True).encode())
    with _lock:
        hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_TTL:
        return {"text": hit[1], "source": "gemini", "model": model(), "cached": True, "label": LABEL_AI}
    text = _call(facts, task) if enabled() else None
    if text is None:
        return {"text": fallback, "source": "rules", "model": None, "cached": False, "label": LABEL_RULES}
    with _lock:
        if len(_cache) > 2000:  # ponytail: simple bound; per instance, so serverless copies each keep their own
            _cache.clear()
        _cache[key] = (time.time(), text)
    return {"text": text, "source": "gemini", "model": model(), "cached": False, "label": LABEL_AI}


# ---------- allow-listed fact builders (the only inputs that may reach the model) ----------
def _pct(v: float) -> int:
    return round(v * 100)


def institution_facts(entry: dict, priority: str) -> dict:
    """From an inspection-queue entry: score parts, warning-sign kinds and the rules' own explanation lines."""
    d = entry.get("dqs") or {}
    return {
        "priority": priority,
        "students_enrolled": entry.get("active", 0),
        "data_quality_score": round(d["score"]) if d else None,
        "score_parts_percent": {k.replace("_", " "): _pct(v) for k, v in (d.get("components") or {}).items()},
        "warning_signs": [{"kind": f["type"].replace("_", " ").lower(), "programme": f.get("programme"),
                           "finding": f.get("explanation", "")[:200]} for f in entry.get("flags", [])][:12],
    }


def institution_fallback(facts: dict) -> str:
    if facts["data_quality_score"] is None:
        return "This approved college has not uploaded any student records this year. Follow up before the deadline."
    weak = sorted(facts["score_parts_percent"].items(), key=lambda kv: kv[1])[:2]
    parts = [f"{facts['priority']} priority: data quality {facts['data_quality_score']}/100 across "
             f"{facts['students_enrolled']:,} students."]
    if weak and weak[0][1] < 90:
        parts.append("Weakest areas: " + ", ".join(f"{k} {v}%" for k, v in weak) + ".")
    if facts["warning_signs"]:
        parts.append(f"{len(facts['warning_signs'])} warning sign(s): " + "; ".join(w["finding"] for w in facts["warning_signs"][:3]) + ".")
    parts.append("Check these on the inspection visit; warning signs are not proof of wrongdoing.")
    return " ".join(parts)


def upload_facts(counts: dict, issues: list[dict]) -> dict:
    """From a batch: counts plus one line per problem type (code, title, fix hint, rows, columns). No row contents."""
    groups: dict[str, dict] = {}
    for i in issues:
        g = groups.setdefault(i["code"], {"code": i["code"], "problem": i["title"], "severity": i["severity"],
                                          "how_to_fix": i["fix_hint"], "rows": set(), "columns": set()})
        g["rows"].add(i["row_no"])
        if i.get("field"):
            g["columns"].add(i["field"])
    order = {"error": 0, "warning": 1, "flag": 2}
    types = sorted(groups.values(), key=lambda g: (order.get(g["severity"], 3), -len(g["rows"])))
    return {"rows_uploaded": counts.get("rows", 0), "rows_saved": counts.get("accepted", 0), "rows_rejected": counts.get("rejected", 0),
            "rows_saved_with_warning": counts.get("warnings", 0), "rows_sent_to_aicte": counts.get("flags", 0),
            "problem_types": [{"code": g["code"], "problem": g["problem"], "severity": g["severity"], "rows_affected": len(g["rows"]),
                               "columns": sorted(g["columns"]), "how_to_fix": g["how_to_fix"]} for g in types][:20]}


def upload_fallback(facts: dict) -> str:
    if not facts["problem_types"]:
        return f"All {facts['rows_uploaded']} rows were saved. Nothing to fix."
    lines = [f"{facts['rows_saved']} of {facts['rows_uploaded']} rows were saved; {facts['rows_rejected']} were rejected. Fix in this order:"]
    for n, p in enumerate(facts["problem_types"][:5], 1):
        lines.append(f"{n}. {p['problem']} ({p['rows_affected']} rows): {p['how_to_fix']}")
    return "\n".join(lines)
