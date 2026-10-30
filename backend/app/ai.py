import json
import re
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
LANGS = {"en": "English", "hi": "Hindi", "bn": "Bengali", "mr": "Marathi", "te": "Telugu", "ta": "Tamil", "gu": "Gujarati",
         "kn": "Kannada", "ml": "Malayalam", "or": "Odia", "pa": "Punjabi", "as": "Assamese", "ur": "Urdu"}
SCRIPTS = {"hi": "Devanagari", "bn": "Bengali", "mr": "Devanagari", "te": "Telugu", "ta": "Tamil", "gu": "Gujarati", "kn": "Kannada",
           "ml": "Malayalam", "or": "Odia", "pa": "Gurmukhi", "as": "Assamese (Bengali-Assamese)", "ur": "Perso-Arabic (Nastaliq)"}

_cache: dict[str, tuple[float, str]] = {}
_lock = threading.Lock()


def model() -> str:
    return db._env("GEMINI_MODEL") or DEFAULT_MODEL


def enabled() -> bool:
    return bool(db._env("GEMINI_API_KEY"))


def _call(facts: dict, task: str, json_out: bool = False, max_tokens: int = 400) -> str | None:
    config = {"temperature": 0.2, "maxOutputTokens": max_tokens} | ({"responseMimeType": "application/json"} if json_out else {})
    body = {"systemInstruction": {"parts": [{"text": SYSTEM}]},
            "contents": [{"role": "user", "parts": [{"text": f"{task}\n\nFacts (JSON):\n{json.dumps(facts, ensure_ascii=False)}"}]}],
            "generationConfig": config}
    try:
        r = httpx.post(URL.format(model=model()), json=body, timeout=TIMEOUT,
                       headers={"x-goog-api-key": db._env("GEMINI_API_KEY") or ""})
        if r.status_code != 200:
            return None
        parts = r.json()["candidates"][0]["content"]["parts"]
        text = "".join(p.get("text", "") for p in parts).strip()
        return text or None
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        return None


def generate(purpose: str, facts: dict, task: str, fallback: str, max_tokens: int = 400, lang: str = "en") -> dict:
    if lang != "en":
        task += (f" Write the whole answer in {LANGS[lang]} using its native {SCRIPTS[lang]} script, never in Latin letters; keep "
                 "numbers, codes and the words APAAR and AICTE as they are.")
        max_tokens = int(max_tokens * 1.8)
    key = crypto.sha256_hex(json.dumps([purpose, model(), lang, facts], sort_keys=True).encode())
    with _lock:
        hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_TTL:
        return {"text": hit[1], "source": "gemini", "model": model(), "cached": True, "label": LABEL_AI}
    text = _call(facts, task, max_tokens=max_tokens) if enabled() else None
    if text is None:
        return {"text": fallback, "source": "rules", "model": None, "cached": False, "label": LABEL_RULES}
    with _lock:
        if len(_cache) > 2000:
            _cache.clear()
        _cache[key] = (time.time(), text)
    return {"text": text, "source": "gemini", "model": model(), "cached": False, "label": LABEL_AI}


def _pct(v: float) -> int:
    return round(v * 100)


def institution_facts(entry: dict, priority: str) -> dict:
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


def note_facts(entry: dict, priority: str) -> dict:
    facts = institution_facts(entry, priority)
    facts["officer_decisions"] = [{"kind": f["type"].replace("_", " ").lower(), "decision": str((f.get("review") or {}).get("decision"))}
                                  for f in entry.get("flags", []) if f.get("review")][:12]
    return facts


def note_fallback(facts: dict) -> str:
    signs = facts["warning_signs"]
    return "\n".join([
        "Purpose of visit",
        f"Verify enrolment records ({facts['students_enrolled']:,} students; data quality {facts['data_quality_score']}/100; "
        f"{facts['priority']} priority).",
        "", "Findings to verify",
        *([f"- {w['finding']}" for w in signs[:5]] or ["- No warning signs; check a sample of admissions."]),
        "", "Records to request",
        "- Admission register and fee receipts for the programmes above", "- Attendance records for the current term",
        "", "Questions for the principal",
        "- How were admissions over the approved limit (if any) decided?", "- Why were records uploaded close to the deadline (if so)?",
    ])


