"""FastAPI app. Run: `uvicorn app.main:app --reload` from backend/."""
import csv
import io
import json
import uuid
import zlib
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import ValidationError

from . import auth, cases, consent, credentials, crypto, dashboards, db, i18n, ingest, ledger, passkeys, reports, risk, webhooks
from .auth import require
from .contracts import (CSV_COLUMNS, AccessLogEntry, PeerStatus, ActivateIn, ActivationCodeIn, ActivationCodeOut, AuthConfig, PasskeyCredentialIn,
                        PasskeyOut, SetupOut, CaseOut, CaseResolve, CaseUnmask, WebhookCreated, WebhookDeliveriesPage,
                        WebhookDelivery, WebhookIn, WebhookOut, AicteDashboard, AnomalyFlag, InspectionEntry, InstitutionRisk, BatchJsonIn, BatchOut, CertificateOut, CheckpointOut, ConsentApprove,
                        ConsentCredentialOut, ConsentOut, ConsentRequestIn, CredentialOut, CredentialStatusIn, EnrolmentOut,
                        EnrolmentPatch, InstitutionDashboard, IssueIn, IssuesPage, LedgerVerifyOut, LoginIn, LoginOut,
                        ProgrammeSeats, RegistryIssuer, StudentLoginIn, StudentProfile, VerifyIn, VerifyOut)
from .validation import missing_columns

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_ROWS = 50_000

@asynccontextmanager
async def lifespan(_app):
    webhooks.start_poller()  # off with WEBHOOK_DISPATCH=off (tests, demo seed)
    yield


app = FastAPI(title="APAAR Student Data & Verification Platform (SIH26263 prototype)", version="0.1.0", lifespan=lifespan,
              description="Prototype. APAAR registry, AICTE approval registry, OTP and identity provider are MOCKS. Synthetic data only.")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["*"], allow_headers=["*"], expose_headers=["X-Request-Id"])


@app.middleware("http")
async def request_id(request: Request, call_next):
    request.state.request_id = request.headers.get("X-Request-Id") or uuid.uuid4().hex
    resp = await call_next(request)
    resp.headers["X-Request-Id"] = request.state.request_id
    return resp


def problem(status: int, title: str, detail=None) -> JSONResponse:
    return JSONResponse({"type": "about:blank", "title": title, "status": status, "detail": detail},
                        status_code=status, media_type="application/problem+json")


@app.exception_handler(HTTPException)
async def http_problem(_, exc: HTTPException):
    return problem(exc.status_code, exc.detail if isinstance(exc.detail, str) else "Error", None if isinstance(exc.detail, str) else exc.detail)


@app.exception_handler(RequestValidationError)
async def validation_problem(_, exc: RequestValidationError):
    return problem(422, "Request validation failed", exc.errors())


@app.exception_handler(ingest.ApiError)
async def api_problem(_, exc: ingest.ApiError):
    return problem(exc.status, exc.detail)


@app.exception_handler(auth.LoginThrottled)
async def throttled_problem(_, exc: auth.LoginThrottled):
    return problem(429, "Too many attempts; try again later")


@app.exception_handler(credentials.CredentialError)
async def credential_problem(_, exc: credentials.CredentialError):
    return problem(exc.status, exc.detail)


def require_person(*roles: str):
    """require() plus M3: a guardian acts only while the student is under 18 (checked on every request)."""
    def dep(user=Depends(require(*roles)), conn=Depends(get_conn)) -> dict:
        if user["role"] == "guardian" and not passkeys.is_minor(conn, user["student_id"]):
            raise HTTPException(403, "Guardian access ended: the student is 18 or over")
        return user
    return dep


def anon_conn():
    """Anonymous connection for sign-in flows (the anonymous-only SECURITY DEFINER functions), even if a token is sent."""
    with db.app_connect(None) as conn:
        yield conn


def get_conn(user=Depends(auth.optional_user)):
    """Non-owner app_user connection with RLS settings for the caller.
    ponytail: connection per request; add psycopg_pool if load testing shows connect cost matters"""
    with db.app_connect(user) as conn:
        yield conn


@app.get("/healthz")
def healthz(conn=Depends(get_conn)):
    conn.execute("SELECT 1")
    return {"ok": True}


@app.post("/v1/auth/login", response_model=LoginOut)
def login(body: LoginIn, conn=Depends(get_conn)):
    out = auth.login(conn, body.user_id, body.password)
    if out is None:
        raise HTTPException(401, "Invalid credentials")
    return out


@app.post("/v1/auth/student-login", response_model=LoginOut,
          description="MOCK student sign-in: APAAR ID + date of birth. Production: APAAR/DigiLocker authentication. "
                      "5 failed attempts per APAAR in 15 minutes lock it out.")
