"""FastAPI app. Run: `uvicorn app.main:app --reload` from backend/."""
import csv
import io
import uuid

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import ValidationError

from . import auth, crypto, dashboards, db, i18n, ingest, ledger
from .auth import require
from .contracts import (AicteDashboard, BatchJsonIn, BatchOut, EnrolmentOut, EnrolmentPatch, InstitutionDashboard, IssuesPage,
                        LoginIn, LoginOut, ProgrammeSeats)
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


@app.exception_handler(ingest.PatchError)
async def patch_problem(_, exc: ingest.PatchError):
    return problem(exc.status, exc.detail)


def get_conn():
    # ponytail: connection per request; add psycopg_pool if load testing shows connect cost matters
    with db.connect() as conn:
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


# ---------- ingestion ----------
@app.post("/v1/batches", response_model=BatchOut, status_code=201,
          description="CSV (multipart field 'file' or text/csv body) or JSON {rows:[...]}. Validation runs synchronously.")
async def create_batch(request: Request, idempotency_key: str | None = Header(None),
                       user=Depends(require("institution_admin")), conn=Depends(get_conn)):
    ctype = request.headers.get("content-type", "")
    if ctype.startswith("application/json"):
        try:
            rows = [r.model_dump() for r in BatchJsonIn.model_validate_json(await request.body()).rows]
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
    out = ingest.process_batch(conn, user, rows, channel, idempotency_key, request)
    return JSONResponse(BatchOut(**out).model_dump(mode="json"), status_code=200 if out["replayed"] else 201)


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


@app.get("/v1/ledger/verify")
def ledger_verify(user=Depends(require("aicte_officer", "auditor")), conn=Depends(get_conn)):
    return ledger.verify(conn)


@app.post("/v1/ledger/checkpoints")
def ledger_checkpoint(user=Depends(require("aicte_officer")), conn=Depends(get_conn)):
    cp = ledger.checkpoint(conn)
    conn.commit()
    return cp


@app.get("/v1/ledger/checkpoints/latest")
def ledger_latest(conn=Depends(get_conn)):
    """Public: latest signed checkpoint, plus the AICTE ledger public key."""
    cp = conn.execute("SELECT upto_seq, root_hash, aicte_sig, published_at FROM ledger_checkpoints ORDER BY id DESC LIMIT 1").fetchone()
    return {"checkpoint": cp, "public_key": crypto.public_multikey(crypto.signing_key(ledger.SIGNER))}
