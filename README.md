# APAAR-Based Student Enrolment Integrity & Verifiable Credential System

Prototype for **Smart India Hackathon problem statement SIH26263**: an APAAR ID-based student data management and verification platform for AICTE-approved institutions.

> *Every seat accounted for, every record verifiable, without moving more personal data than necessary.*

Institutions upload student-level records keyed by **APAAR ID**. The platform validates every row deterministically, enforces approved intake and supernumerary caps from the AICTE registry, detects duplicate enrolment within and across institutions, keeps a tamper-evident seat ledger, and gives AICTE and institutions live monitoring data.

> **Prototype status: read this first.**
> - All student data is **synthetic**.
> - The APAAR registry, the AICTE approval (EOA) registry, OTP and the identity provider are **mocks**, labelled `MOCK` in API responses.
> - There is **no** integration with real APAAR, ABC, DigiLocker or AICTE systems.
> - The design follows the principles of the DPDP Act 2023. It has **not** been assessed for compliance.
> - The full flow is built and tested, from upload and validation through monitoring to verifiable credentials, consent and certificates, in both the backend and the web UI. Reports, anomaly detection and some integrations are still open (see [Status](#status)).

---

## Contents
- [The problem](#the-problem)
- [Status](#status)
- [Architecture](#architecture)
- [Quick start (Windows)](#quick-start-windows)
- [Trying the API](#trying-the-api)
- [Validation rules](#validation-rules)
- [Security and privacy model](#security-and-privacy-model)
- [Tests and evaluation](#tests-and-evaluation)
- [Repository layout](#repository-layout)
- [Known limitations](#known-limitations)
- [Documents](#documents)

---

## The problem

AICTE gets detailed student data only from PGDM institutions. Other approved institutions mostly report totals ("480 enrolled"). From totals alone, AICTE can't detect excess admission, double enrolment across institutions, or unverifiable records.

The flow the problem statement asks for:

```
Institution → Student Data Upload → APAAR Validation → Data Verification
           → AICTE Central Repository → Analytics & Monitoring → Authorized Verification
```

## Status

How far each PS requirement has got, with the evidence in the test suite:

| PS requirement | Status | Evidence |
|---|---|---|
| 1. Secure upload/API keyed by APAAR, and updates | ✅ Backend | CSV and JSON batch upload, `Idempotency-Key`, `PATCH` withdraw/migrate/correct |
| 2. Approved intake, enrolment, supernumerary, NRI/OCI/FN fields | ✅ | Approved intake comes from the registry only. FN/OCI/CIWG supernumerary pool at 15% of intake, with a 1/3 CIWG sub-cap |
| 3. Duplicates, invalid/missing APAAR, excess intake, inconsistencies, cross-institution duplicates | ✅ | 19 validation codes (incl. student-ID E105/E205), one unit test each. Labelled scenario passes 455/455 rows through the API |
| 4. Real-time dashboards (AICTE + institutions) | ✅ | Institution and AICTE web dashboards that refresh every 3 s by polling (no SSE push yet) |
| 5. Secure verification for stakeholders | ✅ | `POST /v1/verify`: VALID / REVOKED / SUSPENDED / UNTRUSTED_ISSUER / TAMPERED / EXPIRED. Employer access is consent-gated. AICTE and the auditor get masked data. Verifier web page |
| 6. Verifiable student records | ✅ | W3C VC 2.0 Enrolment, Degree and consent-scoped Verification credentials, `eddsa-jcs-2022`. Byte-for-byte match with the **official W3C test vectors**. Trust registry (MOCK) and Bitstring Status Lists |
| 7. Integration/API | 🟡 | REST API + OpenAPI, public status lists, DID documents and a signed registry snapshot. Webhooks and the ERP connector are deferred |
| 8. Security, privacy, auth, RBAC, audit, consent | ✅ | JWT, role guard, Postgres RLS, field encryption, audit log, seat ledger. Consent with OTP (MOCK), guardian path for under-18s (MOCK, self-asserted). Student transparency log |
| 9. Reports | 🟡 | Per-batch error report CSV. Policy/accreditation reports planned |
| 10. APAAR ID + student ID on certificates | ✅ | Printable certificate showing both IDs in full, with a QR holding the signed credential (`AV1:` + Base45(zlib), RFC 9285). Measured at 1,012 chars, which fits one QR at error-correction level M |

Day-to-day progress, blockers and limitations are tracked in [`TASKS.md`](TASKS.md). What is in or out of scope is in [`MVP_SCOPE.md`](MVP_SCOPE.md).

## Architecture

```
Institution / AICTE / Verifier clients
        │  HTTPS + JWT (role, institution)
        ▼
FastAPI app (backend/app)
  ├─ ingest.py        one transaction per batch; counter row locks; per-APAAR advisory locks
  ├─ validation.py    deterministic rules + intake engine (pure functions, no DB, no AI)
  ├─ ledger.py        hash-chained enrolment events + Ed25519-signed checkpoints
  ├─ dashboards.py    institution and AICTE aggregates
  ├─ crypto.py        AES-256-GCM fields, HMAC blind indexes, Ed25519, JCS (RFC 8785)
  └─ mocks.py         MockApaarRegistry  (AICTE EOA registry = seeded tables)
        │  connects as app_user (non-owner, NOBYPASSRLS)
        ▼
PostgreSQL 18: schema.sql + rls.sql (FORCE row-level security, SECURITY DEFINER cross-institution functions)
```

**Stack:** React 19 + TypeScript + Vite + Tailwind CSS 4 + Recharts (frontend); Python 3.14, FastAPI, psycopg 3 (raw SQL), PostgreSQL 18, `cryptography`, `rfc8785`, `rapidfuzz`, `jellyfish`, `argon2-cffi`, PyJWT. Exact versions are pinned in `requirements.txt`.

**Design rules** (full list in [`CLAUDE.md`](CLAUDE.md)):
- Validity, seat limits and duplicate detection are decided by deterministic code. No LLM decides anything.
- Approved intake comes **only** from the AICTE registry, never from the upload. A mismatched declaration raises `E303`.
- Every accepted row counts toward intake, with or without an APAAR ID. Leaving out an APAAR never hides a student.
- Cross-institution duplicate notices reveal nothing about the other institution.

## Quick start (Windows)

**Prerequisites:** Python 3.14 (via the `py` launcher) and PostgreSQL 16 or later running locally. Docker isn't required.

```powershell
# 1. Python environment
py -3.14 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

# 2. Database admin credentials (never committed; backend/.env is gitignored)
#    Create backend\.env with ONE line (an unencoded '@' in the password is fine):
#    DATABASE_URL=postgresql://postgres:<password>@localhost:5432/postgres

# 3. Create the 'apaar' database, the non-owner 'app_user' role, schema + RLS, and seed the mock registry
cd backend
..\.venv\Scripts\python.exe -m app.seed --reset

# 4. Run the API
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
# → http://127.0.0.1:8000/docs  (Swagger UI)
```

```powershell
# 5. Web UI (second terminal; Node 20+). The dev server proxies /v1 to the API on :8000
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

**Web UI pages:**
- **Sign-in:** pick a demo identity.
- **Institution:** drag-and-drop CSV upload with instant validation results, plus a downloadable template. Re-uploading the same file returns the original batch (the Idempotency-Key is the file's SHA-256). Also shows seats vs approved intake per category with over-cap highlighting, neutral AICTE notices, and upload history.
- **Batch issues:** row-level issues with severity and code filters, fix hints, and a CSV report.
- **AICTE / auditor:** national totals, fill by state, excess-admission ranking, category mix, upload compliance, and seat-ledger verify / sign checkpoint.
- **Institution student records:** find a student by APAAR ID or student ID, issue an enrolment credential, mark the enrolment completed or withdrawn (withdrawal revokes their credentials), and suspend a credential or lift the suspension.
- **Student** (MOCK sign-in with APAAR ID + date of birth; consent approval uses OTP `123456`): enrolments, credential wallet, the consent inbox (approve, deny, revoke, guardian path), a printable certificate with QR, and **who accessed my data**.
- **Verifier** (`employer`): request consent for specific fields, fetch and verify the consent-scoped credential, a verify tool (paste JSON or the certificate QR text), and a forged-credential demo.
- **University registrar** (`univ`): award degree credentials to affiliated institutions' students whose enrolment is completed.
- **Verify a credential:** available from the header for AICTE, the auditor, institutions and the registrar.

**Credentials demo in 2 minutes:**
1. Sign in as `inst-a`, upload `A1.csv`, find a student, and issue an enrolment credential.
2. As `employer`, request consent with that student's APAAR ID.
3. Sign in as the student with their APAAR ID and date of birth (both in `A1.csv`), then approve with OTP `123456`.
4. As `employer`, fetch and verify: the result is **VALID**.
5. As `inst-a`, withdraw the student, then verify again as `employer`: the result is **REVOKED**.
6. As `inst-a`, mark another student completed. As `univ`, award the degree and open **Certificate & QR**.
7. As `aicte`, open **Verify a credential** and try the forged credential: the result is **UNTRUSTED ISSUER**.

API types in `frontend/src/api/schema.d.ts` are generated from `backend/openapi.json` with `npm run gen:api`. Never edit them by hand.

On first run, the app generates:
- `APP_DB_PASSWORD`, appended to `backend/.env`, for the `app_user` role
- `backend/.keys.json`, holding the encryption, blind-index, JWT and signing keys

Both files are gitignored. For a production deployment, keys belong in a KMS/HSM.

`app.seed --reset` **drops and rebuilds** the demo database. Use it after any schema change, because there are no migrations.

### Demo users (MOCK identity provider; password `demo`)

| User | Role | Scope |
|---|---|---|
| `inst-a` | institution_admin | Demo Institute of Technology (clean data) |
| `inst-b` | institution_admin | Sample College of Engineering (messy data) |
| `inst-c` | institution_admin | Example School of Management (enrolment spike) |
| `inst-d` | institution_admin | Closed Polytechnic (not approved) |
| `aicte` | aicte_officer | National monitoring |
| `auditor` | auditor | Read-only regulator |
| `employer` | verifier | Consent-based credential verification |
| `univ` | university_registrar | Degree issuance for affiliated institutions A and B |
| *(any uploaded student)* | student | APAAR ID + date of birth from the upload (MOCK) |

## Trying the API

```powershell
# Log in and upload Institution B's messy file
$tok = (Invoke-RestMethod -Method Post http://127.0.0.1:8000/v1/auth/login `
        -ContentType application/json -Body '{"user_id":"inst-b","password":"demo"}').access_token
curl.exe -s -H "Authorization: Bearer $tok" -H "Idempotency-Key: demo-1" `
        -F "file=@data/synthetic/B1.csv" http://127.0.0.1:8000/v1/batches
# Then fetch the row-level error report:
curl.exe -s -H "Authorization: Bearer $tok" http://127.0.0.1:8000/v1/batches/<batch_id>/report.csv
```

| Method | Path | Who |
|---|---|---|
| POST | `/v1/auth/login` | anyone |
| POST | `/v1/batches` | institution_admin. CSV (multipart `file` or `text/csv`) or JSON `{rows:[…]}`, plus `Idempotency-Key` |
| GET | `/v1/batches/template.csv` | institution_admin. Empty upload template (header row) |
| GET | `/v1/batches/{id}`, `/issues`, `/report.csv?lang=en` | own institution, AICTE, auditor |
| GET | `/v1/enrolments?apaar=…` or `?student_id=…` | institution_admin, own institution only |
| PATCH | `/v1/enrolments/{id}` | institution_admin. Withdraw/migrate/correct, recorded in the ledger, `E501` after deadline |
| GET | `/v1/programmes/{id}/seats` | own institution, AICTE, auditor |
| GET | `/v1/dashboard/institution` | institution_admin |
| GET | `/v1/dashboard/aicte` | aicte_officer, auditor |
| GET | `/v1/ledger/verify` | aicte_officer, auditor |
| POST | `/v1/ledger/checkpoints` | aicte_officer |
| GET | `/v1/ledger/checkpoints/latest` | public |

Errors use `application/problem+json`. The contract source is [`backend/app/contracts.py`](backend/app/contracts.py), and [`backend/openapi.json`](backend/openapi.json) is generated from it.

## Validation rules

Rules run in layers: schema → format → referential → registry (mock) → business rules → duplicates → intake engine. **Errors** block the row, **warnings** let it through, and **flags** let it through but raise it for AICTE review.

| Code | Meaning | Severity |
|---|---|---|
| E001 | Field missing or not parseable | error |
| E101 / E101W | APAAR missing with no reason / with REFUSED, NOT_GENERATED or PENDING (row still counted) | error / warning |
| E102 / E103 / E104 | Bad APAAR format / not in registry / name or DOB mismatch | error / error / warning |
| E105 | Institution student ID blank (it is printed on certificates, Req 10) | error |
| E205 | Student ID already used in this file or by an active enrolment at the same institution (case- and space-insensitive) | error |
| E201 / E202 | Duplicate within the file / already enrolled at this institution | error |
| E203 | Active enrolment at another institution (neutral notice to both sides) | flag |
| E301 / E302 | Regular seats over approved intake / supernumerary cap or CIWG sub-cap exceeded | flag |
| E303 | Declared intake differs from the AICTE registry | flag |
| E304 | Institution not approved, or programme not approved this year | error |
| E401 | Inconsistent NRI/OCI/FN/CIWG flags or seat category | error |
| E402 / E403 | Implausible age / admission date outside the window | warning |
| E404 | Lateral entry outside year 2 | error |
| E501 | Enrolment changed after the submission deadline | flag |

Codes are defined in [`backend/app/codes.py`](backend/app/codes.py). Message text and fix hints come from [`backend/i18n/en.json`](backend/i18n/en.json).

## Security and privacy model

What is implemented and tested:
- **Institution isolation in the database.** The app connects as `app_user`, which isn't the owner, isn't a superuser and has no `BYPASSRLS`. Every institution-scoped table uses `FORCE ROW LEVEL SECURITY`. Cross-institution checks (duplicate lookup, shared person rows, case opening, ledger appends) run only through narrow `SECURITY DEFINER` functions that check the caller's role and institution. Tests confirm with raw SQL that institution B sees none of A's rows and can't write to them.
- **Field encryption.** APAAR ID, name, DOB and guardian name use AES-256-GCM, with the associated data bound to `table|column|row_id`. Lookups use separate HMAC-SHA256 blind indexes, and APAAR is displayed masked (`XXXX-XXXX-0042`).
- **Seat ledger.** Each enrolment create/update is hash-chained, and AICTE signs checkpoints with Ed25519. Verification also compares live rows against their last ledger event. A silent edit, delete or history rewrite is detected, and a test proves it.
- **Auth and roles.** Passwords are hashed with Argon2. JWTs are HS256. A role guard protects every endpoint, and an access-matrix test covers every endpoint × every role, including wrong-institution access.
- **Audit log.** Uploads, record reads, exports and updates are logged with actor, role, reason and request id.
- **Safe exports.** CSV formula-injection characters are neutralised in exports.
- **Verifiable credentials.**
  - Signing uses W3C Data Integrity `eddsa-jcs-2022`, checked byte for byte against the official W3C test vectors (pinned in `backend/tests/vectors/`).
  - An issuer is trusted only if it is in the AICTE registry and was approved when the credential was issued.
  - Revocation and suspension use W3C Bitstring Status Lists: 131,072 entries (the spec minimum), random indexes from a CSPRNG, and signed public lists that expire after 24 h.
  - Stored credentials are encrypted.
  - Consent-scoped credentials carry only the fields the student approved. The issuing institution can't see them.
  - A verification is linked to a student's access log only when the exact stored credential is presented.
  - **No APAAR existence oracle.** A verifier's consent request gets the same response whether or not the APAAR is registered. Unmatched requests simply stay pending, exactly like unanswered ones. Requests are rate-limited (20/hour per verifier) and audit-logged. Verifiers never see `student_id`, even at the SQL level.
- **Crypto against standard vectors.** The primitives are checked against RFC 8032 (Ed25519), RFC 4231 (HMAC), the McGrew–Viega GCM vectors and the RFC 8785 (JCS) example.

Security reviews of the RLS, credential and consent changes found no high-severity issues. All medium findings are fixed. The open low findings are listed in [`TASKS.md`](TASKS.md).

## Tests and evaluation

```powershell
cd backend
..\.venv\Scripts\python.exe -m pytest -q tests          # all tests (uses a separate 'apaar_test' database)
..\.venv\Scripts\python.exe -m pytest -s tests/test_eval.py   # per-code precision/recall table
..\.venv\Scripts\python.exe data/gen.py --seed 42       # regenerate the synthetic dataset (deterministic)
```

**Synthetic dataset:** 450 rows across 5 upload files and 4 institutions, plus scripted withdrawals, migrations and a post-deadline edit. Every row has labelled expected codes, and the dataset includes legitimate-move controls that must **not** be flagged.

**Result:** every row-level code scores precision and recall of **1.000**, both in memory and through the full API + Postgres pipeline.

**How to read that number.** The rules and the labels were written by the same team, so it shows the rules implement the specification. It does **not** measure real-world detection accuracy. Four codes (E201, E301, E302, E303) are labelled by re-applying the counting rule, so for those it is a consistency check rather than independent ground truth.

## Repository layout

```
frontend/
  src/api/        typed API client + generated schema.d.ts
  src/pages/      Login, Institution (upload + dashboard), Batch (issues), Aicte (national monitoring)
  src/ui.tsx      shared components, polling hook
backend/
  app/            FastAPI app, validation, ingest, ledger, crypto, schema.sql, rls.sql
  data/seed/      MOCK AICTE registry (registry.json) and MOCK APAAR registry
  data/synthetic/ generated upload files, scenario.json, ground_truth.json
  data/gen.py     synthetic data generator
  i18n/           message templates (en)
  tests/          unit, API, RLS, access-matrix and evaluation tests
  openapi.json    generated API contract
.claude/agents/   security-reviewer agent used for security-relevant changes
APAAR_SIH_PRD.md  product requirements (v2.1)
IMPLEMENTATION_PLAN.md  reference task plan (task IDs used in commit messages)
MVP_SCOPE.md      what the 36-hour prototype includes and defers
TASKS.md          checklist, risks, blockers, known limitations
CLAUDE.md         engineering rules
```

## Known limitations

These are the main ones; the full list is in [`TASKS.md`](TASKS.md).
- **Mock APAAR format rule.** APAAR is checked only as exactly 12 digits, because the real checksum isn't public.
- **Only one seat scheme modelled.** FN/OCI/CIWG is the only supernumerary scheme, and its rounding still needs checking against the AICTE Approval Process Handbook. Other schemes (TFW, PMSSS, J&K, PwD) aren't guessed.
- **Validation is synchronous.** It runs inside the upload request, which is fine for demo-sized batches. There's no background processing or push updates yet.
- **Rejected rows don't count yet.** Rows rejected with errors don't count toward intake until they are corrected. Dashboards show the rejected-row total so they can't silently disappear.
- **Latin script only.** Name matching doesn't handle Indic scripts, and fuzzy (no-APAAR) duplicate matching is deferred.
- **No migrations.** Schema changes need `app.seed --reset`.
- **MOCK student sign-in is NOT authentication.** Students sign in with APAAR ID + date of birth. A DOB isn't a secret, and consent approval uses a fixed MOCK OTP. So **anyone who knows a candidate's APAAR and DOB, including an employer, can sign in as the student and approve their own consent request.** Attempts are capped at 5 per APAAR per 15 minutes; the cap is race-safe but per process. It is also abusable, because anyone can lock a known APAAR out. There is no per-IP throttle. Guardian approval for under-18s is self-asserted (labelled MOCK in the signed consent artifact). Production needs real APAAR/DigiLocker authentication and linked guardian accounts.
- **Online verification only.** Verification uses the API. The signed registry snapshot and status lists make offline verification possible, but no offline browser verifier is built yet. There is no camera QR scanner: paste the QR text instead.
- **Demo DIDs.** DIDs are `did:web` style ids on a demo host. The DID documents are served by this API at `/dids/...`, not at the real `did:web` URL.
- **Local key file.** Keys sit in a local file, not a KMS/HSM.

## Documents
- [`APAAR_SIH_PRD.md`](APAAR_SIH_PRD.md): problem statement, design, sources
- [`MVP_SCOPE.md`](MVP_SCOPE.md): included and deferred features
- [`TASKS.md`](TASKS.md): progress, risks, limitations
- [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md): reference phased plan
