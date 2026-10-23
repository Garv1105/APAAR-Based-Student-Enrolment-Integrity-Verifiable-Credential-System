"""FastAPI app. Run: `uvicorn app.main:app --reload` from backend/."""
import csv
import io
import uuid

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import ValidationError

from . import auth, consent, credentials, crypto, dashboards, db, i18n, ingest, ledger
from .auth import require
from .contracts import (CSV_COLUMNS, AccessLogEntry, AicteDashboard, BatchJsonIn, BatchOut, CheckpointOut, ConsentApprove,
                        ConsentCredentialOut, ConsentOut, ConsentRequestIn, CredentialOut, CredentialStatusIn, EnrolmentOut,
                        EnrolmentPatch, InstitutionDashboard, IssueIn, IssuesPage, LedgerVerifyOut, LoginIn, LoginOut,
                        ProgrammeSeats, RegistryIssuer, StudentLoginIn, StudentProfile, VerifyIn, VerifyOut)
from .validation import missing_columns

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_ROWS = 50_000

app = FastAPI(title="APAAR Student Data & Verification Platform (SIH26263 prototype)", version="0.1.0",
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


@app.exception_handler(credentials.CredentialError)
async def credential_problem(_, exc: credentials.CredentialError):
    return problem(exc.status, exc.detail)


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
          description="MOCK student sign-in: APAAR ID + fixed demo OTP (123456). Production: APAAR/DigiLocker authentication.")
def student_login(body: StudentLoginIn, conn=Depends(get_conn)):
    out = auth.student_login(conn, body.apaar_id.replace(" ", "").replace("-", ""), body.otp)
    if out is None:
        raise HTTPException(401, "Invalid APAAR ID or OTP")
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
         description="Own institution only. Lookup by APAAR or institution student id.")
def find_enrolments(request: Request, apaar: str | None = None, student_id: str | None = None,
                    user=Depends(require("institution_admin")), conn=Depends(get_conn)):
    if not apaar and not student_id:
        raise HTTPException(422, "Give apaar or student_id")
    rows = conn.execute(
        "SELECT e.* FROM enrolments e JOIN students s ON s.id=e.student_id JOIN programmes p ON p.id=e.programme_id "
        "WHERE p.institution_id=%s AND (s.apaar_bi=%s OR e.institution_student_id=%s) ORDER BY e.id",
        (user["institution_id"], crypto.apaar_bi(apaar) if apaar else None, student_id)).fetchall()
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


# ---------- verifiable credentials (Req 5, 6, 10) ----------
REGULATORS = ("aicte_officer", "auditor")


def _credential_out(conn, row, user) -> dict:
    vc = credentials.stored_credential(conn, row)
    if user["role"] in REGULATORS:  # masked by default (PRD §13): no name, APAAR masked; full view needs an unmask with reason
        s = {k: v for k, v in vc["credentialSubject"].items() if k != "name"}
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
    conn.commit()
    out = CredentialOut(**_credential_out(conn, row, user)).model_dump(mode="json")
    return JSONResponse(out, status_code=200 if replayed else 201)


@app.get("/v1/credentials", response_model=list[CredentialOut],
         description="Credentials visible to the caller (issuer, subject student or regulator), optionally for one enrolment.")
def list_credentials(request: Request, enrolment_id: int | None = None,
                     user=Depends(require("institution_admin", "university_registrar", "student", "aicte_officer", "auditor")),
                     conn=Depends(get_conn)):
    rows = conn.execute("SELECT * FROM credentials WHERE (%s::bigint IS NULL OR enrolment_id = %s) ORDER BY issued_at DESC LIMIT 200",
                        (enrolment_id, enrolment_id)).fetchall()
    for r in rows:
        auth.audit(conn, user, "credential.read", "credential", r["id"], student_id=r["subject_student_id"], request=request)
    conn.commit()
    return [_credential_out(conn, r, user) for r in rows]


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
    auth.audit(conn, user, f"credential.{body.purpose}.{'set' if body.value else 'clear'}", "credential", row["id"],
               student_id=row["subject_student_id"], reason=body.reason, request=request)
    conn.commit()
    return _credential_out(conn, row, user)


@app.post("/v1/verify", response_model=VerifyOut,
          description="Online verification helper. The same checks can be run offline with the signed registry snapshot and status lists.")
def verify_credential(body: VerifyIn, request: Request,
                      user=Depends(require("verifier", "aicte_officer", "auditor", "institution_admin", "university_registrar", "student")),
                      conn=Depends(get_conn)):
    out = credentials.verify(conn, body.credential)
    cred_id = body.credential.get("id") if isinstance(body.credential.get("id"), str) else ""
    # linked to the student only if this is exactly the stored credential (see log_verification)
    h = credentials.vc_hash(body.credential) if out["checks"]["signature_valid"] else None
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
def _consent_out(conn, k) -> dict:
    cid = conn.execute("SELECT id FROM credentials WHERE consent_id=%s", (k["id"],)).fetchone()  # visible to the student only
    return consent.consent_out(k, cid["id"] if cid else None)