def student_login(body: StudentLoginIn, conn=Depends(get_conn)):
    if not passkeys.demo_mode():
        raise HTTPException(403, "APAAR + date-of-birth sign-in is a MOCK available only in DEMO_MODE; sign in with your passkey")
    try:
        out = auth.student_login(conn, body.apaar_id.replace(" ", "").replace("-", ""), body.dob.isoformat())
    except auth.LoginThrottled:
        raise HTTPException(429, "Too many failed sign-in attempts; try again in 15 minutes")
    if out is None:
        raise HTTPException(401, "APAAR ID and date of birth don't match")
    return out


# ---------- ingestion ----------
@app.post("/v1/batches", response_model=BatchOut, status_code=201,
          description="CSV (multipart field 'file' or text/csv body) or JSON {rows:[...]}. Validation runs synchronously.")
async def create_batch(request: Request, idempotency_key: str | None = Header(None),
                       user=Depends(require("institution_admin")), conn=Depends(get_conn)):
    ctype = request.headers.get("content-type", "")
    if ctype.startswith("application/json"):
        raw = await request.body()
        try:
            rows = [r.model_dump() for r in BatchJsonIn.model_validate_json(raw).rows]
        except ValidationError as e:
            return problem(422, "Invalid JSON batch", e.errors(include_url=False, include_context=False))
        channel = "api_json"
    else:
        if ctype.startswith("multipart/form-data"):
            form = await request.form()
            f = form.get("file")
            if f is None or isinstance(f, str):
                return problem(422, "Missing multipart field 'file'")
            raw = await f.read()
        else:
            raw = await request.body()
        if len(raw) > MAX_UPLOAD_BYTES:
            return problem(413, "File too large", f"Limit is {MAX_UPLOAD_BYTES} bytes")
        try:
            reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
            rows = list(reader)
        except UnicodeDecodeError:
            return problem(422, "File must be UTF-8 CSV")
        missing = missing_columns(reader.fieldnames or [])
        if missing:
            return problem(422, "Missing required columns", {"missing": missing})
        channel = "portal_csv"
    if not rows:
        return problem(422, "Batch has no rows")
    if len(rows) > MAX_ROWS:
        return problem(413, "Too many rows", f"Limit is {MAX_ROWS}")
    out = ingest.process_batch(conn, user, rows, channel, idempotency_key, crypto.sha256_hex(raw), request)
    return JSONResponse(BatchOut(**out).model_dump(mode="json"), status_code=200 if out["replayed"] else 201)


