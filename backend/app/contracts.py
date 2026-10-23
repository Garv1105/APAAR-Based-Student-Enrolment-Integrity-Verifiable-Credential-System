"""API contract: the single source of truth for request/response shapes.
`py -m app.export_openapi` writes openapi.json; the frontend codes against it.
Change this file first, then backend and frontend.
"""
from datetime import date, datetime
from typing import Literal
from uuid import UUID

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
Role = Literal["institution_admin", "aicte_officer", "auditor", "verifier", "student", "guardian", "university_registrar"]


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
    activation_reissues: int = Field(0, description="activation codes reissued (insider-impersonation signal, P1)")


class AicteDashboard(BaseModel):
    totals: AicteTotals
    excess_ranking: list[ExcessRow]
    category_mix: CategoryMix
    by_state: list[StateRow]
    open_cases: int
    upload_compliance: list[ComplianceRow]
    ledger_ok: bool


class AnomalyFlag(BaseModel):
    type: Literal["ENROLMENT_SPIKE", "CATEGORY_MIX_SHIFT", "DOB_CLUSTER", "SEQUENTIAL_APAAR", "DEADLINE_DUMP"]
    institution_id: str
    programme: str | None
    score: float
    evidence: dict = Field(description="the numbers that triggered the rule")
    explanation: str
    label: str = Field(description="always: risk indicator for review, not proof of misconduct")


class Dqs(BaseModel):
    score: float = Field(description="0-100 = 100 x sum(weight x component)")
    components: dict[str, float] = Field(description="each 0-1")
    points: dict[str, float] = Field(description="100 x weight x component; sums to score")
    weights: dict[str, float]


class InstitutionRisk(BaseModel):
    institution_id: str
    dqs: Dqs | None = Field(description="null when nothing was submitted")
    flags: list[AnomalyFlag]


class InspectionEntry(BaseModel):
    rank: int
    institution_id: str
    name: str
    state: str
    status: str
    active: int
    dqs: Dqs | None
    risk: float | None = Field(description="(100 - DQS) x active enrolments; null = not submitted (listed first)")
    why: list[str]
    flags: list[AnomalyFlag]


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
    notice: str = Field(description="Neutral text: names no other institution (F4)")
    enrolment_ids: list[int] = Field(description="Institutions: only their own enrolments in the case. Regulators: all")
    resolution_note: str | None = Field(None, description="Regulators only")
    resolved_at: datetime | None = None
    detail: list[dict] | None = Field(None, description="AICTE officer only, from POST /v1/cases/{id}/unmask with a reason")


class CaseResolve(BaseModel):
    status: Literal["confirmed_duplicate", "false_positive", "under_investigation"]
    note: str = Field(min_length=3, max_length=500)
    keep_enrolment_id: int | None = Field(None, description="Required for confirmed_duplicate: the enrolment that stands. "
                                          "Credentials of the other enrolments in the case are revoked")


class CaseUnmask(BaseModel):
    reason: str = Field(min_length=10, max_length=300, description="Recorded in the audit log and shown to the student (D6)")


class ConsentRequestIn(BaseModel):
    apaar_id: str
    purpose: str = Field(min_length=3, max_length=200, pattern=r"^[\w .,:;()'/&-]+$",
                         description="shown to the student; plain text only")
    fields: list[Literal["name", "programme", "institution", "academic_year", "status", "apaar_id", "student_id"]] = Field(min_length=1)
    valid_days: int = Field(7, ge=1, le=30)


class ConsentOut(BaseModel):
    id: int
    requester: str
    purpose: str
    fields: list[str]
    status: Literal["pending", "granted", "denied", "revoked", "expired"]
    granted_by: Literal["student", "guardian"] | None
    requested_at: datetime
    expires_at: datetime
    credential_id: str | None = None


class ConsentApprove(BaseModel):
    credential: dict | None = Field(None, description="WebAuthn assertion (PublicKeyCredential JSON) answering "
                                    "POST /v1/consents/{id}/approve/options")
    otp: str | None = Field(None, description="DEMO_MODE only: MOCK OTP 123456")
    approved_by: Literal["student", "guardian"] = Field("student", description="DEMO_MODE only")
    guardian_otp: str | None = Field(None, description="DEMO_MODE only: for students under 18 (MOCK OTP 123456)")


class ConsentCredentialOut(BaseModel):
    consent: ConsentOut
    credential: dict = Field(description="VerificationCredential holding only the approved fields")


class StudentEnrolment(BaseModel):
    programme: str
    institution: str
    academic_year: str
    status: str
    institution_student_id: str


class StudentProfile(BaseModel):
    apaar_masked: str | None
    provisional_id: str | None
    apaar_status: str
    enrolments: list[StudentEnrolment]
    passkey_cooldown_until: datetime | None = Field(None, description="a new passkey (first activation: "
                                                    "PASSKEY_FIRST_COOLDOWN_HOURS; reissued code: 24 h) can't "
                                                    "approve consent until then; the portal shows a notice")
    viewer: Literal["student", "guardian"] = "student"


class VerifyIn(BaseModel):
    credential: dict | None = Field(None, description="the VC JSON document")
    qr: str | None = Field(None, description="or the scanned certificate QR text: 'AV1:' + Base45(zlib(VC))")


