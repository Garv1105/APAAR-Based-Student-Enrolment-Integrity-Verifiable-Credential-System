import math
import re
from dataclasses import dataclass, field
from datetime import date

from rapidfuzz import fuzz

from . import crypto
from .codes import severity
from .contracts import APAAR_REASONS, REQUIRED_COLUMNS

NAME_MATCH_THRESHOLD = 85
AGE_RANGE = (16, 35)


def issue(row_no: int, code: str, field_: str | None = None, detail: str = "") -> dict:
    return {"row_no": row_no, "code": code, "severity": severity(code), "field": field_,
            "params": {"field": field_ or "", "detail": detail}}


@dataclass
class Ctx:
    institution_id: str
    institution_status: str
    year: dict
    programmes: dict
    seat_categories: dict
    registry_lookup: callable
    own_active_bi: set = field(default_factory=set)
    other_active_bi: set = field(default_factory=set)
    own_active_student_ids: set = field(default_factory=set)
    counters: dict = field(default_factory=dict)


def student_id_key(sid: str) -> str:
    return " ".join(sid.split()).casefold()


def caps_for(intake: int, seat_categories: dict) -> dict:
    caps = {}
    for code, cat in seat_categories.items():
        rule = cat["cap_rule_json"]
        if rule["type"] == "approved_intake":
            caps[code] = intake
        elif rule["type"] == "pct_of_intake":
            caps[code] = math.floor(intake * rule["pct"] / 100)
            for sub, s in rule.get("sub_caps", {}).items():
                n, d = s["fraction_of_cap"]
                caps[f"{code}:{sub}"] = math.floor(caps[code] * n / d)
        else:
            raise ValueError(f"unknown cap rule {rule['type']}")
    return caps


def counter_keys(row: dict, seat_categories: dict) -> list[str]:
    code = row["seat_category"]
    subs = seat_categories[code]["cap_rule_json"].get("sub_caps", {})
    return [code] + [f"{code}:{s}" for s, rule in subs.items() if row[rule["flag"]]]


_TRUE, _FALSE = {"y", "yes", "true", "1"}, {"n", "no", "false", "0", ""}


def _bool(v):
    if isinstance(v, bool):
        return v
    s = str(v if v is not None else "").strip().lower()
    if s in _TRUE:
        return True
    if s in _FALSE:
        return False
    raise ValueError(f"expected Y/N, got '{v}'")


def _date(v):
    if isinstance(v, date):
        return v
    return date.fromisoformat(str(v).strip())


def _int(v):
    return v if isinstance(v, int) else int(str(v).strip())


def _str(v):
    return "" if v is None else str(v).strip()


PARSERS = {
    "dob": _date, "admission_date": _date, "year_of_study": _int,
    "is_supernumerary": _bool, "is_lateral_entry": _bool,
    "is_nri": _bool, "is_oci": _bool, "is_fn": _bool, "is_ciwg": _bool,
}


def missing_columns(header: list[str]) -> list[str]:
    return [c for c in REQUIRED_COLUMNS if c not in header]


def parse_row(row_no: int, raw: dict) -> tuple[dict | None, list[dict]]:
    out, issues = {}, []
    for col in REQUIRED_COLUMNS:
        if col not in PARSERS and col != "institution_student_id" and not _str(raw.get(col)):
            issues.append(issue(row_no, "E001", col, "required"))
    for col, fn in PARSERS.items():
        try:
            out[col] = fn(raw.get(col))
        except (ValueError, TypeError) as e:
            issues.append(issue(row_no, "E001", col, str(e)))
    for col in ("apaar_id", "apaar_reason", "institution_student_id", "student_name",
                "guardian_name", "programme_code", "academic_year", "seat_category"):
        out[col] = _str(raw.get(col))
    out["apaar_reason"] = out["apaar_reason"].upper()
    di = _str(raw.get("declared_intake"))
    try:
        out["declared_intake"] = int(di) if di else None
    except ValueError:
        issues.append(issue(row_no, "E001", "declared_intake", f"not a number: '{di}'"))
    return (None if issues else out), issues


def _age(dob: date, on: date) -> int:
    return on.year - dob.year - ((on.month, on.day) < (dob.month, dob.day))