@app.get("/v1/batches/template.csv", description="Empty upload template: the header row of the data dictionary.")
def batch_template(user=Depends(require("institution_admin"))):
    return Response(",".join(CSV_COLUMNS) + "\n", media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="apaar-upload-template.csv"'})


def _own_batch(conn, user, batch_id):
    b = conn.execute("SELECT * FROM upload_batches WHERE id=%s", (batch_id,)).fetchone()
    if b is None or (user["role"] == "institution_admin" and b["institution_id"] != user["institution_id"]):
        raise HTTPException(404, "Batch not found")
    return b


READERS = ("institution_admin", "aicte_officer", "auditor")


@app.get("/v1/batches/{batch_id}", response_model=BatchOut)
def get_batch(batch_id: int, user=Depends(require(*READERS)), conn=Depends(get_conn)):
    return ingest.batch_out(_own_batch(conn, user, batch_id))


def _rendered(rows, lang):
    return [{**r, **i18n.render(r["code"], r["params"], lang)} for r in rows]


@app.get("/v1/batches/{batch_id}/issues", response_model=IssuesPage)
def get_issues(batch_id: int, cursor: int = 0, limit: int = 200, lang: str = "en",
               user=Depends(require(*READERS)), conn=Depends(get_conn)):
    _own_batch(conn, user, batch_id)
    limit = min(max(limit, 1), 1000)
    rows = conn.execute("SELECT id, row_no, code, severity, field, params FROM validation_issues WHERE batch_id=%s AND id > %s "
                        "ORDER BY id LIMIT %s", (batch_id, cursor, limit + 1)).fetchall()
    nxt = rows[limit - 1]["id"] if len(rows) > limit else None
    return {"items": _rendered(rows[:limit], lang), "next_cursor": nxt}


def csv_safe(v) -> str:
    """Neutralise spreadsheet formula injection in exported cells."""
    s = "" if v is None else str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s


def csv_response(header: list[str], rows, filename: str) -> Response:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    for r in rows:
        w.writerow([csv_safe(r[h]) for h in header])
    return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@app.get("/v1/batches/{batch_id}/report.csv")
def batch_report(batch_id: int, request: Request, lang: str = "en", user=Depends(require(*READERS)), conn=Depends(get_conn)):
    _own_batch(conn, user, batch_id)
    rows = conn.execute("SELECT row_no, code, severity, field, params FROM validation_issues WHERE batch_id=%s ORDER BY row_no, id",
                        (batch_id,)).fetchall()
    auth.audit(conn, user, "report.export", "upload_batch", batch_id, request=request)
    conn.commit()
    return csv_response(["row_no", "code", "severity", "field", "message", "fix_hint"], _rendered(rows, lang),
                        f"batch-{batch_id}-issues.csv")


# ---------- enrolments ----------
@app.get("/v1/enrolments", response_model=list[EnrolmentOut],
         description="Institution: own enrolments. University registrar: its affiliated institutions' enrolments (RLS). "
                     "Lookup by APAAR or institution student id.")
def find_enrolments(request: Request, apaar: str | None = None, student_id: str | None = None,
                    user=Depends(require("institution_admin", "university_registrar")), conn=Depends(get_conn)):
    if not apaar and not student_id:
        raise HTTPException(422, "Give apaar or student_id")
    apaar = apaar.replace(" ", "").replace("-", "") if apaar else None
    rows = conn.execute(
        "SELECT e.* FROM enrolments e JOIN students s ON s.id=e.student_id JOIN programmes p ON p.id=e.programme_id "
        "WHERE (%s::text IS NULL OR p.institution_id=%s) AND (s.apaar_bi=%s OR e.institution_student_id=%s) ORDER BY e.id",
        (user["institution_id"], user["institution_id"], crypto.apaar_bi(apaar) if apaar else None, student_id)).fetchall()
    for r in rows:
        auth.audit(conn, user, "enrolment.read", "enrolment", r["id"], student_id=r["student_id"], request=request)
    conn.commit()
    return [ingest.enrolment_out(conn, r) for r in rows]


@app.patch("/v1/enrolments/{enrolment_id}", response_model=EnrolmentOut)
def update_enrolment(enrolment_id: int, body: EnrolmentPatch, request: Request,
                     user=Depends(require("institution_admin")), conn=Depends(get_conn)):
    return ingest.patch_enrolment(conn, user, enrolment_id, body.model_dump(exclude_none=True), request)


# ---------- monitoring ----------
@app.get("/v1/programmes/{programme_id}/seats", response_model=ProgrammeSeats)
def seats(programme_id: str, user=Depends(require(*READERS)), conn=Depends(get_conn)):
    p = conn.execute("SELECT institution_id FROM programmes WHERE id=%s", (programme_id,)).fetchone()
    if p is None or (user["role"] == "institution_admin" and p["institution_id"] != user["institution_id"]):
        raise HTTPException(404, "Programme not found")
    out = dashboards.programme_seats(conn, [programme_id], ingest.current_year(conn)["code"])
    if not out:
        raise HTTPException(404, "No approved intake for this programme")
    return out[0]


@app.get("/v1/dashboard/institution", response_model=InstitutionDashboard)
def dash_institution(user=Depends(require("institution_admin")), conn=Depends(get_conn)):
    return dashboards.institution(conn, user["institution_id"])


@app.get("/v1/dashboard/aicte", response_model=AicteDashboard)
def dash_aicte(user=Depends(require("aicte_officer", "auditor")), conn=Depends(get_conn)):
    return dashboards.aicte(conn)


@app.get("/v1/ledger/verify", response_model=LedgerVerifyOut)
def ledger_verify(user=Depends(require("aicte_officer", "auditor")), conn=Depends(get_conn)):
    return ledger.verify(conn)


@app.post("/v1/ledger/checkpoints", response_model=CheckpointOut | None)
def ledger_checkpoint(user=Depends(require("aicte_officer")), conn=Depends(get_conn)):
    cp = ledger.checkpoint(conn)
    conn.commit()
    return cp


@app.get("/v1/ledger/checkpoints/latest")
def ledger_latest(conn=Depends(get_conn)):
    """Public: latest signed checkpoint, plus the AICTE ledger public key."""
    cp = conn.execute("SELECT upto_seq, root_hash, aicte_sig, published_at FROM ledger_checkpoints ORDER BY id DESC LIMIT 1").fetchone()
    return {"checkpoint": cp, "public_key": crypto.public_multikey(crypto.signing_key(ledger.SIGNER))}


# ---------- D3: anomalies, DQS, inspection queue ----------
@app.get("/v1/anomalies", response_model=list[AnomalyFlag],
         description="Explainable anomaly flags with evidence (risk indicators for review, not proof of misconduct).")
def anomalies(request: Request, user=Depends(require("aicte_officer", "auditor")), conn=Depends(get_conn)):
    return risk.flags(conn, regulator=True)


@app.get("/v1/anomalies/peer-status", response_model=PeerStatus,
         description="A1 peer comparisons: how many ran, how many flagged, how many were skipped for lack of peers.")
def anomalies_peer_status(user=Depends(require("aicte_officer", "auditor")), conn=Depends(get_conn)):
    return risk.peer_status(conn)


@app.get("/v1/inspection-queue", response_model=list[InspectionEntry],
         description="Institutions ranked by risk = (100 - DQS) x active enrolments, with DQS components and reasons.")
def inspection_queue(user=Depends(require("aicte_officer", "auditor")), conn=Depends(get_conn)):
    return risk.inspection_queue(conn)


@app.get("/v1/dqs", response_model=InstitutionRisk, description="The calling institution's own Data Quality Score and flags.")
def own_dqs(user=Depends(require("institution_admin")), conn=Depends(get_conn)):
    return risk.institution_view(conn, user["institution_id"])


# ---------- reports (Req 9) ----------
@app.get("/v1/reports", description="Available reports for the caller's role.")
def report_index(user=Depends(require("institution_admin", "aicte_officer", "auditor"))):
    allowed = ("accreditation", "category-utilisation") if user["role"] == "institution_admin" else tuple(reports.REPORTS)
    return [{"kind": k, "description": reports.REPORTS[k], "url": f"/v1/reports/{k}.csv"} for k in allowed]


@app.get("/v1/reports/{kind}.csv", description="CSV report (formula-injection safe). Institutions: accreditation and "
                                                "category-utilisation for their own data. Regulators: all reports; "
                                                "accreditation needs ?institution_id=.")
def report_csv(kind: str, request: Request, institution_id: str | None = None,
               user=Depends(require("institution_admin", "aicte_officer", "auditor")), conn=Depends(get_conn)):
    if kind not in reports.REPORTS:
        raise HTTPException(404, "Unknown report")
    inst = user["role"] == "institution_admin"
    if inst and kind not in ("accreditation", "category-utilisation"):
        raise HTTPException(403, "This report is for AICTE and regulators")
    if kind == "accreditation":
        target = user["institution_id"] if inst else institution_id
        if not target:
            raise HTTPException(422, "Give institution_id")
        if conn.execute("SELECT 1 FROM institutions WHERE id=%s", (target,)).fetchone() is None:
            raise HTTPException(404, "Institution not found")
        header, rows = reports.accreditation(conn, target)
    elif kind == "state-summary":
        header, rows = reports.state_summary(conn)
    elif kind == "category-utilisation":
        header, rows = reports.category_utilisation(conn)  # RLS: an institution only sees its own counters
    else:
        header, rows = reports.excess_case_file(conn)
    auth.audit(conn, user, "report.export", "report", kind, reason=institution_id, request=request)
    conn.commit()
    return csv_response(header, rows, f"{kind}.csv")


# ---------- duplicate cases (Req 3, 8; PRD §10 steps 4-5) ----------
@app.get("/v1/cases", response_model=list[CaseOut],
         description="Institutions: cases touching their own enrolments, neutral text, own enrolment ids only. Regulators: all.")
def list_cases(status: str | None = None, user=Depends(require("institution_admin", "aicte_officer", "auditor")),
               conn=Depends(get_conn)):
    return cases.list_cases(conn, user, status)


@app.post("/v1/cases/{case_id}/resolve", response_model=CaseOut,
          description="AICTE officer. confirmed_duplicate revokes the credentials of every enrolment except keep_enrolment_id; "
                      "under_investigation suspends them. Audited; visible to the student (D6).")
def resolve_case(case_id: int, body: CaseResolve, request: Request, user=Depends(require("aicte_officer")), conn=Depends(get_conn)):
    return cases.resolve(conn, user, case_id, body.model_dump(), request)


@app.post("/v1/cases/{case_id}/unmask", response_model=CaseOut,
          description="AICTE officer: both sides of a case in clear. The reason is audited and shown to the student (D6).")
def unmask_case(case_id: int, body: CaseUnmask, request: Request, user=Depends(require("aicte_officer")), conn=Depends(get_conn)):
    return cases.unmask(conn, user, case_id, body.reason, request)


# ---------- passkeys (P1, Req 5/8) ----------
@app.get("/v1/auth/config", response_model=AuthConfig, description="Public: which sign-in paths are enabled.")
def auth_config():
    return {"demo_mode": passkeys.demo_mode(), "rp_id": passkeys.rp_id()}


@app.post("/v1/auth/activate", response_model=SetupOut,
          description="Redeem (burn) a one-time activation code for a 15-minute session that can only register a passkey. "
                      "5 attempts per APAAR per 15 minutes.")
def activate(body: ActivateIn, request: Request, conn=Depends(anon_conn)):
    return passkeys.activate(conn, body.apaar_id, body.code, request.client.host if request.client else "unknown")


@app.post("/v1/passkeys/register/options", description="Setup session: WebAuthn registration options (discoverable, UV required).")
def passkey_register_options(user=Depends(auth.require_setup), conn=Depends(get_conn)):
    return passkeys.register_options(conn, user)


@app.post("/v1/passkeys/register/verify", response_model=PasskeyOut, status_code=201, description="Setup session: store the passkey.")
def passkey_register_verify(body: PasskeyCredentialIn, user=Depends(auth.require_setup), conn=Depends(get_conn)):
    return passkeys.register_verify(conn, user, body.credential)


@app.post("/v1/auth/passkey/options", description="Public: discoverable sign-in options (no APAAR needed). 30/min per client.")
def passkey_login_options(request: Request, conn=Depends(anon_conn)):
    return passkeys.login_options(conn, request.client.host if request.client else "unknown")


@app.post("/v1/auth/passkey/verify", response_model=LoginOut, description="Public: sign in as the student or guardian.")
def passkey_login_verify(body: PasskeyCredentialIn, conn=Depends(anon_conn)):
    return passkeys.login_verify(conn, body.credential)


@app.get("/v1/passkeys", response_model=list[PasskeyOut], description="The caller's own passkeys.")
def list_passkeys(user=Depends(require_person("student", "guardian")), conn=Depends(get_conn)):
    return [passkeys.passkey_out(k) for k in conn.execute("SELECT * FROM passkeys ORDER BY id")]


@app.delete("/v1/passkeys/{passkey_id}", response_model=PasskeyOut, description="Revoke one of the caller's own passkeys.")
def revoke_passkey(passkey_id: int, request: Request, user=Depends(require_person("student", "guardian")), conn=Depends(get_conn)):
    k = conn.execute("SELECT * FROM revoke_own_passkey(%s)", (passkey_id,)).fetchone()
    if k is None:
        raise HTTPException(404, "Passkey not found")
    auth.audit(conn, user, "passkey.revoke", "passkey", passkey_id, student_id=user["student_id"], request=request)
    conn.commit()
    return passkeys.passkey_out(k)


@app.post("/v1/enrolments/{enrolment_id}/activation-code", response_model=ActivationCodeOut,
          description="Institution issues a one-time passkey activation code (7 days). A reason is required and shown in the "
                      "student's access log. Revokes earlier passkeys of that kind; any code after the first is a reissue (24 h "
                      "consent cooldown). Production: delivered via DigiLocker or the registered mobile number. Accepts "
                      "Idempotency-Key (a replay never returns the code).")
def activation_code(enrolment_id: int, body: ActivationCodeIn, request: Request, idempotency_key: str | None = Header(None),
                    user=Depends(require("institution_admin")), conn=Depends(get_conn)):
    req_hash = crypto.sha256_hex(f"{enrolment_id}|{body.model_dump_json()}".encode())
    return passkeys.issue_code(conn, user, enrolment_id, body.kind, body.reason, idempotency_key, req_hash)


@app.post("/v1/consents/{consent_id}/approve/options",
          description="WebAuthn options for approving this request; the challenge commits to the request's terms.")
def consent_approve_options(consent_id: int, user=Depends(require_person("student", "guardian")), conn=Depends(get_conn)):
    return consent.approve_options(conn, user, consent_id)


# ---------- webhooks (Req 7) ----------
@app.post("/v1/webhooks", response_model=WebhookCreated, status_code=201,
          description="Register an endpoint. The signing secret is returned once (Standard Webhooks). Max 5 active per "
                      "institution. Accepts Idempotency-Key.")
def create_webhook(body: WebhookIn, request: Request, idempotency_key: str | None = Header(None),
                   user=Depends(require("institution_admin")), conn=Depends(get_conn)):
    out = webhooks.register(conn, user, body.url, list(body.events), idempotency_key, crypto.sha256_hex(body.model_dump_json().encode()))
    auth.audit(conn, user, "webhook.create", "webhook_endpoint", out["id"], request=request)
    conn.commit()
    return out


@app.get("/v1/webhooks", response_model=list[WebhookOut], description="The institution's webhook endpoints (no secrets).")
def list_webhooks(user=Depends(require("institution_admin")), conn=Depends(get_conn)):
    return [webhooks.endpoint_out(w) for w in conn.execute("SELECT * FROM webhook_endpoints ORDER BY id")]


@app.delete("/v1/webhooks/{endpoint_id}", response_model=WebhookOut,
            description="Deactivate an endpoint and cancel its pending deliveries.")
def delete_webhook(endpoint_id: int, request: Request, user=Depends(require("institution_admin")), conn=Depends(get_conn)):
    out = webhooks.deactivate(conn, endpoint_id)
    auth.audit(conn, user, "webhook.delete", "webhook_endpoint", endpoint_id, request=request)
    conn.commit()
    return out


@app.post("/v1/webhooks/{endpoint_id}/rotate", response_model=WebhookCreated,
          description="New secret, returned once. The previous secret keeps signing (a second v1 signature) for 24 h.")
def rotate_webhook(endpoint_id: int, request: Request, user=Depends(require("institution_admin")), conn=Depends(get_conn)):
    out = webhooks.rotate(conn, endpoint_id)
    auth.audit(conn, user, "webhook.rotate", "webhook_endpoint", endpoint_id, request=request)
    conn.commit()
    return out


@app.get("/v1/webhooks/{endpoint_id}/deliveries", response_model=WebhookDeliveriesPage, description="Delivery log (cursor paged).")
def webhook_deliveries(endpoint_id: int, cursor: int = 0, limit: int = 100, user=Depends(require("institution_admin")),
                       conn=Depends(get_conn)):
    return webhooks.deliveries(conn, endpoint_id, cursor, max(1, min(limit, 500)))


@app.post("/v1/webhooks/deliveries/{delivery_id}/redeliver", response_model=WebhookDelivery,
          description="Queue another attempt now (same event id, freshly signed).")
def redeliver_webhook(delivery_id: int, request: Request, user=Depends(require("institution_admin")), conn=Depends(get_conn)):
    out = webhooks.redeliver(conn, delivery_id)
    auth.audit(conn, user, "webhook.redeliver", "webhook_delivery", delivery_id, request=request)
    conn.commit()
    return out


# ---------- verifiable credentials (Req 5, 6, 10) ----------
REGULATORS = ("aicte_officer", "auditor")


def _credential_out(conn, row, user) -> dict:
    vc = credentials.stored_credential(conn, row)
    if user["role"] in REGULATORS:  # masked by default (PRD §13): no name or student IDs, APAAR masked; full view needs unmask
        s = {k: v for k, v in vc["credentialSubject"].items() if k not in ("name", "studentId", "provisionalId")}
        if "apaarId" in s:
            s["apaarId"] = crypto.mask_apaar(s["apaarId"])
        vc = {**{k: v for k, v in vc.items() if k != "proof"}, "credentialSubject": s, "redacted": True}
    return {"id": row["id"], "type": row["type"], "issuer_did": row["issuer_did"], "issued_at": row["issued_at"],
            "status": credentials.credential_status(conn, row), "credential": vc}


@app.post("/v1/credentials/{enrolment_id}/issue", response_model=CredentialOut, status_code=201,
          description="EnrolmentCredential: the student's institution. DegreeCredential (completed enrolments): the affiliated "
                      "university registrar. Accepts Idempotency-Key.")
def issue_credential(enrolment_id: int, body: IssueIn, request: Request, idempotency_key: str | None = Header(None),
                     user=Depends(require("institution_admin", "university_registrar")), conn=Depends(get_conn)):
    vc, replayed = credentials.issue(conn, user, enrolment_id, body.type, idempotency_key)
    row = conn.execute("SELECT * FROM credentials WHERE id=%s", (vc["id"],)).fetchone()
    if not replayed:
        auth.audit(conn, user, "credential.issue", "credential", vc["id"], student_id=row["subject_student_id"], reason=body.type,
                   request=request)
        if user["role"] == "institution_admin":
            webhooks.emit(conn, "credential.issued", user["institution_id"], credential_id=row["id"], type=row["type"],
                          enrolment_id=row["enrolment_id"])
    conn.commit()
    out = CredentialOut(**_credential_out(conn, row, user)).model_dump(mode="json")
    return JSONResponse(out, status_code=200 if replayed else 201)


@app.get("/v1/credentials", response_model=list[CredentialOut],
         description="Credentials visible to the caller (issuer, subject student or regulator), optionally for one enrolment.")
def list_credentials(request: Request, enrolment_id: int | None = None,
                     user=Depends(require_person("institution_admin", "university_registrar", "student", "guardian", "aicte_officer", "auditor")),
                     conn=Depends(get_conn)):
    rows = conn.execute("SELECT * FROM credentials WHERE (%s::bigint IS NULL OR enrolment_id = %s) ORDER BY issued_at DESC LIMIT 200",
                        (enrolment_id, enrolment_id)).fetchall()
    if user["role"] != "student":  # a student viewing their own wallet isn't an access by someone else (D6 log stays meaningful)
        for r in rows:
            auth.audit(conn, user, "credential.read", "credential", r["id"], student_id=r["subject_student_id"], request=request)
        conn.commit()
    return [_credential_out(conn, r, user) for r in rows]


@app.get("/v1/credentials/certificate", response_model=CertificateOut,
         description="Printable certificate data (Req 10): the VC plus its offline QR ('AV1:' + Base45(zlib(VC))) as SVG.")
def credential_certificate(id: str, request: Request,
                           user=Depends(require_person("institution_admin", "university_registrar", "student", "guardian")), conn=Depends(get_conn)):
    row = conn.execute("SELECT * FROM credentials WHERE id=%s", (id,)).fetchone()  # RLS: issuer or subject only
    if row is None:
        raise HTTPException(404, "Credential not found")
    vc = credentials.stored_credential(conn, row)
    payload = credentials.qr_payload(vc)
    auth.audit(conn, user, "credential.certificate", "credential", row["id"], student_id=row["subject_student_id"], request=request)
    conn.commit()
    return {"credential": vc, "qr_payload": payload, "qr_payload_chars": len(payload), "qr_svg": credentials.qr_svg(payload)}


@app.post("/v1/credentials/status", response_model=CredentialOut,
          description="Issuer revokes/suspends (or un-suspends) one of its own credentials via the Bitstring Status List.")
def change_credential_status(body: CredentialStatusIn, request: Request,
                             user=Depends(require("institution_admin", "university_registrar")), conn=Depends(get_conn)):
    row = conn.execute("SELECT * FROM credentials WHERE id=%s", (body.credential_id,)).fetchone()
    if row is None or not conn.execute("SELECT app_may_issue_for(%s) ok", (row["issuer_did"],)).fetchone()["ok"]:
        raise HTTPException(404, "Credential not found")
    if body.purpose == "revocation" and not body.value:
        raise HTTPException(422, "Revocation is permanent; issue a new credential instead")
    conn.execute("SELECT set_credential_status(%s, %s, %s)", (row["id"], body.purpose, body.value))
    if body.purpose == "revocation" and user["role"] == "institution_admin":
        webhooks.emit(conn, "credential.revoked", user["institution_id"], credential_id=row["id"], enrolment_id=row["enrolment_id"],
                      reason="revoked_by_issuer")
    auth.audit(conn, user, f"credential.{body.purpose}.{'set' if body.value else 'clear'}", "credential", row["id"],
               student_id=row["subject_student_id"], reason=body.reason, request=request)
    conn.commit()
    return _credential_out(conn, row, user)


@app.post("/v1/verify", response_model=VerifyOut,
          description="Online verification helper. The same checks can be run offline with the signed registry snapshot and status lists.")
def verify_credential(body: VerifyIn, request: Request,
                      user=Depends(require("verifier", "aicte_officer", "auditor", "institution_admin", "university_registrar", "student")),
                      conn=Depends(get_conn)):
    vc = body.credential
    if vc is None and body.qr:
        try:
            vc = credentials.from_qr_payload(body.qr.strip())
        except (ValueError, zlib.error, json.JSONDecodeError, UnicodeDecodeError):
            vc = {}
    if not isinstance(vc, dict):
        raise HTTPException(422, "Give credential (JSON) or qr (AV1 text)")
    out = credentials.verify(conn, vc)
    cred_id = vc.get("id") if isinstance(vc.get("id"), str) else ""
    # linked to the student only if this is exactly the stored credential (see log_verification)
    h = credentials.vc_hash(vc) if out["checks"]["signature_valid"] else None
    conn.execute("SELECT log_verification(%s, %s, %s, %s)", (cred_id, h, out["result"], request.state.request_id))
    conn.commit()
    return out


@app.get("/status/{list_id}", description="Public, cacheable: signed BitstringStatusListCredential.")
def status_list(list_id: str, conn=Depends(get_conn)):
    vc = credentials.status_list_credential(conn, list_id)
    if vc is None:
        raise HTTPException(404, "Status list not found")
    return JSONResponse(vc, headers={"Cache-Control": "public, max-age=60"})


@app.get("/v1/registry/issuers", response_model=list[RegistryIssuer], description="Public trust registry (MOCK, D4).")
def registry_issuers(conn=Depends(get_conn)):
    return [credentials.registry_entry(r) for r in conn.execute("SELECT * FROM issuer_registry ORDER BY did")]


@app.get("/v1/registry/snapshot", description="Public: AICTE-signed registry snapshot for offline verifiers, plus the AICTE key.")
def registry_snapshot(conn=Depends(get_conn)):
    return {"snapshot": credentials.registry_snapshot(conn), "aicte_public_key": credentials.registry_public_key()}


@app.get("/dids/{path:path}/did.json", description="did:web style DID documents, e.g. /dids/inst/1-0000000001/did.json")
def did_doc(path: str, conn=Depends(get_conn)):
    host = conn.execute("SELECT split_part(did, ':', 3) h FROM issuer_registry LIMIT 1").fetchone()
    doc = credentials.did_document(conn, f"did:web:{host['h']}:" + path.replace("/", ":")) if host else None
    if doc is None:
        raise HTTPException(404, "DID not found")
    return doc


@app.get("/v1/demo/forged-credential", description="DEMO ONLY: a credential signed by an issuer outside the registry.")
def demo_forged(user=Depends(require("verifier", "aicte_officer", "auditor"))):
    return credentials.forged_credential()


# ---------- consent (Req 5, 8; D5) ----------
def _consent_out(conn, k, user) -> dict:
    cid = conn.execute("SELECT id FROM credentials WHERE consent_id=%s", (k["id"],)).fetchone()  # visible to the student only
    return consent.consent_out(k, cid["id"] if cid else None, user["role"])


@app.post("/v1/consents/requests", response_model=ConsentOut, status_code=201,
          description="Verifier asks a student (by APAAR ID) to share specific fields for a stated purpose. The response is "
                      "the same whether or not the APAAR is registered; rate-limited (20/hour per verifier) and audit-logged.")
def consent_request(body: ConsentRequestIn, request: Request, user=Depends(require("verifier")), conn=Depends(get_conn)):
    apaar = body.apaar_id.replace(" ", "").replace("-", "")
    if not (apaar.isdigit() and len(apaar) == 12):
        raise HTTPException(422, "APAAR ID must be 12 digits")
    k = consent.request(conn, user, apaar, body.purpose, list(body.fields), body.valid_days, request.state.request_id)
    conn.commit()
    return consent.consent_out(k, None, user["role"])


@app.get("/v1/consents", response_model=list[ConsentOut],
         description="Verifier: its own requests. Student: requests about them. Regulators: all.")
def consent_list(user=Depends(require_person("verifier", "student", "guardian", "aicte_officer", "auditor")), conn=Depends(get_conn)):
    if user["role"] == "verifier":  # never sees student_id (no "is this APAAR registered" signal)
        return [consent.consent_out(k, None, "verifier") for k in consent.verifier_requests(conn)]
    rows = conn.execute("SELECT * FROM consents ORDER BY requested_at DESC LIMIT 200").fetchall()
    return [_consent_out(conn, k, user) for k in rows]


@app.post("/v1/consents/{consent_id}/approve", response_model=ConsentCredentialOut,
          description="Student (or the guardian, if the student is under 18) approves with a passkey assertion bound to this "
                      "request; mints the scoped VerificationCredential. The MOCK OTP body works only in DEMO_MODE.")
def consent_approve(consent_id: int, body: ConsentApprove, request: Request, user=Depends(require_person("student", "guardian")),
                    conn=Depends(get_conn)):
    k, vc = consent.approve(conn, user, consent_id, body.model_dump())
    auth.audit(conn, user, "consent.grant", "consent", k["id"], student_id=k["student_id"], reason=f"granted by {k['granted_by']}",
               request=request)
    conn.commit()
    return {"consent": consent.consent_out(k, vc["id"]), "credential": vc}


@app.post("/v1/consents/{consent_id}/deny", response_model=ConsentOut)
def consent_deny(consent_id: int, request: Request, user=Depends(require_person("student", "guardian")), conn=Depends(get_conn)):
    k = consent.deny(conn, user, consent_id)
    auth.audit(conn, user, "consent.deny", "consent", k["id"], student_id=k["student_id"], request=request)
    conn.commit()
    return _consent_out(conn, k, user)


@app.post("/v1/consents/{consent_id}/revoke", response_model=ConsentOut,
          description="Student withdraws consent; the VerificationCredential is revoked via the status list.")
def consent_revoke(consent_id: int, request: Request, user=Depends(require_person("student", "guardian")), conn=Depends(get_conn)):
    k = consent.revoke(conn, user, consent_id)
    auth.audit(conn, user, "consent.revoke", "consent", k["id"], student_id=k["student_id"], request=request)
    conn.commit()
    return _consent_out(conn, k, user)


@app.get("/v1/consents/{consent_id}/credential", description="Verifier fetches the VerificationCredential for its granted consent.")
def consent_credential(consent_id: int, request: Request, user=Depends(require("verifier")), conn=Depends(get_conn)):
    out = consent.verifier_credential(conn, consent_id)
    conn.execute("SELECT log_verification(%s, %s, %s, %s)",
                 (out["id"], credentials.vc_hash(out["vc"]), "consent-credential-fetch", request.state.request_id))
    conn.commit()
    return out["vc"]


# ---------- student self-service (D6) ----------
@app.get("/v1/students/me", response_model=StudentProfile)
def student_me(user=Depends(require_person("student", "guardian")), conn=Depends(get_conn)):
    s = conn.execute("SELECT apaar_masked, provisional_id, apaar_status FROM students WHERE id=%s", (user["student_id"],)).fetchone()
    if s is None:
        raise HTTPException(404, "Student not found")
    ens = conn.execute("SELECT p.name programme, i.name institution, e.academic_year, e.status, e.institution_student_id "
                       "FROM enrolments e JOIN programmes p ON p.id=e.programme_id JOIN institutions i ON i.id=p.institution_id "
                       "WHERE e.student_id=%s ORDER BY e.id DESC", (user["student_id"],)).fetchall()
    return {**s, "enrolments": ens, "passkey_cooldown_until": passkeys.cooldown_until(conn), "viewer": user["role"]}


@app.get("/v1/students/me/access-log", response_model=list[AccessLogEntry],
         description="D6 transparency: every recorded access to the student's data (reads, exports, verifications, consents).")
def student_access_log(user=Depends(require_person("student", "guardian")), conn=Depends(get_conn)):
    return conn.execute("SELECT ts, actor, role, action, reason, entity, entity_id FROM audit_logs WHERE student_id=%s "
                        "ORDER BY ts DESC LIMIT 500", (user["student_id"],)).fetchall()