ALIASES = {
    "apaar_id": ["apaar", "apaar no", "apaar number", "apaar id no", "abc id"],
    "apaar_reason": ["reason", "apaar status", "no apaar reason"],
    "institution_student_id": ["roll no", "roll number", "enrolment no", "enrollment no", "registration no", "student id", "reg no"],
    "student_name": ["name", "student", "name of student", "full name", "candidate name"],
    "dob": ["date of birth", "birth date", "d o b", "birthdate"],
    "guardian_name": ["father name", "parent name", "guardian", "fathers name"],
    "programme_code": ["programme", "program", "course", "branch", "course code", "branch code"],
    "academic_year": ["session", "academic session", "batch year"],
    "year_of_study": ["year", "current year", "study year", "class"],
    "seat_category": ["category", "quota", "seat type"],
    "is_supernumerary": ["supernumerary"], "is_lateral_entry": ["lateral", "lateral entry"], "is_nri": ["nri"], "is_oci": ["oci"],
    "is_fn": ["foreign national", "fn"], "is_ciwg": ["ciwg"],
    "admission_date": ["date of admission", "admitted on", "doa"],
    "declared_intake": ["intake", "sanctioned intake", "approved intake"],
}
DATA_LIKE = re.compile(r"\d{5,}|\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}|@")


def looks_like_data(header: str) -> bool:
    return len(header) > 60 or bool(DATA_LIKE.search(header))