def validate_batch(rows: list[dict], ctx: Ctx) -> list[dict]:
    outcomes, seen, seen_sid, declared_flagged = [], {}, {}, set()
    for i, raw in enumerate(rows, start=1):
        data, issues = parse_row(i, raw)
        o = {"row_no": i, "data": data, "issues": issues, "accepted": False,
             "apaar_status": None, "programme_id": None, "counter_keys": []}
        outcomes.append(o)
        if data is None:
            continue

        sid = student_id_key(data["institution_student_id"])
        if not sid:
            issues.append(issue(i, "E105", "institution_student_id"))
        apaar, apaar_ok = data["apaar_id"], False
        if not apaar:
            if data["apaar_reason"] in APAAR_REASONS:
                issues.append(issue(i, "E101W", "apaar_id", data["apaar_reason"]))
                o["apaar_status"] = data["apaar_reason"]
            else:
                issues.append(issue(i, "E101", "apaar_id"))
        elif not re.fullmatch(r"\d{12}", apaar):
            issues.append(issue(i, "E102", "apaar_id"))
        else:
            apaar_ok = True

        prog = ctx.programmes.get(data["programme_code"])
        if ctx.institution_status != "approved":
            issues.append(issue(i, "E304", "institution", f"Institution status is '{ctx.institution_status}', not approved"))
        elif prog is None or data["academic_year"] != ctx.year["code"] or prog.get("approved_intake") is None:
            issues.append(issue(i, "E304", "programme_code",
                                f"Programme '{data['programme_code']}' is not approved for {data['academic_year']} in the AICTE registry (MOCK)"))
            prog = None
        cat = ctx.seat_categories.get(data["seat_category"])
        if cat is None:
            issues.append(issue(i, "E001", "seat_category", f"unknown category '{data['seat_category']}'"))

        if apaar_ok:
            reg = ctx.registry_lookup(apaar)
            if reg is None:
                issues.append(issue(i, "E103", "apaar_id"))
                apaar_ok = False
            else:
                mism = []
                if fuzz.token_sort_ratio(crypto.normalise_name(reg["name"]), crypto.normalise_name(data["student_name"])) < NAME_MATCH_THRESHOLD:
                    mism.append("Name")
                if reg["dob"] != data["dob"].isoformat():
                    mism.append("Date of birth")
                if mism:
                    issues.append(issue(i, "E104", "student_name" if mism[0] == "Name" else "dob", " and ".join(mism)))
                o["apaar_status"] = "MISMATCH" if mism else "VERIFIED"

        status_flags = [k for k in ("is_nri", "is_oci", "is_fn") if data[k]]
        if len(status_flags) > 1:
            issues.append(issue(i, "E401", "category", f"{' and '.join(status_flags)} cannot both be true"))
        if data["is_ciwg"] and (data["is_oci"] or data["is_fn"]):
            issues.append(issue(i, "E401", "is_ciwg", "CIWG applies to children of Indian workers; cannot be combined with OCI/FN"))
        if cat is not None:
            if (cat["scope"] == "supernumerary") != data["is_supernumerary"]:
                issues.append(issue(i, "E401", "is_supernumerary", f"is_supernumerary does not match seat category {data['seat_category']}"))
            elig = cat["cap_rule_json"].get("eligible")
            if elig and not any(data[k] for k in elig):
                issues.append(issue(i, "E401", "seat_category", f"Seat category {data['seat_category']} needs one of {', '.join(elig)}"))
        age = _age(data["dob"], data["admission_date"])
        if not AGE_RANGE[0] <= age <= AGE_RANGE[1]:
            issues.append(issue(i, "E402", "dob", str(age)))
        if not ctx.year["window_start"] <= data["admission_date"] <= ctx.year["window_end"]:
            issues.append(issue(i, "E403", "admission_date", data["admission_date"].isoformat()))
        if data["is_lateral_entry"] and data["year_of_study"] != 2:
            issues.append(issue(i, "E404", "year_of_study", str(data["year_of_study"])))

        bi = crypto.apaar_bi(apaar) if apaar_ok else None
        key = ("a", bi) if bi else ("n", crypto.normalise_name(data["student_name"]), data["dob"].isoformat())
        if key in seen:
            issues.append(issue(i, "E201", "apaar_id", str(seen[key])))
        elif bi and bi in ctx.own_active_bi:
            issues.append(issue(i, "E202", "apaar_id"))
        if sid and sid in seen_sid:
            issues.append(issue(i, "E205", "institution_student_id", f"row {seen_sid[sid]} of this file"))
        elif sid and sid in ctx.own_active_student_ids:
            issues.append(issue(i, "E205", "institution_student_id", "an active enrolment at this institution"))
        if not any(x["severity"] == "error" for x in issues):
            seen.setdefault(key, i)
            seen_sid.setdefault(sid, i)

        if any(x["severity"] == "error" for x in issues):
            continue

        o["accepted"], o["programme_id"], o["bi"] = True, prog["id"], bi
        caps = caps_for(prog["approved_intake"], ctx.seat_categories)
        keys = o["counter_keys"] = counter_keys(data, ctx.seat_categories)
        for k in keys:
            ck = (prog["id"], k)
            ctx.counters[ck] = ctx.counters.get(ck, 0) + 1
            if ctx.counters[ck] > caps[k]:
                if cat["scope"] == "within_intake":
                    issues.append(issue(i, "E301", "seat_category", f"{ctx.counters[ck]}/{caps[k]}"))
                elif not any(x["code"] == "E302" for x in issues):
                    issues.append(issue(i, "E302", "seat_category", f"{k} ({ctx.counters[ck]}/{caps[k]})"))
        if data["declared_intake"] is not None and data["declared_intake"] != prog["approved_intake"] and prog["id"] not in declared_flagged:
            declared_flagged.add(prog["id"])
            issues.append(issue(i, "E303", "declared_intake", f"{data['declared_intake']} vs {prog['approved_intake']}"))

        if bi and bi in ctx.other_active_bi:
            issues.append(issue(i, "E203", "apaar_id"))
    return outcomes