class CertificateOut(BaseModel):
    credential: dict
    qr_payload: str = Field(description="offline QR: 'AV1:' + Base45(zlib(VC JSON))")
    qr_payload_chars: int
    qr_svg: str = Field(description="QR code image (SVG), error correction level M")


class VerifyChecks(BaseModel):
    well_formed: bool
    issuer_trusted: bool
    signature_valid: bool
    within_validity: bool
    not_revoked: bool
    not_suspended: bool


class VerifyOut(BaseModel):
    result: Literal["VALID", "REVOKED", "SUSPENDED", "UNTRUSTED_ISSUER", "TAMPERED", "EXPIRED", "MALFORMED"]
    checks: VerifyChecks
    issuer_name: str | None = None
    subject: dict | None = Field(None, description="credentialSubject, omitted when the signature fails")


CredentialType = Literal["EnrolmentCredential", "DegreeCredential", "VerificationCredential"]


class IssueIn(BaseModel):
    type: Literal["EnrolmentCredential", "DegreeCredential"]


class CredentialStatusFlags(BaseModel):
    revocation: bool
    suspension: bool


class CredentialOut(BaseModel):
    id: str
    type: CredentialType
    issuer_did: str
    issued_at: datetime
    status: CredentialStatusFlags
    credential: dict = Field(description="the signed W3C VC 2.0 document (eddsa-jcs-2022 DataIntegrityProof)")


class CredentialStatusIn(BaseModel):
    credential_id: str
    purpose: Literal["revocation", "suspension"]
    value: bool
    reason: str = Field(min_length=3)


class RegistryIssuer(BaseModel):
    did: str
    kind: Literal["institution", "university"]
    name: str
    status: str
    validFrom: str
    validUntil: str | None
    verificationMethod: list[dict]
    source: Literal["mock"] = "mock"


class LoginIn(BaseModel):
    user_id: str
    password: str


class StudentLoginIn(BaseModel):
    """MOCK student sign-in. Production would authenticate through APAAR / DigiLocker."""
    apaar_id: str = Field(description="12-digit APAAR ID")
    dob: date = Field(description="date of birth, YYYY-MM-DD")


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
    entity: str
    entity_id: str | None


class Problem(BaseModel):
    """application/problem+json (RFC 9457)."""
    type: str = "about:blank"
    title: str
    status: int
    detail: str | None = None


# ---------- webhooks (Req 7) ----------
WebhookEvent = Literal["batch.validated", "case.opened", "case.resolved", "credential.issued", "credential.revoked"]


class WebhookIn(BaseModel):
    url: str = Field(max_length=500, description="https only (http://localhost only in dev); must resolve to public IPs")
    events: list[WebhookEvent] = Field(min_length=1)


class WebhookOut(BaseModel):
    id: int
    url: str
    events: list[str]
    active: bool
    secret_fp: str = Field(description="first 8 hex of SHA-256(secret), for matching only")
    created_at: datetime
    previous_secret_valid_until: datetime | None = Field(None, description="after a rotation the old secret also signs until then")


class WebhookCreated(WebhookOut):
    secret: str = Field(description="Shown once. Standard Webhooks signing secret (whsec_...)")


class WebhookDelivery(BaseModel):
    id: int
    endpoint_id: int
    event_id: UUID
    event_type: str
    payload: dict = Field(description="ids, counts, codes and statuses only (no personal data)")
    status: Literal["pending", "delivered", "failed", "cancelled"]
    attempts: int
    next_attempt_at: datetime
    last_status_code: int | None
    last_error: str | None = Field(None, description="truncated; response bodies are never stored")
    created_at: datetime
    delivered_at: datetime | None


class WebhookDeliveriesPage(BaseModel):
    items: list[WebhookDelivery]
    next_cursor: int | None


# ---------- passkeys (P1) ----------
class AuthConfig(BaseModel):
    demo_mode: bool = Field(description="true: the MOCK APAAR + DOB sign-in and OTP consent approval are enabled")
    rp_id: str


class ActivateIn(BaseModel):
    apaar_id: str
    code: str = Field(max_length=20, description="one-time activation code from the institution, e.g. 7K3M-Q9TB-2X")


class SetupOut(BaseModel):
    setup_token: str = Field(description="15-minute session that can only register a passkey")
    kind: Literal["student", "guardian"]
    reissue: bool = Field(description="code was a reissue: the new passkey can't approve consent for 24 h")
    expires_in: int


class PasskeyCredentialIn(BaseModel):
    credential: dict = Field(description="PublicKeyCredential JSON from navigator.credentials.create()/get()")


class PasskeyOut(BaseModel):
    id: int
    kind: Literal["student", "guardian"]
    created_at: datetime
    last_used_at: datetime | None
    approve_after: datetime
    revoked: bool


class ActivationCodeIn(BaseModel):
    kind: Literal["student", "guardian"] = "student"
    reason: str = Field(min_length=10, max_length=300, description="audited and shown in the student's access log")


class ActivationCodeOut(BaseModel):
    status: Literal["issued", "already_issued"]
    code: str | None = Field(description="shown once; never stored (a replay returns null)")
    kind: Literal["student", "guardian"]
    expires_at: datetime | None
    revoked_passkeys: int
    reissue: bool
    cooldown_hours: int = Field(description="hours before the passkey registered from this code can approve consent")
    detail: str | None = None