@app.post("/v1/consents/requests", response_model=ConsentOut, status_code=201,
          description="Verifier asks a student (by APAAR ID) to share specific fields for a stated purpose.")
def consent_request(body: ConsentRequestIn, request: Request, user=Depends(require("verifier")), conn=Depends(get_conn)):
    apaar = body.apaar_id.replace(" ", "").replace("-", "")
    if not (apaar.isdigit() and len(apaar) == 12):
        raise HTTPException(422, "APAAR ID must be 12 digits")
    k = consent.request(conn, user, apaar, body.purpose, list(body.fields), body.valid_days)
    auth.audit(conn, user, "consent.request", "consent", k["id"], student_id=k["student_id"], reason=body.purpose, request=request)
    conn.commit()
    return _consent_out(conn, k)


@app.get("/v1/consents", response_model=list[ConsentOut],
         description="Verifier: its own requests. Student: requests about them. Regulators: all.")
def consent_list(user=Depends(require("verifier", "student", "aicte_officer", "auditor")), conn=Depends(get_conn)):
    rows = conn.execute("SELECT * FROM consents ORDER BY requested_at DESC LIMIT 200").fetchall()
    return [_consent_out(conn, k) for k in rows]


@app.post("/v1/consents/{consent_id}/approve", response_model=ConsentCredentialOut,
          description="Student (or guardian, if under 18) approves with the MOCK OTP; mints the scoped VerificationCredential.")
def consent_approve(consent_id: int, body: ConsentApprove, request: Request, user=Depends(require("student")), conn=Depends(get_conn)):
    k, vc = consent.approve(conn, user, consent_id, body.otp, body.approved_by, body.guardian_otp)
    auth.audit(conn, user, "consent.grant", "consent", k["id"], student_id=k["student_id"], reason=f"granted by {k['granted_by']}",
               request=request)
    conn.commit()
    return {"consent": consent.consent_out(k, vc["id"]), "credential": vc}


@app.post("/v1/consents/{consent_id}/deny", response_model=ConsentOut)
def consent_deny(consent_id: int, request: Request, user=Depends(require("student")), conn=Depends(get_conn)):
    k = consent.deny(conn, user, consent_id)
    auth.audit(conn, user, "consent.deny", "consent", k["id"], student_id=k["student_id"], request=request)
    conn.commit()
    return _consent_out(conn, k)


@app.post("/v1/consents/{consent_id}/revoke", response_model=ConsentOut,
          description="Student withdraws consent; the VerificationCredential is revoked via the status list.")
def consent_revoke(consent_id: int, request: Request, user=Depends(require("student")), conn=Depends(get_conn)):
    k = consent.revoke(conn, user, consent_id)
    auth.audit(conn, user, "consent.revoke", "consent", k["id"], student_id=k["student_id"], request=request)
    conn.commit()
    return _consent_out(conn, k)


@app.get("/v1/consents/{consent_id}/credential", description="Verifier fetches the VerificationCredential for its granted consent.")
def consent_credential(consent_id: int, request: Request, user=Depends(require("verifier")), conn=Depends(get_conn)):
    out = consent.verifier_credential(conn, consent_id)
    conn.execute("SELECT log_verification(%s, %s, %s, %s)",
                 (out["id"], credentials.vc_hash(out["vc"]), "consent-credential-fetch", request.state.request_id))
    conn.commit()
    return out["vc"]


# ---------- student self-service (D6) ----------
@app.get("/v1/students/me", response_model=StudentProfile)
def student_me(user=Depends(require("student")), conn=Depends(get_conn)):
    s = conn.execute("SELECT apaar_masked, provisional_id, apaar_status FROM students WHERE id=%s", (user["student_id"],)).fetchone()
    if s is None:
        raise HTTPException(404, "Student not found")
    ens = conn.execute("SELECT p.name programme, i.name institution, e.academic_year, e.status, e.institution_student_id "
                       "FROM enrolments e JOIN programmes p ON p.id=e.programme_id JOIN institutions i ON i.id=p.institution_id "
                       "WHERE e.student_id=%s ORDER BY e.id DESC", (user["student_id"],)).fetchall()
    return {**s, "enrolments": ens}


@app.get("/v1/students/me/access-log", response_model=list[AccessLogEntry],
         description="D6 transparency: every recorded access to the student's data (reads, exports, verifications, consents).")
def student_access_log(user=Depends(require("student")), conn=Depends(get_conn)):
    return conn.execute("SELECT ts, actor, role, action, reason, entity, entity_id FROM audit_logs WHERE student_id=%s "
                        "ORDER BY ts DESC LIMIT 500", (user["student_id"],)).fetchall()
