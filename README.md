# VidyaPramaan: APAAR-Based Student Enrolment Integrity & Verifiable Credential System

Prototype for Smart India Hackathon problem statement SIH26263: an APAAR ID-based student data management and verification platform for AICTE-approved institutions.

**Live demo:** https://vidyapramaan.vercel.app (synthetic data; demo users below, password `demo`)

Institutions upload student-level records keyed by APAAR ID. The platform validates every row deterministically, enforces approved intake and supernumerary caps from the AICTE registry, detects duplicate enrolment within and across institutions, keeps a tamper-evident seat ledger, and gives AICTE and institutions live monitoring data.

> **Prototype.** All student data is synthetic. The APAAR registry, the AICTE approval (EOA) registry, OTP and the identity provider are mocks, labelled `MOCK` in API responses, and there is no integration with real APAAR, ABC, DigiLocker or AICTE systems. The design follows the DPDP Act 2023 principles but has not been assessed for compliance.

## Contents
- [The problem](#the-problem)
- [Status](#status)
- [Architecture](#architecture)
- [Quick start (Windows)](#quick-start-windows)
- [Trying the API](#trying-the-api)
- [Validation rules](#validation-rules)
- [AI assistant (Gemini, optional)](#ai-assistant-gemini-optional)
- [Languages](#languages)
- [Deployment](#deployment)
- [Security and privacy model](#security-and-privacy-model)
- [Tests and evaluation](#tests-and-evaluation)
- [Repository layout](#repository-layout)
- [Known limitations](#known-limitations)
- [Documents](#documents)

## The problem

AICTE gets detailed student data only from PGDM institutions. Other approved institutions mostly report totals ("480 enrolled"). From totals alone, AICTE can't detect excess admission, double enrolment across institutions, or unverifiable records.

The flow the problem statement asks for:

```
Institution → Student Data Upload → APAAR Validation → Data Verification
           → AICTE Central Repository → Analytics & Monitoring → Authorized Verification
```

## Status

Coverage of the problem statement's requirements:

| PS requirement | Status | Evidence |
|---|---|---|
| 1. Secure upload/API keyed by APAAR, and updates | Done | CSV and JSON batch upload, `Idempotency-Key`, `PATCH` withdraw/migrate/correct |
| 2. Approved intake, enrolment, supernumerary, NRI/OCI/FN fields | Done | Approved intake comes from the registry only. FN/OCI/CIWG supernumerary pool at 15% of intake, with a 1/3 CIWG sub-cap |
| 3. Duplicates, invalid/missing APAAR, excess intake, inconsistencies, cross-institution duplicates | Done | 20 validation codes (incl. student-ID E105/E205), one unit test each, including fuzzy matching (E204) for students without an APAAR. The labelled scenario passes 455/455 rows through the API |
| 4. Real-time dashboards (AICTE + institutions) | Done | Institution and AICTE web dashboards that refresh every 3 s by polling (no SSE push yet) |
| 5. Secure verification for stakeholders | Done | `POST /v1/verify`: VALID / REVOKED / SUSPENDED / UNTRUSTED_ISSUER / TAMPERED / EXPIRED. Employer access is consent-gated. AICTE and the auditor get masked data. Verifier web page |
| 6. Verifiable student records | Done | W3C VC 2.0 Enrolment, Degree and consent-scoped Verification credentials, `eddsa-jcs-2022`. Byte-for-byte match with the official W3C test vectors. Trust registry (MOCK) and Bitstring Status Lists |
| 7. Integration/API | Done | REST API + OpenAPI, public status lists, DID documents, signed registry snapshot; signed webhooks (Standard Webhooks, retries, SSRF guard) and an ERP connector CLI (`tools/erp_connector/`) |
| 8. Security, privacy, auth, RBAC, audit, consent | Done | JWT, role guard, Postgres RLS, field encryption, audit log, seat ledger. Consent with OTP (MOCK), guardian path for under-18s (MOCK, self-asserted). Student transparency log |
| 9. Reports | Done | CSV reports, all safe against spreadsheet-formula injection and audited: accreditation pack (per institution), state summary, category-quota utilisation, excess-admission case file (each over-cap row with batch/row evidence and the ledger checkpoint), plus the per-batch error report. Institutions get their own data only (RLS) |
| Extra: anomaly detection and risk-based inspection | Done | Five explainable rules, each flag carrying its evidence numbers (enrolment spike by robust z, category-mix shift, DOB cluster, sequential APAAR run, deadline dump). Data Quality Score with visible weighted components. Inspection queue ranked by (100 − DQS) × enrolments. Scored against the teammate generator's independent labels (see Tests) |
| Extra: AI explanations (advisory only) | Done | Gemini explains colleges, reports and upload problems, drafts inspection notes and matches CSV columns. It sees aggregates only, every call is audited, and a rule-based answer appears when it is unavailable. See [AI assistant](#ai-assistant-gemini-optional) |
| Extra: Indian languages | Done | Upload messages and AI answers in English + 12 Indian languages (machine-translated; tests check every placeholder and code survives) |
| 10. APAAR ID + student ID on certificates | Done | Printable certificate showing both IDs in full, with a QR holding the signed credential (`AV1:` + Base45(zlib), RFC 9285). Measured at 1,012 chars, which fits one QR at error-correction level M |

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
  ├─ ai.py            the only LLM caller: allow-listed aggregates in, advisory text out, rule-based fallback
  └─ mocks.py         MockApaarRegistry  (AICTE EOA registry = seeded tables)
        │  connects as app_user (non-owner, NOBYPASSRLS)
        ▼
PostgreSQL 18: schema.sql + rls.sql (FORCE row-level security, SECURITY DEFINER cross-institution functions)
```

**Stack:** React 19 + TypeScript + Vite + Tailwind CSS 4 + Recharts (frontend); Python 3.14, FastAPI, psycopg 3 (raw SQL), PostgreSQL 18, `cryptography`, `rfc8785`, `rapidfuzz`, `jellyfish`, `argon2-cffi`, PyJWT; optional Google Gemini over plain REST (no SDK). Hosted on Vercel (static frontend + one Python function) with Neon Postgres. Exact versions are pinned in `requirements.txt`.

**Design rules:**
- Validity, seat limits and duplicate detection are decided by deterministic code. No LLM decides anything; AI only explains.
- Approved intake comes only from the AICTE registry, never from the upload. A mismatched declaration raises `E303`.
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
#    Optional: GEMINI_API_KEY=<key> turns on the AI explanations (without it, rule-based summaries are shown)

# 3. Create the 'apaar' database, the non-owner 'app_user' role, schema + RLS, and seed the mock registry
cd backend
..\.venv\Scripts\python.exe -m app.seed --reset
#    Or, for a ready demo (all uploads replayed, E501, duplicate cases, a credential + pending consent;
#    student APAAR 328865551724; the seed prints her one-time passkey activation code):
..\.venv\Scripts\python.exe -m app.demo

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
- **Batch issues:** problem types on the left, the selected type's fix and rows on the right, a CSV report, a language picker (13 languages), "Get a fix checklist" (AI), and column matching when a file is missing template columns.
- **AICTE / auditor:** national totals, fill by state, excess-admission ranking, category mix, upload compliance, seat-ledger verify / sign checkpoint, the risk-based inspection queue (click a row for its DQS breakdown and flags), anomaly flags with evidence, and CSV reports. Split into pages: overview, seats & intake, duplicate cases, inspection priorities ("Explain this college" and "Draft a visit note"), shared students (graph of colleges listing the same students), institutions, accounts & access, and reports & integrity (AI summaries of each report and of the ledger check).
- **Institution DQS:** each institution sees its own data quality score, what pulled it down, and any flags about it.
- **Institution student records:** find a student by APAAR ID or student ID, issue an enrolment credential, mark the enrolment completed or withdrawn (withdrawal revokes their credentials), and suspend a credential or lift the suspension.
- **Student / guardian** (passkey sign-in after a one-time activation code from the institution): enrolments, credential wallet, the consent inbox (approve with passkey, deny, revoke), a printable certificate with QR, and who accessed my data. A guardian passkey approves for students under 18. With `DEMO_MODE=true` the old MOCK APAAR + DOB sign-in and OTP `123456` also work.
- **Verifier** (`employer`): request consent for specific fields, fetch and verify the consent-scoped credential, a verify tool (paste JSON or the certificate QR text), and a forged-credential demo.
- **University registrar** (`univ`): award degree credentials to affiliated institutions' students whose enrolment is completed.
- **Verify a credential:** available from the header for AICTE, the auditor, institutions and the registrar.

**Credentials demo in 2 minutes:**
1. Sign in as `inst-a`, upload `A1.csv`, find a student, and issue an enrolment credential.
2. As `employer`, request consent with that student's APAAR ID.
3. As the institution, open **Student records** for the student and issue a **passkey activation code**. On the sign-in page (at `http://localhost:5173`), activate with the APAAR ID + code, register a passkey, sign in with it, then **Approve with passkey**.
4. As `employer`, fetch and verify: the result is **VALID**.
5. As `inst-a`, withdraw the student, then verify again as `employer`: the result is **REVOKED**.
6. As `inst-a`, mark another student completed. As `univ`, award the degree and open **Certificate & QR**.
7. As `aicte`, open **Verify a credential** and try the forged credential: the result is **UNTRUSTED ISSUER**.

API types in `frontend/src/api/schema.d.ts` are generated from `backend/openapi.json` with `npm run gen:api`. Never edit them by hand.

On first run, the app generates:
- `APP_DB_PASSWORD`, appended to `backend/.env`, for the `app_user` role
- `backend/.keys.json`, holding the encryption, blind-index, JWT and signing keys

Both files are gitignored. For a production deployment, keys belong in a KMS/HSM.

`app.seed --reset` drops and rebuilds the demo database. Use it after any schema change, because there are no migrations.

### Demo users (MOCK identity provider; password `demo`)

| User | Role | Scope |
|---|---|---|
| `inst-a` | institution_admin | Kalyani Devi Hegde Institute of Technology, Hubballi (clean data) |
| `inst-b` | institution_admin | Anandrao Kulkarni College of Engineering, Solapur (messy data) |
| `inst-c` | institution_admin | Saraswati Narain Institute of Management Studies, Kanpur (enrolment spike) |
| `inst-d` | institution_admin | Ram Lakhan Sinha Polytechnic, Darbhanga (not approved) |
| `aicte` | aicte_officer | National monitoring |
| `auditor` | auditor | Read-only regulator |
| `employer` | verifier | Consent-based credential verification |
| `univ` | university_registrar | Degree issuance for affiliated institutions A and B |
| *(any uploaded student)* | student / guardian | passkey, registered with a one-time activation code from the institution (`DEMO_MODE=true` also enables the MOCK APAAR + DOB sign-in) |

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

Rules run in layers: schema → format → referential → registry (mock) → business rules → duplicates → intake engine. Errors block the row, warnings let it through, and flags let it through but raise it for AICTE review.

| Code | Meaning | Severity |
|---|---|---|
| E001 | Field missing or not parseable | error |
| E101 / E101W | APAAR missing with no reason / with REFUSED, NOT_GENERATED or PENDING (row still counted) | error / warning |
| E102 / E103 / E104 | Bad APAAR format / not in registry / name or DOB mismatch | error / error / warning |
| E105 | Institution student ID blank (it is printed on certificates) | error |
| E205 | Student ID already used in this file or by an active enrolment at the same institution (case- and space-insensitive) | error |
| E201 / E202 | Duplicate within the file / already enrolled at this institution | error |
| E203 | Active enrolment at another institution (neutral notice to both sides) | flag |
| E204 | Probable same student at another institution when one side has no APAAR: same date of birth, matching name and guardian (spelling variants, initials, dropped middle names allowed). Sent to AICTE for review, never auto-confirmed | flag |
| E301 / E302 | Regular seats over approved intake / supernumerary cap or CIWG sub-cap exceeded | flag |
| E303 | Declared intake differs from the AICTE registry | flag |
| E304 | Institution not approved, or programme not approved this year | error |
| E401 | Inconsistent NRI/OCI/FN/CIWG flags or seat category | error |
| E402 / E403 | Implausible age / admission date outside the window | warning |
| E404 | Lateral entry outside year 2 | error |
| E501 | Enrolment changed after the submission deadline | flag |

Codes are defined in [`backend/app/codes.py`](backend/app/codes.py). Message text and fix hints come from [`backend/i18n/en.json`](backend/i18n/en.json), with translations in the other files of [`backend/i18n/`](backend/i18n/) (see [Languages](#languages)).

## AI assistant (Gemini, optional)

Gemini explains; it never decides. Every call goes through [`backend/app/ai.py`](backend/app/ai.py).

| Where | Who | What it does |
|---|---|---|
| Inspection priorities → **Explain this college** | AICTE officer, auditor | Why a college is ranked high, medium or low, in plain words |
| Inspection priorities → **Draft a visit note** | AICTE officer | Editable note: purpose, findings to verify, records, questions. Copy or download; not stored |
| Reports & integrity → **report summaries** | AICTE officer, auditor | State summary, seat categories, excess admissions, and what the ledger check means |
| Upload problems → **Get a fix checklist** | Institution | Ordered to-do list to fix a rejected or partly accepted upload |
| Upload rejected for missing columns → **column matching** | Institution | Suggests template columns for the file's header names; the user confirms each match |

- **Inputs are allow-listed aggregates:** codes, counts, percentages, labels and institution names. Never student names, DOB, APAAR, guardians or row contents. Column matching sends header names only and refuses anything that looks like data.
- **Free tier.** Google may use free-tier prompts, which is acceptable only because the inputs are synthetic aggregates. Re-decide before any real data.
- **Always works:** with no key, an error, a timeout or a rate limit, a rule-based summary is shown, labelled as such. Answers are cached for 6 h per input.
- **Audited:** each request logs its purpose and source (Gemini or rules), never the prompt.
- **Settings:** `GEMINI_API_KEY` (sent in a header, never a URL) and `GEMINI_MODEL` (default `gemini-3.5-flash-lite`). Tests stub the model and never call the network.

## Languages

Upload messages, fix hints and every AI answer come in English + 12 Indian languages: Hindi, Bengali, Marathi, Telugu, Tamil, Gujarati, Kannada, Malayalam, Odia, Punjabi, Assamese and Urdu (`GET /v1/ai/languages`; AI endpoints take `?lang=`). The picker remembers the choice in the browser.

- Catalogues were machine-translated with `tools/translate_i18n.py --locale <code> --language <name>`. Tests check that every placeholder, code and column name survives in each language. Where a translation failed those checks, the English text was kept (Assamese E104, four Telugu fix hints).
- AI answers must use the language's own script, not Latin transliteration.
- **Not yet reviewed by native speakers.** The interface itself (menus, buttons) is English only.

## Deployment

The live demo runs on Vercel (region `sin1`) with Neon Postgres. [`vercel.json`](vercel.json) builds `frontend/` as static files and routes `/v1`, `/status`, `/dids` and `/healthz` to one Python function ([`api/index.py`](api/index.py)) that serves the FastAPI app. A push to `main` deploys.

- Use Neon's direct (unpooled) connection URL: the pooler drops the per-connection role settings that row-level security depends on.
- Serverless instances can't write a key file, so [`tools/deploy_keys.py`](tools/deploy_keys.py) builds the complete key set once and it is stored in the `APAAR_KEYS_JSON` environment variable. Key files and secrets are never committed.

## Security and privacy model

What is implemented and tested:
- **Institution isolation in the database.** The app connects as `app_user`, which isn't the owner, isn't a superuser and has no `BYPASSRLS`. Every institution-scoped table uses `FORCE ROW LEVEL SECURITY`. Cross-institution checks (duplicate lookup, shared person rows, case opening, ledger appends) run only through narrow `SECURITY DEFINER` functions that check the caller's role and institution. Tests confirm with raw SQL that institution B sees none of A's rows and can't write to them.
- **Field encryption.** APAAR ID, name, DOB and guardian name use AES-256-GCM, with the associated data bound to `table|column|row_id`. Lookups use separate HMAC-SHA256 blind indexes, and APAAR is displayed masked (`XXXX-XXXX-0042`).
- **Fuzzy matching on encrypted data.** Records without an APAAR are compared across institutions using blind indexes only: a DOB bucket and sound-alike name keys narrow the search to a handful of candidates, which a `SECURITY DEFINER` function returns still encrypted. Only those candidates are decrypted, inside the server, and the comparison is logged in the audit trail. A match opens a case for AICTE review and is never confirmed automatically; the uploading institution sees only a neutral notice.
- **Seat ledger.** Each enrolment create/update is hash-chained, and AICTE signs checkpoints with Ed25519. Verification also compares live rows against their last ledger event. A silent edit, delete or history rewrite is detected, and a test proves it.
- **Auth and roles.** Passwords are hashed with Argon2. JWTs are HS256. A role guard protects every endpoint, and an access-matrix test covers every endpoint × every role, including wrong-institution access.
- **Audit log.** Uploads, record reads, exports and updates are logged with actor, role, reason and request id.
- **Safe exports.** CSV formula-injection characters are neutralised in exports.
- **AI inputs.** Only allow-listed aggregates reach Gemini (see [AI assistant](#ai-assistant-gemini-optional)), and every request is audited.
- **Verifiable credentials.**
  - Signing uses W3C Data Integrity `eddsa-jcs-2022`, checked byte for byte against the official W3C test vectors (pinned in `backend/tests/vectors/`).
  - An issuer is trusted only if it is in the AICTE registry and was approved when the credential was issued.
  - Revocation and suspension use W3C Bitstring Status Lists: 131,072 entries (the spec minimum), random indexes from a CSPRNG, and signed public lists that expire after 24 h.
  - Stored credentials are encrypted.
  - Consent-scoped credentials carry only the fields the student approved. The issuing institution can't see them.
  - A verification is linked to a student's access log only when the exact stored credential is presented.
  - **No APAAR existence oracle.** A verifier's consent request gets the same response whether or not the APAAR is registered. Unmatched requests simply stay pending, exactly like unanswered ones. Requests are rate-limited (20/hour per verifier) and audit-logged. Verifiers never see `student_id`, even at the SQL level.
- **Crypto against standard vectors.** The primitives are checked against RFC 8032 (Ed25519), RFC 4231 (HMAC), the McGrew–Viega GCM vectors and the RFC 8785 (JCS) example.

## Tests and evaluation

```powershell
cd backend
..\.venv\Scripts\python.exe -m pytest -q tests          # all tests (uses a separate 'apaar_test' database)
..\.venv\Scripts\python.exe -m pytest -s tests/test_eval.py   # per-code precision/recall table
..\.venv\Scripts\python.exe data/gen.py --seed 42       # regenerate the synthetic dataset (deterministic)
..\.venv\Scripts\python.exe ../synthetic/generate.py --out ../data/world --seed 7 --students 50000 --institutions 60
..\.venv\Scripts\python.exe data/eval_fuzzy.py ../data/world  # score fuzzy duplicate matching (E204)
```

**Synthetic dataset:** 450 rows across 5 upload files and 4 institutions, plus scripted withdrawals, migrations and a post-deadline edit. Every row has labelled expected codes, and the dataset includes legitimate-move controls that must not be flagged.

**Result:** every row-level code scores precision and recall of 1.000, both in memory and through the full API + Postgres pipeline. The rules and these labels were written by the same team, so this shows the rules implement the specification; it does not measure real-world accuracy. Four codes (E201, E301, E302, E303) are labelled by re-applying the counting rule, so for those it is a consistency check.

**Anomaly rules, scored against independent labels.** The teammate's generator (`synthetic/`) labels anomalies, and it was written by a different author than the rules. `backend/data/eval_anomalies.py` reads its messy files with the generator's own reference parser, builds the same aggregate features the platform computes at upload, and runs the exact functions the API uses. Five seeds × 30 institutions (834 programmes, 150 institutions):

| Rule | TP | FP | of which on planted over-admissions | FN | Precision (strict) | Precision (over-admission flags counted as explained) | Recall |
|---|---|---|---|---|---|---|---|
| Enrolment spike | 10 | 6 | 6 | 0 | 0.625 | 1.000 | 1.000 |
| Category-mix shift | 5 | 1 | 1 | 0 | 0.833 | 1.000 | 1.000 |
| DOB cluster | 5 | 0 | 0 | 0 | 1.000 | 1.000 | 1.000 |
| Sequential APAAR | 5 | 0 | 0 | 0 | 1.000 | 1.000 | 1.000 |
| Deadline dump | 5 | 0 | 0 | 0 | 1.000 | 1.000 | 1.000 |

Every "false positive" sits on a programme the generator deliberately over-filled (an E301/E302 programme fault). It is real over-admission, but the labels record it as a programme fault rather than as an anomaly. There are only 5–10 labelled positives per rule, so treat these as early evidence on synthetic data, not as measured field accuracy. `tests/test_anomaly.py` re-runs this check on the demo preset on every test run.

**Fuzzy duplicates (E204), scored against independent labels.** The teammate's generator plants students who appear at a second college without an APAAR and with a changed name (spelling variant, added initial, dropped middle name or swapped order), plus pairs that must not match, such as twins (same DOB and guardian, different first name). `backend/data/eval_fuzzy.py` reads the generator's messy CSV and Excel files with its own reference parser and runs the same matching function the upload pipeline uses. On three worlds (seeds 7, 11 and 42; up to 51,000 rows and 60 institutions) it finds 15 of 15 labelled pairs in each, with no false matches and no must-not-match pair flagged. Fifteen pairs per world is a small sample, so this shows the rules work on the planted variants, not field accuracy.

## Repository layout

```
├── backend/                FastAPI service
│   ├── app/                API, validation, ingest, ledger, crypto, AI, schema.sql + rls.sql
│   ├── data/seed/          MOCK AICTE and APAAR registries
│   ├── data/synthetic/     generated upload files, scenario.json, ground_truth.json
│   ├── i18n/               message templates (English + 12 Indian languages)
│   ├── tests/              unit, API, RLS, access-matrix and evaluation tests
│   └── openapi.json        generated API contract
├── frontend/               React + TypeScript + Vite web app
│   └── src/                pages/, components/, api/ (typed client + generated schema)
├── api/index.py            Vercel entry point for the FastAPI app
├── synthetic/              independent synthetic-data generator used to score anomaly and fuzzy matching
├── tools/                  translation, deploy keys, world loading, ERP connector
├── docs/                   demo runbook
├── vercel.json             deployment config
└── requirements.txt        pinned Python dependencies
```

## Known limitations

- **Mock APAAR format rule.** APAAR is checked only as exactly 12 digits, because the real checksum isn't public.
- **Only one seat scheme modelled.** FN/OCI/CIWG is the only supernumerary scheme, and its rounding still needs checking against the AICTE Approval Process Handbook. Other schemes (TFW, PMSSS, J&K, PwD) aren't guessed.
- **Validation is synchronous.** It runs inside the upload request, which is fine for demo-sized batches. There's no background processing or push updates yet.
- **Rejected rows don't count yet.** Rows rejected with errors don't count toward intake until they are corrected. Dashboards show the rejected-row total so they can't silently disappear.
- **AI is advisory and on the free tier.** Answers may be imperfect, and Google may use free-tier prompts (inputs are synthetic aggregates only). Re-decide the tier before real data.
- **Machine translations.** The 12 Indian-language catalogues are unreviewed, and the interface itself is English only.
- **Latin script only.** Name matching doesn't handle Indic scripts.
- **No migrations.** Schema changes need `app.seed --reset`.
- **Passkey consent.** Students and guardians register WebAuthn passkeys using one-time activation codes from the institution, and consent approval needs a passkey assertion bound to that request's terms.
  - **Code delivery:** in the prototype the institution hands codes over in person; production delivers them via DigiLocker or the registered mobile number.
  - **Insider risk:** every new passkey waits `PASSKEY_FIRST_COOLDOWN_HOURS` (default 24) before its first consent approval, and a reissued code always waits 24 h. The student sees a notice and the reason, and AICTE sees a per-institution reissue count.
  - **Demo setting:** `python -m app.demo --live` writes `PASSKEY_FIRST_COOLDOWN_HOURS=0` to `backend/.env`, so the first passkey can approve on stage.
  - **Cross-institution block:** codes are refused while the person is active at another institution or in an open duplicate case, until AICTE resolves the case as a false positive.
  - **Not checked:** attestation (we accept any passkey).
  - **Throttles** are per process.
  - **DEMO_MODE:** the old MOCK DOB/OTP path remains only with `DEMO_MODE=true`.
- **Online verification only.** Verification uses the API. The signed registry snapshot and status lists make offline verification possible, but no offline browser verifier is built yet. There is no camera QR scanner: paste the QR text instead.
- **Demo DIDs.** DIDs are `did:web` style ids on a demo host. The DID documents are served by this API at `/dids/...`, not at the real `did:web` URL.
- **Local key file.** Keys sit in a local file, not a KMS/HSM.

## Documents
- [`demo-runbook.md`](docs/demo-runbook.md): step-by-step demo script
- [`synthetic/README.md`](synthetic/README.md): the synthetic data generator
- [`tools/erp_connector/README.md`](tools/erp_connector/README.md): ERP connector walkthrough
