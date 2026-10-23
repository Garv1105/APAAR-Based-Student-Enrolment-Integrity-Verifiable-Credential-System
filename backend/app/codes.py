"""Validation issue codes (PRD §9.3). The only place codes are defined.
Message text lives in backend/i18n/<locale>.json, keyed by code, with {placeholders}.
Documented placeholders: {field} (column name), {detail} (non-PII detail: counts, row numbers, codes, dates).
"""
CODES = {  # code: (name, severity)
    "E001": ("SCHEMA_INVALID", "error"),
    "E101": ("MISSING_APAAR_NO_REASON", "error"),
    "E101W": ("MISSING_APAAR_WITH_REASON", "warning"),
    "E102": ("INVALID_APAAR_FORMAT", "error"),
    "E103": ("APAAR_NOT_FOUND_IN_REGISTRY", "error"),
    "E104": ("APAAR_DETAILS_MISMATCH", "warning"),
    "E105": ("MISSING_STUDENT_ID", "error"),        # extension: Req 10 prints the student ID on certificates
    "E205": ("DUPLICATE_STUDENT_ID", "error"),      # extension: student ID unique per institution
    "E201": ("DUPLICATE_IN_FILE", "error"),
    "E202": ("DUPLICATE_IN_INSTITUTION", "error"),
    "E203": ("CROSS_INSTITUTION_DUPLICATE", "flag"),
    "E301": ("EXCESS_OVER_APPROVED_INTAKE", "flag"),
    "E302": ("CATEGORY_CAP_EXCEEDED", "flag"),
    "E303": ("INTAKE_DECLARATION_MISMATCH", "flag"),
    "E304": ("INSTITUTION_NOT_APPROVED", "error"),
    "E401": ("INCONSISTENT_CATEGORY", "error"),
    "E402": ("IMPLAUSIBLE_AGE", "warning"),
    "E403": ("ADMISSION_DATE_OUTSIDE_WINDOW", "warning"),
    "E404": ("LATERAL_ENTRY_YEAR_MISMATCH", "error"),
    "E501": ("POST_DEADLINE_MUTATION", "flag"),
}
PLACEHOLDERS = {"field", "detail"}


def severity(code: str) -> str:
    return CODES[code][1]