def _norm(h: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", h.lower()).strip()


def rule_mapping(headers: list[str], columns: list[str]) -> dict[str, str | None]:
    from rapidfuzz import fuzz, process
    choices = {c: [c.replace("_", " ")] + ALIASES.get(c, []) for c in columns}
    out: dict[str, str | None] = {}
    used: set[str] = set()
    for h in headers:
        n = _norm(h)
        best = next((c for c in columns if c not in used and n in choices[c]), None)
        if best is None:
            flat = [(alias, c) for c, names in choices.items() if c not in used for alias in names]
            m = process.extractOne(n, [x for x, _ in flat], scorer=fuzz.token_sort_ratio, score_cutoff=80)
            best = flat[m[2]][1] if m else None
        out[h] = best
        if best:
            used.add(best)
    return out


def map_columns(headers: list[str], columns: list[str]) -> dict:
    rules = rule_mapping(headers, columns)
    raw = _call({"their_headers": headers, "template_columns": columns},
                "Match each of their_headers to at most one of template_columns, or null if none fits. "
                "Reply ONLY with a JSON object {their_header: template_column_or_null}.", json_out=True) if enabled() else None
    try:
        suggested = json.loads(raw) if raw else None
    except ValueError:
        suggested = None
    if not isinstance(suggested, dict):
        return {"mapping": rules, "source": "rules", "label": LABEL_RULES}
    out: dict[str, str | None] = {}
    used: set[str] = set()
    for h in headers:
        c = suggested.get(h)
        if c not in columns or c in used:
            c = rules.get(h) if rules.get(h) not in used else None
        out[h] = c
        if c:
            used.add(c)
    return {"mapping": out, "source": "gemini", "label": "Suggested by Gemini (AI). Check each match before uploading."}


def translate_catalogue(entries: dict, language: str) -> dict | None:
    raw = _call({"messages": entries},
                f"Translate every title, template and fix_hint into {language}, written in its native script (never Latin letters), "
                "for college data officers. Keep exactly unchanged: "
                "the {field} and {detail} placeholders, column names with underscores, codes in capitals (e.g. REFUSED, SN_FN_OCI_CIWG), "
                "formats like YYYY-MM-DD, the letters Y and N, and the words APAAR, AICTE, DigiLocker, MOCK. "
                "Reply ONLY with JSON in the same shape.", json_out=True, max_tokens=8000)
    try:
        out = json.loads(raw) if raw else None
    except ValueError:
        return None
    if isinstance(out, dict) and set(out) == {"messages"}:
        out = out["messages"]
    return out if isinstance(out, dict) else None


def report_facts(kind: str, header: list[str], rows: list[dict], ledger_status: dict) -> dict:
    if kind == "state-summary":
        keep = ("state", "institutions", "approved_intake", "active_enrolments", "fill_pct", "excess_seats", "open_duplicate_cases",
                "apaar_coverage_pct")
        return {"report": "state summary", "states": [{k: r.get(k) for k in keep} for r in rows][:40]}
    if kind == "category-utilisation":
        by: dict[str, dict] = {}
        for r in rows:
            if ":" in r["category_code"]:
                continue
            t = by.setdefault(r["category_code"], {"category": r["category_code"], "cap": 0, "filled": 0, "programmes_over_cap": 0})
            t["cap"] += r["cap"] or 0
            t["filled"] += r["filled"] or 0
            t["programmes_over_cap"] += 1 if (r["excess"] or 0) > 0 else 0
        top = sorted((r for r in rows if (r["excess"] or 0) > 0), key=lambda r: -r["excess"])[:10]
        return {"report": "category-quota utilisation", "by_category": list(by.values()),
                "largest_overshoots": [{"institution": r["institution"], "state": r["state"], "programme": r["programme_code"],
                                        "category": r["category_code"], "filled": r["filled"], "cap": r["cap"]} for r in top]}
    if kind == "excess-case-file":
        per: dict[str, dict] = {}
        for r in rows:
            t = per.setdefault(r["institution_id"], {"institution": r["institution"], "state": r["state"], "over_cap_rows": 0,
                                                     "still_over_cap": r["current_over_cap"] != "none (resolved since upload)"})
            t["over_cap_rows"] += 1
        worst = sorted(per.values(), key=lambda t: -t["over_cap_rows"])
        return {"report": "excess-admission case file", "over_cap_rows": len(rows), "institutions": len(per),
                "still_over_cap": sum(t["still_over_cap"] for t in per.values()), "worst_institutions": worst[:12],
                "ledger_consistent": ledger_status.get("ok")}
    return {"report": "seat ledger integrity", "consistent": ledger_status.get("ok"), "entries": ledger_status.get("entries"),
            "checkpoint_ok": ledger_status.get("checkpoint_ok"), "problems": len(ledger_status.get("problems") or [])}


def report_fallback(facts: dict) -> str:
    r = facts["report"]
    if r == "state summary":
        st = sorted(facts["states"], key=lambda s: -(s.get("excess_seats") or 0))
        worst = [s for s in st if s.get("excess_seats")][:3]
        return (f"{len(facts['states'])} states in the report. "
                + ("Most seats over the limit: " + ", ".join(f"{s['state']} (+{s['excess_seats']})" for s in worst) + "." if worst
                   else "No state has seats over the limit."))
    if r == "category-quota utilisation":
        return "By seat category: " + "; ".join(f"{c['category']}: {c['filled']:,} of {c['cap']:,} seats, {c['programmes_over_cap']} "
                                                   "programme(s) over cap" for c in facts["by_category"]) + "."
    if r == "excess-admission case file":
        return (f"{facts['over_cap_rows']} admissions over the limit at {facts['institutions']} institution(s); "
                f"{facts['still_over_cap']} are still over the limit. Seat ledger "
                + ("consistent." if facts["ledger_consistent"] else "NOT consistent: check before using this as evidence."))
    return (f"Seat ledger: {facts['entries']:,} entries, " + ("no tampering found." if facts["consistent"]
            else f"{facts['problems']} problem(s) found: investigate before relying on the numbers."))
