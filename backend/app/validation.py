"""Deterministic validation + intake engine (PRD §9). Pure functions: no DB, no AI.

The DB layer supplies a Ctx (registry lookups, existing enrolment blind indexes and
current counters read under row lock) and persists the outcomes.
"""
import math
import re
from dataclasses import dataclass, field
from datetime import date

from rapidfuzz import fuzz

from . import crypto
from .contracts import APAAR_REASONS, REQUIRED_COLUMNS

CATALOGUE = {  # code: (name, severity, English template)
    "E001": ("SCHEMA_INVALID", "error", "Field '{field}' is missing or not valid: {detail}"),
    "E101": ("MISSING_APAAR_NO_REASON", "error", "APAAR ID is blank and no reason code was given (use REFUSED, NOT_GENERATED or PENDING)"),
    "E101W": ("MISSING_APAAR_WITH_REASON", "warning", "No APAAR ID ({detail}). Row accepted with provisional ID and counted toward intake"),
    "E102": ("INVALID_APAAR_FORMAT", "error", "APAAR ID must be exactly 12 digits"),
    "E103": ("APAAR_NOT_FOUND_IN_REGISTRY", "error", "APAAR ID not found in the APAAR registry (MOCK)"),
    "E104": ("APAAR_DETAILS_MISMATCH", "warning", "{detail} does not match the APAAR registry (MOCK) after normalisation"),
    "E201": ("DUPLICATE_IN_FILE", "error", "Same student already appears in row {detail} of this file"),
    "E202": ("DUPLICATE_IN_INSTITUTION", "error", "Student already has an active enrolment at this institution for this year; use PATCH to correct it"),
    "E203": ("CROSS_INSTITUTION_DUPLICATE", "flag", "A record in this batch needs AICTE review"),
    "E301": ("EXCESS_OVER_APPROVED_INTAKE", "flag", "Regular seats filled ({detail}) exceed AICTE approved intake"),
    "E302": ("CATEGORY_CAP_EXCEEDED", "flag", "Supernumerary cap exceeded for {detail}"),
    "E303": ("INTAKE_DECLARATION_MISMATCH", "flag", "Declared intake {detail} differs from AICTE registry; registry value is used"),
    "E304": ("INSTITUTION_NOT_APPROVED", "error", "{detail}"),
    "E401": ("INCONSISTENT_CATEGORY", "error", "{detail}"),
    "E402": ("IMPLAUSIBLE_AGE", "warning", "Age {detail} at admission is outside 16-35"),
    "E403": ("ADMISSION_DATE_OUTSIDE_WINDOW", "warning", "Admission date {detail} is outside the admission window"),
    "E404": ("LATERAL_ENTRY_YEAR_MISMATCH", "error", "Lateral entry is only valid in year 2 (got year {detail})"),
    "E501": ("POST_DEADLINE_MUTATION", "flag", "Change made after the submission deadline; recorded in the seat ledger"),
}
NAME_MATCH_THRESHOLD = 85  # rapidfuzz token_sort_ratio on normalised names
AGE_RANGE = (16, 35)


def issue(row_no: int, code: str, field_: str | None = None, detail: str = "") -> dict:
    _, sev, tmpl = CATALOGUE[code]
    return {"row_no": row_no, "code": code, "severity": sev, "field": field_, "message": tmpl.format(detail=detail, field=field_)}


@dataclass
class Ctx:
    institution_id: str
    institution_status: str
    year: dict                      # {code, window_start: date, window_end: date}
    programmes: dict                # code -> {id, approved_intake: int|None, duration_years}
    seat_categories: dict           # code -> {scope, cap_rule_json}
    registry_lookup: callable       # apaar -> {name, dob: 'YYYY-MM-DD'} | None   (MOCK APAAR registry)
    own_active_bi: set = field(default_factory=set)
    other_active_bi: set = field(default_factory=set)
    counters: dict = field(default_factory=dict)  # (programme_id, key) -> filled


def caps_for(intake: int, seat_categories: dict) -> dict:
    """{key: cap} for one programme. Keys: category code, or 'CODE:SUB' for sub-caps."""
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


# ---------- parsing ----------
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
        if col not in PARSERS and not _str(raw.get(col)):
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


# ---------- validation ----------
def _age(dob: date, on: date) -> int:
    return on.year - dob.year - ((on.month, on.day) < (dob.month, dob.day))


def validate_batch(rows: list[dict], ctx: Ctx) -> list[dict]:
    """rows: raw dicts (CSV strings or JSON values). Returns one outcome per row:
    {row_no, data, issues, accepted, apaar_status, programme_id, counter_keys}.
    Mutates ctx.counters for accepted rows (caller persists them in the same transaction)."""
    outcomes, seen, declared_flagged = [], {}, set()
    for i, raw in enumerate(rows, start=1):
        data, issues = parse_row(i, raw)
        o = {"row_no": i, "data": data, "issues": issues, "accepted": False,
             "apaar_status": None, "programme_id": None, "counter_keys": []}
        outcomes.append(o)
        if data is None:
            continue

        # Layer 2: format
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

        # Layer 3: referential
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

        # Layer 4: registry lookup (MOCK)
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

        # Layer 5: business rules
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

        # Layer 7a: duplicates (before intake, so rejected duplicates never consume a seat)
        bi = crypto.apaar_bi(apaar) if apaar_ok else None
        key = ("a", bi) if bi else ("n", crypto.normalise_name(data["student_name"]), data["dob"].isoformat())
        if key in seen:
            issues.append(issue(i, "E201", "apaar_id", str(seen[key])))
        elif bi and bi in ctx.own_active_bi:
            issues.append(issue(i, "E202", "apaar_id"))
        if not any(x["severity"] == "error" for x in issues):
            seen.setdefault(key, i)

        if any(x["severity"] == "error" for x in issues):
            continue

        # Accepted. Layer 6: intake engine. Every accepted row counts, APAAR or not (F10).
        o["accepted"], o["programme_id"], o["bi"] = True, prog["id"], bi
        caps = caps_for(prog["approved_intake"], ctx.seat_categories)
        keys = [data["seat_category"]]
        for sub_key in caps:
            code, _, sub = sub_key.partition(":")
            if sub and code == data["seat_category"]:
                flag = ctx.seat_categories[code]["cap_rule_json"]["sub_caps"][sub]["flag"]
                if data[flag]:
                    keys.append(sub_key)
        o["counter_keys"] = keys
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

        # Layer 7b: cross-institution (flag only; row accepted, case opened by DB layer)
        if bi and bi in ctx.other_active_bi:
            issues.append(issue(i, "E203", "apaar_id"))
    return outcomes
