"""API contract: the single source of truth for request/response shapes.
`py -m app.export_openapi` writes openapi.json; the frontend codes against it.
Change this file first, then backend and frontend.
"""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

# ---------- upload row (data dictionary, PRD Req 2) ----------
CSV_COLUMNS = [
    "apaar_id",               # 12 digits, or blank with apaar_reason
    "apaar_reason",           # REFUSED | NOT_GENERATED | PENDING (only when apaar_id blank)
    "institution_student_id", # institution roll number, printed on certificates (Req 10)
    "student_name",
    "dob",                    # YYYY-MM-DD
    "guardian_name",
    "programme_code",         # programme code within the uploading institution
    "academic_year",          # e.g. 2026-27
    "year_of_study",          # 1..duration
    "seat_category",          # REGULAR | SN_FN_OCI_CIWG
    "is_supernumerary",       # Y/N, must agree with seat_category scope
    "is_lateral_entry",       # Y/N, only valid with year_of_study = 2
    "is_nri", "is_oci", "is_fn", "is_ciwg",  # Y/N
    "admission_date",         # YYYY-MM-DD
    "declared_intake",        # optional; compared with AICTE registry (E303), never used as the limit
]
REQUIRED_COLUMNS = [c for c in CSV_COLUMNS if c not in ("apaar_id", "apaar_reason", "guardian_name", "declared_intake")]
APAAR_REASONS = ("REFUSED", "NOT_GENERATED", "PENDING")

Severity = Literal["error", "warning", "flag"]
Role = Literal["institution_admin", "aicte_officer", "auditor", "verifier", "student", "university_registrar"]


class StudentRow(BaseModel):
    """JSON channel body row; same fields as the CSV, already typed."""
    apaar_id: str | None = None
    apaar_reason: Literal["REFUSED", "NOT_GENERATED", "PENDING"] | None = None
    institution_student_id: str
    student_name: str
    dob: date
    guardian_name: str | None = None
    programme_code: str
    academic_year: str
    year_of_study: int
    seat_category: str
    is_supernumerary: bool = False
    is_lateral_entry: bool = False
    is_nri: bool = False
    is_oci: bool = False
    is_fn: bool = False
    is_ciwg: bool = False
    admission_date: date
    declared_intake: int | None = None


class BatchJsonIn(BaseModel):
    rows: list[StudentRow]


class Issue(BaseModel):
    row_no: int = Field(description="1-based data row; 0 = batch level")
    code: str
    severity: Severity
    field: str | None = None
    message: str = Field(description="rendered from i18n/<locale>.json for the requested locale")
    fix_hint: str


class BatchCounts(BaseModel):
    rows: int = 0
    accepted: int = 0
    rejected: int = 0
    warnings: int = Field(0, description="rows with at least one warning")
    flags: int = Field(0, description="rows with at least one AICTE-review flag")
    cases_opened: int = 0


class BatchOut(BaseModel):
    batch_id: int
    institution_id: str
    status: Literal["processing", "completed", "failed"]
    channel: Literal["portal_csv", "api_json"]
    created_at: datetime
    counts: "BatchCounts"
    replayed: bool = Field(False, description="true when returned for a repeated Idempotency-Key")


class IssuesPage(BaseModel):
    items: list[Issue]
    next_cursor: int | None


class EnrolmentPatch(BaseModel):
    status: Literal["active", "withdrawn", "migrated", "completed"] | None = None
    ended_on: date | None = None
    year_of_study: int | None = None
    reason: str = Field(min_length=3)


class EnrolmentOut(BaseModel):
    id: int
    programme_id: str
    academic_year: str
    institution_student_id: str
    apaar_masked: str | None
    provisional_id: str | None
    apaar_status: str
    status: str
    seat_category_code: str
    flags: list[str] = Field(description="codes raised by this change, e.g. E501")


class SeatLine(BaseModel):
    category_code: str
    filled: int
    cap: int
    excess: int


class ProgrammeSeats(BaseModel):
    programme_id: str
    name: str
    academic_year: str
    approved_intake: int
    source: Literal["mock"] = "mock"
    lines: list[SeatLine]


class InstitutionDashboard(BaseModel):
    institution_id: str
    name: str
    programmes: list[ProgrammeSeats]
    batches: list[BatchOut]
    open_notices: list[str] = Field(description="neutral case notices, no other-institution data (F4)")
    rejected_rows_total: int = Field(description="rows rejected with errors across all batches (not counted toward intake until resubmitted)")
    apaar_coverage: dict[str, int]


class AicteTotals(BaseModel):
    institutions: int
    active_enrolments: int
    approved_intake: int
    excess_seats: int
    batches: int
    post_deadline_mutations: int


class ExcessRow(BaseModel):
    programme_id: str
    name: str
    institution: str
    state: str
    category_code: str
    filled: int
    cap: int
    excess: int


class CategoryMix(BaseModel):
    regular: int
    nri: int
    oci: int
    fn: int
    ciwg: int
    no_apaar: int


class StateRow(BaseModel):
    state: str
    approved: int
    filled: int
    fill_pct: float | None


class ComplianceRow(BaseModel):
    id: str
    name: str
    state: str
    status: str
    last_upload: datetime | None
    batches: int


class AicteDashboard(BaseModel):
    totals: AicteTotals
    excess_ranking: list[ExcessRow]
    category_mix: CategoryMix
    by_state: list[StateRow]
    open_cases: int
    upload_compliance: list[ComplianceRow]
    ledger_ok: bool


class LedgerVerifyOut(BaseModel):
    ok: bool
    entries: int
    checkpoint_ok: bool
    problems: list[str] = Field(description="first 20 problems found (chain, checkpoint, or live-row mismatches)")


class CheckpointOut(BaseModel):
    id: int
    upto_seq: int
    root_hash: str
    aicte_sig: str
    published_at: datetime


class CaseOut(BaseModel):
    id: int
    status: str
    created_at: datetime
    notice: str
    detail: dict | None = Field(None, description="AICTE only, after unmask with reason")


class CaseResolve(BaseModel):
    status: Literal["confirmed_duplicate", "false_positive", "under_investigation"]
    note: str = Field(min_length=3)


class ConsentRequestIn(BaseModel):
    apaar_id: str
    purpose: str = Field(min_length=3)
    fields: list[Literal["name", "programme", "institution", "academic_year", "status", "apaar_id", "student_id"]]
    valid_days: int = Field(7, ge=1, le=30)


class ConsentOut(BaseModel):
    id: int
    requester: str
    purpose: str
    fields: list[str]
    status: str
    expires_at: datetime


class ConsentApprove(BaseModel):
    otp: str = Field(description="MOCK OTP; demo value is 123456")


class VerifyIn(BaseModel):
    credential: dict


class VerifyOut(BaseModel):
    result: Literal["VALID", "REVOKED", "SUSPENDED", "UNTRUSTED_ISSUER", "TAMPERED", "EXPIRED", "MALFORMED"]
    checks: dict[str, bool]
    issuer_name: str | None = None
    subject: dict | None = None


class LoginIn(BaseModel):
    user_id: str
    password: str


class LoginOut(BaseModel):
    access_token: str
    role: Role
    institution_id: str | None
    display_name: str


class AccessLogEntry(BaseModel):
    ts: datetime
    actor: str
    role: str
    action: str
    reason: str | None


class Problem(BaseModel):
    """application/problem+json (RFC 9457)."""
    type: str = "about:blank"
    title: str
    status: int
    detail: str | None = None
