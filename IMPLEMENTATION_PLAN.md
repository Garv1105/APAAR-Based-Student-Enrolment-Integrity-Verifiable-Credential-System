# Implementation Plan — APAAR Student Data Platform (SIH26263)

Companion to `docs/APAAR_SIH_Reference.md` (v2.1, "the reference"). The reference says **what** and **why**; this file says **how, in what order, and how you know a step is done**.

The plan is written to be executed in VS Code with **Claude Code (Opus 5.5) in the terminal**. Every task has a goal, the files it touches, the steps, acceptance checks Claude can run itself, and a prompt you can paste.

---

## Part A — How to work with Claude Code on this project

### A.1 Workflow for every task

1. **One task = one session.** Start with `claude` in the repo root. Run `/clear` when you finish a task, before starting the next. Name the session after the task ID with `/rename`, e.g. `/rename T2.3-intake-engine`, so you can come back to it with `claude --resume`.
2. **Plan first for anything touching more than two files.**
   - Press `Shift+Tab` until the status bar shows plan mode, then paste the task prompt.
   - Read the plan. Press `Ctrl+G` to edit it if needed, then approve.
   - Skip planning for one-line fixes.
3. **Make Claude prove it.** Every task below has an **Accept** block.
   - Each prompt ends with "run the acceptance checks and show me the output".
   - Don't accept "done" without seeing passing test output.
4. **Review the diff yourself, then commit.**
   - One commit per task: `T2.3: intake engine with row-locked counters`.
   - For security-relevant tasks (marked 🔒), run a second-opinion review first: *"Use the security-reviewer subagent to review this diff against docs/threat-model.md"* (agent definition in Appendix C).
5. **If Claude goes wrong twice in a row**, stop. Run `/clear` and re-prompt with what you learned. A clean session with a better prompt beats a long one full of corrections.
6. **Reference files with `@`**, e.g. `@docs/openapi.yaml`, instead of describing where things are.

### A.2 Parallel work for 6 people

- Each person works on their own branch: `t<task-id>-<slug>`, e.g. `t2.3-intake-engine`.
- Merge to `main` through a PR after CI passes.
- **The contract is the boundary.** `docs/openapi.yaml` and `backend/migrations/` change only through a PR that all affected owners approve. Everyone else codes against them.
- The frontend works against **mock data generated from the contract** (T0.12) until the backend endpoint exists.

### A.3 Task prompt template

When a task has no ready prompt, or you want to change one, use this:

```text
Task <ID> from @docs/IMPLEMENTATION_PLAN.md: <title>.
Context: @docs/APAAR_SIH_Reference.md §<n>, @docs/openapi.yaml (only the relevant paths).
Do: <steps>.
Constraints: follow CLAUDE.md rules; no new dependencies without asking; no PII in logs or Gemini prompts.
Done when: <acceptance checks>. Run them and show me the output. Then summarise the files you changed.
```

### A.4 Owners (team numbers from reference §17)

| # | Role |
|---|---|
| 1 | Backend core |
| 2 | Backend data |
| 3 | Credentials & security |
| 4 | ML + AI |
| 5 | Frontend A |
| 6 | Frontend B + pitch |

---

## Part B — Stack, setup and repo layout

### B.1 Tools to install (each team member)

Pin exact versions in lockfiles (`uv.lock`, `pnpm-lock.yaml`), not in this document.

| Tool | Use |
|---|---|
| Git + GitHub CLI (`gh`) | Repo, PRs. Claude Code uses `gh` well |
| Python **3.12** + **uv** | Backend, rules package, connector |
| Node **LTS** + **pnpm** | Frontend |
| Docker + Docker Compose | PostgreSQL 16, full stack |
| Claude Code | `claude` in the terminal; the VS Code extension is optional |
| A Gemini API key from a **billing-enabled** Google Cloud project | AI assist. Never use the free tier (reference §12.2) |

### B.2 Libraries

**Backend (Python):**

| Purpose | Libraries |
|---|---|
| Web framework | fastapi, uvicorn, sse-starlette, slowapi (rate limits) |
| Database | sqlalchemy 2.x (sync, psycopg 3), alembic |
| Models and settings | pydantic v2, pydantic-settings |
| Data ingestion | pandas, pandera, openpyxl |
| Matching | rapidfuzz, jellyfish (metaphone), scikit-learn |
| Cryptography | cryptography (AES-GCM, Ed25519, HMAC), rfc8785 (JCS), base58, base45 |
| Auth | PyJWT, argon2-cffi |
| Credentials and reports | qrcode, reportlab |
| AI and SQL safety | sqlglot, google-genai |
| HTTP | httpx |
| Testing | pytest, pytest-cov, hypothesis |
| Linting | ruff, mypy |

- **Connector:** typer, httpx, PyInstaller (build only).
- **Frontend:** Vite + React + TypeScript, Tailwind, Recharts, TanStack Query, react-router, openapi-typescript + openapi-fetch, i18next, html5-qrcode.
- **Verifier crypto in the browser:** @noble/ed25519, canonicalize (RFC 8785), @scure/base, pako, a base45 decoder.

> Ask Claude to check each package's current name and version before adding it (`uv add`, `pnpm add`). Don't trust names from memory, including this list.

### B.3 Repository layout

```
apaar-platform/
├── CLAUDE.md                     # project rules for Claude Code (provided)
├── Makefile                      # make dev | test | lint | migrate | seed | demo-seed
├── docker-compose.yml            # db, backend, frontend, mock-registries
├── .env.example                  # every env var, no real secrets
├── .github/workflows/ci.yml      # lint + typecheck + tests on every PR
├── .claude/
│   ├── agents/security-reviewer.md
│   └── skills/run-task/SKILL.md  # /run-task T2.3
├── docs/
│   ├── APAAR_SIH_Reference.md
│   ├── IMPLEMENTATION_PLAN.md
│   ├── openapi.yaml              # THE contract
│   ├── data-dictionary.md
│   ├── threat-model.md
│   ├── vc-profile.md
│   ├── demo-runbook.md
│   └── metrics.md                # P7 output
├── rules/                        # shared package `apaar_rules` (server + connector)
│   ├── apaar_rules/{schema.py, format.py, normalise.py, codes.py, seat_categories.yaml}
│   └── tests/
├── backend/
│   ├── app/
│   │   ├── main.py, config.py, deps.py
│   │   ├── db/{session.py, base.py, rls.py}
│   │   ├── models/               # SQLAlchemy models
│   │   ├── schemas/              # Pydantic request/response models
│   │   ├── core/{crypto.py, auth.py, rbac.py, audit.py, ratelimit.py, events.py}
│   │   ├── api/v1/{auth, batches, enrolments, programmes, cases, precheck,
│   │   │          credentials, verify, consents, registry, status, ledger,
│   │   │          dashboards, reports, ai, clients, webhooks}.py
│   │   ├── services/{ingestion, validation, intake, features, matching, cases,
│   │   │             ledger, anomaly, dqs, credentials, statuslist, consent,
│   │   │             certificates, ai_assist, i18n, reports, webhooks}.py
│   │   └── adapters/{base.py, apaar.py, aicte.py, digilocker.py}
│   ├── migrations/               # alembic
│   └── tests/{unit, integration, security, vectors}/
├── mock-registries/              # seed JSON: APAAR records, AICTE EOA intake, institutions
├── i18n/{en.json, hi.json, kn.json, ...}   # error-message templates (D7)
├── connector/                    # apaar-connector CLI
├── frontend/src/{api, pages/{institution, aicte, student, verifier, registrar}, components, i18n}
├── synthetic/                    # PLACEHOLDER: generator designed later (reference §15)
└── scripts/{gen_keys.py, verify_ledger.py, translate_templates.py, extract_eoa.py, demo_seed.py}
```

### B.4 Environment variables (`.env.example`)

```
DATABASE_URL=postgresql+psycopg://app_user:app_pw@db:5432/apaar      # NON-owner role (RLS!)
DATABASE_ADMIN_URL=postgresql+psycopg://owner:owner_pw@db:5432/apaar  # migrations only
JWT_SECRET=change-me
KEK_B64=                      # 32-byte key-encryption key (scripts/gen_keys.py)
K_APAAR_BI_B64=               # 32-byte HMAC keys, one per blind index
K_DOB_BI_B64=
K_NAME_BI_B64=
AICTE_LEDGER_SK_B64=          # Ed25519 private key for checkpoints
GEMINI_API_KEY=               # paid project only
GEMINI_MODEL_REASONING=gemini-3.8-flash
GEMINI_MODEL_BULK=gemini-3.5-flash-lite
ADMISSION_DEADLINE=2026-09-30
PUBLIC_BASE_URL=http://localhost:8000
```

---

## Part C — Global engineering rules (also in CLAUDE.md)

1. **No PII leaves the platform.** Gemini receives only headers, synthetic samples, templates, aggregates or public documents. All calls go through `services/ai_assist.py`, which runs the scrubber.
2. **Approved intake comes only from the AICTE registry adapter.** Never from upload data.
3. **Every enrolment row counts toward intake**, with or without a valid APAAR.
4. **All crypto lives in `core/crypto.py` and `services/credentials.py`.** No ad-hoc hashing elsewhere.
5. **RLS is the source of truth for institution isolation.** The app connects as `app_user`, a non-owner, and tables use `FORCE ROW LEVEL SECURITY`.
6. **Every write to an enrolment goes through `services/ledger.append()`.**
7. **Every PII read, export, unmask and verification calls `core/audit.log()`.**
8. **Errors use `application/problem+json`.** Validation issues use the codes in `apaar_rules/codes.py` only.
9. **Tests:**
   - Every service has unit tests.
   - Every endpoint has an integration test, including a **wrong-role** and a **wrong-institution** case.
   - Coverage on `core/` and `services/` stays at 80% or above.

---

## Part D — Phase-by-phase tasks

Legend: 🔒 = security-relevant, so run the security-reviewer subagent before merging. ⭐ = on the "never cut" list (reference §16.3).

---

### PHASE 0 — Foundation and contracts

#### T0.1 Repo scaffold, Compose, Makefile, CI — owner #1

- **Steps:**
  1. Create the monorepo layout (B.3) and the `uv` workspace (`backend`, `rules`, `connector`).
  2. Create the Vite app in `frontend/`.
  3. Write `docker-compose.yml` with Postgres 16 and backend/frontend dev services.
  4. Add Makefile targets.
  5. Add GitHub Actions CI: ruff, mypy, pytest with Postgres as a service, frontend typecheck + build.
- **Accept:**
  - `make dev` starts everything.
  - `curl localhost:8000/healthz` returns `{"status":"ok"}`.
  - The frontend loads.
  - CI passes on a test PR.
- **Prompt:**
  ```text
  Scaffold the monorepo exactly as in @docs/IMPLEMENTATION_PLAN.md Part B.3 (only folders and minimal files for now).
  uv workspace with packages backend, rules, connector (Python 3.12). Vite+React+TS+Tailwind app in frontend/ with pnpm.
  docker-compose.yml: postgres:16 (with an init script creating roles `owner` and `app_user`), backend (uvicorn --reload), frontend (vite dev).
  Makefile targets: dev, test, lint, typecheck, migrate, seed, demo-seed (stub).
  FastAPI app with GET /healthz. GitHub Actions CI: ruff, mypy, pytest (Postgres service), pnpm typecheck + build.
  Check current package names/versions before adding. Run make dev and curl /healthz; show output.
  ```

#### T0.2 Claude Code project setup — owner #1

- **Steps:**
  1. Put the provided `CLAUDE.md` in the repo root.
  2. Copy the reference and this plan into `docs/`.
  3. Create `.claude/agents/security-reviewer.md` and `.claude/skills/run-task/SKILL.md` from Appendix C.
  4. Commit all of it.
- **Accept:** in a new `claude` session, `/context` shows CLAUDE.md loaded, and `/run-task T0.1` is available.

#### T0.3 Data dictionary — owner #2 (human-led; Claude drafts)

- **File:** `docs/data-dictionary.md`.
- **Content:** one row per Req 2 field and every column the upload accepts. Columns: name, type, required?, source (upload / registry / derived), validation rule, error code, PII? (Y/N), encrypted? (Y/N).
- **Decide explicitly:** what "other relevant information" includes. Keep it minimal.
- **Accept:** reviewed by #1, #3, #4. Every PS Req 2 field appears with its source.
- **Prompt:**
  ```text
  Draft docs/data-dictionary.md from @docs/APAAR_SIH_Reference.md §5, §8, §9 and the PS text in §0.
  One table row per field the upload accepts plus derived fields (actual enrolment) and registry fields (approved intake).
  Columns: name, type, required, source(upload|registry|derived), validation, error code(s), PII, encrypted.
  Mark 'other relevant information' fields as a short proposed list with a one-line justification each. Ask me before finalising that list.
  ```

#### T0.4 Seat-category config from the Handbook — owner #2 ⭐

- **File:** `rules/apaar_rules/seat_categories.yaml`. Each entry needs: `code`, `scope` (`within_intake` | `supernumerary`), `cap_rule` (e.g. `{type: percent_of_intake, value: 15}`), optional `sub_caps`, `handbook_ref` (clause + page).
- **Steps:**
  1. **A human downloads** the AICTE Approval Process Handbook PDF (reference [S1]) into `docs/sources/`.
  2. Claude extracts the supernumerary schemes and caps **with page references**.
  3. A human checks every cap against the PDF.
- **Accept:** a schema test validates the YAML, and every entry has a `handbook_ref` that has been checked.
- **Prompt:**
  ```text
  Read @docs/sources/aicte_handbook.pdf. Find every supernumerary / quota scheme relevant to admissions (FN/OCI/CIWG, NRI, TFW, lateral entry, PwD, PMSSS, J&K and any others) and its cap rule.
  Write rules/apaar_rules/seat_categories.yaml with code, scope, cap_rule, sub_caps, handbook_ref (clause + page number). Quote nothing longer than needed; I will verify each page reference.
  Add a pydantic model + test that loads and validates the YAML. List any scheme where the rule was ambiguous.
  ```

#### T0.5 OpenAPI contract — owner #1 (all review) ⭐

- **File:** `docs/openapi.yaml` (OpenAPI 3.1).
- **Coverage:**
  - every endpoint in reference §12.1, plus auth, dashboards, reports, AI assist, clients and webhooks admin
  - SSE event schemas (documented as `text/event-stream` with event types)
  - a `Problem` schema
  - security schemes: bearer JWT and OAuth2 client credentials
- **Accept:**
  - `npx @redocly/cli lint docs/openapi.yaml` reports no errors.
  - All six team members have approved the PR.
- **Prompt:**
  ```text
  Write docs/openapi.yaml (OpenAPI 3.1) covering every endpoint in @docs/APAAR_SIH_Reference.md §12.1 plus: auth (login, refresh, otp), dashboards, reports, ai (mapping-suggest, ask-data, anomaly-narrative), api clients, webhook endpoints admin, precheck (D2), transparency (D6), SSE streams.
  Use components: Problem (RFC 9457), Batch, ValidationIssue{code,severity,row,field,message_key,params}, Enrolment, SeatSummary, Case, Credential, Consent, Checkpoint.
  Every list endpoint: cursor pagination. Every write: Idempotency-Key header. Roles per operation in x-roles.
  Lint with npx @redocly/cli lint and fix all errors. Show the lint output.
  ```

#### T0.6 Database schema, migrations, RLS — owner #1 🔒 ⭐

- **Files:** `backend/app/models/*`, `backend/migrations/versions/0001_init.py`, `backend/app/db/rls.py`.
- **Steps:**
  1. Create every table in reference §8.
  2. Add a partial unique index on `students(apaar_bi) WHERE apaar_bi IS NOT NULL`, and indexes on `enrolments(student_id, academic_year, status)` and `students(bi_dob_bucket)`.
  3. Set up RLS (gotchas below).
- **RLS gotchas (tell Claude explicitly):**
  - RLS does **not** apply to the table owner or superusers. The app must connect as `app_user`, and tables use `ALTER TABLE ... FORCE ROW LEVEL SECURITY`.
  - Each request runs `SET LOCAL app.institution_id = '<uuid>'` and `SET LOCAL app.role = '<role>'` at the start of its transaction, via a dependency in `db/rls.py`.
  - The `students` table is shared across institutions. An institution sees a student only if `EXISTS (SELECT 1 FROM enrolments e JOIN programmes p ... WHERE p.institution_id = current_setting('app.institution_id')::uuid)`.
- **Accept:**
  - `make migrate` runs cleanly from empty.
  - `tests/security/test_rls.py` passes. As Institution B it gets **0 rows** from A's enrolments and students, both through the API and through raw SQL as `app_user`.
- **Prompt:**
  ```text
  Implement SQLAlchemy 2 models and alembic migration 0001 for all tables in @docs/APAAR_SIH_Reference.md §8 and @docs/data-dictionary.md.
  Add RLS: ENABLE + FORCE on institution-scoped tables; policies using current_setting('app.institution_id', true) and current_setting('app.role', true); aicte_officer/auditor read-all; students visible via EXISTS on enrolments.
  App connects as app_user (non-owner). db/rls.py: a FastAPI dependency that opens a transaction and runs SET LOCAL for institution_id and role from the JWT.
  Write tests/security/test_rls.py: seed two institutions, assert B sees zero of A's enrolments/students via raw SQL as app_user and via the API. Run tests, show output.
  ```

#### T0.7 Key inventory and key generation — owner #3 🔒

- **Files:** `scripts/gen_keys.py` and a "Keys" section in `docs/threat-model.md`.
- **Steps:**
  1. Generate the KEK, three HMAC keys, the AICTE ledger Ed25519 key, and demo issuer keys per institution.
  2. Write them to `.env.local`. **Never commit it.**
  3. Add `.env.local` to `.gitignore`, and add a gitleaks/pre-commit secret scan to CI.
- **Accept:** running the script creates all keys, and CI's secret scan passes.

#### T0.8 Error-code catalogue (English templates) — owner #4

- **Files:** `rules/apaar_rules/codes.py` (enum: code, severity, message_key) and `i18n/en.json` (`message_key → template` with `{placeholders}` and a `fix_hint`).
- **Coverage:** every code in reference §9.3.
- **Accept:** a test asserts every code has an English template and a fix hint, and all placeholders are documented.

#### T0.9 VC profile — owner #3

- **File:** `docs/vc-profile.md`.
- **Content:**
  - claims for EnrolmentCredential, DegreeCredential and VerificationCredential
  - the issuer DID pattern
  - the status-list URL pattern
  - the QR payload: prefix `AV1:` + base45(zlib(JSON VC)) for offline mode, and a URL for online mode
- **Accept:** reviewed by #5 (verifier UI) and #1.

#### T0.10 Threat model — owner #3 🔒

- **File:** `docs/threat-model.md`. One page in STRIDE format.
- **Threats to cover:**
  - enumeration oracle via notices or pre-check
  - insider unmasking
  - ledger rewrite
  - CSV formula injection
  - prompt injection via headers
  - key theft
  - webhook replay
  - JWT tampering
  - RLS bypass
- **Mapping:** link each threat to its mitigation and the test that proves it. The tests are listed in T7.3.
- **Accept:** the security-reviewer subagent finds no unmapped threat for the planned features.

#### T0.11 Mock registries + EOA extraction — owner #4

- **Files:**
  - `backend/app/adapters/{base.py, apaar.py, aicte.py, digilocker.py}`, each a Protocol with Mock and Real (stub raising `NotImplementedError`) implementations
  - `mock-registries/*.json`
  - `scripts/extract_eoa.py`
- **EOA extraction:** download a few **public** AICTE EOA approval PDFs (letters published by institutions). The script calls `ai_assist.extract_eoa()` (Gemini use case B, structured output) to produce `{institution_id, programme, level, year, approved_intake}` rows. A human spot-checks them, and they seed `approved_intake`.
- **Accept:**
  - Adapter unit tests pass.
  - Extraction output matches a manually checked sample of at least 10 rows.

#### T0.12 Frontend foundation — owners #5, #6

- **Steps:**
  1. Generate the typed client from `docs/openapi.yaml` (openapi-typescript + openapi-fetch).
  2. Set up mock responses from the contract for development.
  3. Add role-based routing: institution / aicte / student / verifier / registrar.
  4. Build the layout shell, add i18next with an `en` / `hi` / `kn` switcher, and set Tailwind theme tokens.
- **Accept:** `pnpm typecheck` and `pnpm build` pass, and every route renders with mock data.

**P0 exit gate:**
- The contract and schema are merged.
- `make dev` gives a healthy stack.
- RLS tests pass.
- The mock registries answer.

---

### PHASE 1 — Secure ingestion core (Req 1, 2, 7, 8)

#### T1.1 Settings, DB session, health — owner #1

`config.py` uses pydantic-settings to read B.4. The DB session factory always goes through the RLS dependency. `/healthz` and `/readyz` (the latter checks the database).

#### T1.2 Authentication 🔒 ⭐ — owner #1

- **Users:** Argon2id password hashing (argon2-cffi).
- **Tokens:**
  - JWT access tokens (15 minutes) and rotating refresh tokens stored hashed.
  - Claims: `sub`, `role`, `institution_id`, `locale`.
- **OTP mock:** a 6-digit code logged to the console, for students and guardians.
- **Machine clients:** OAuth2 `client_credentials` for `integration_client`, with hashed secrets and scopes.
- **Seed users:** one per role plus 3 institutions.
- **Accept:**
  - Login, refresh and logout work.
  - A tampered JWT returns 401.
  - A wrong role returns 403.
  - A client-credentials token only reaches its scopes.
- **Prompt:**
  ```text
  Implement auth per @docs/openapi.yaml (auth paths) and roles in @docs/APAAR_SIH_Reference.md §6.
  Argon2id hashing, PyJWT access (15 min) + rotating refresh (stored hashed, reuse detection revokes the family), OTP mock (console), OAuth2 client_credentials for integration_client with scopes.
  core/rbac.py: require_role(*roles) and require_scope(scope) dependencies; JWT claims feed the RLS dependency.
  Tests: login/refresh/logout, tampered token 401, expired 401, wrong role 403, scope enforcement, refresh-token reuse. Run tests and show output.
  ```

#### T1.3 Crypto module 🔒 ⭐ — owner #3

- **File:** `core/crypto.py`.
- **API:**
  - `encrypt_field(plaintext, aad) / decrypt_field(...)`
    - AES-256-GCM with a random 96-bit nonce.
    - **AAD = `table|column|row_id`**, so ciphertext can't be swapped between rows.
    - Envelope encryption: data key wrapped by the KEK.
  - `blind_index(key, normalised_value, truncate_bits=None)`: HMAC-SHA256, with optional truncation (16 bits for the DOB bucket).
  - `normalise_name(s)`: casefold, strip honorifics and initials, transliterate to Latin, collapse whitespace.
  - `normalise_dob(s)`: ISO date.
  - `phonetic_keys(name)`: metaphone per token.
  - `mask_apaar(apaar)`: shows only the last 4 digits.
- **Accept:**
  - Round-trip tests pass.
  - Decrypting with the wrong AAD fails.
  - Hypothesis property tests: normalisation is idempotent, and blind indexes are deterministic per key and differ across keys.
  - Committed test vectors in `tests/vectors/crypto.json`.

#### T1.4 Batch ingestion ⭐ — owner #2

- **Endpoints:** `POST /v1/batches` (multipart CSV/XLSX or JSON rows) and `GET /v1/batches/{id}`.
- **Upload limits:** 20 MB maximum. Check the MIME type and extension. Read XLSX with openpyxl in `read_only` / `data_only` mode.
- **Idempotency:** store `(key, request_hash)`. The same key with a different body returns 422; the same key and body returns the original response.
- **Batch state machine:** `received → validating → completed | failed`.
- **Processing:** `BackgroundTasks` runs the pipeline. Progress events go out over `GET /v1/batches/{id}/events` (SSE, sse-starlette).
- **Storage:** encrypt PII columns, compute blind indexes, insert students and enrolments in one transaction per chunk.
- **Accept:**
  - A 500-row upload returns 202, then streams progress events, then completes.
  - Rows are encrypted at rest (raw SQL shows ciphertext).
  - Repeating the same idempotency key creates no duplicate rows.

#### T1.5 Enrolment update path — owner #2

`PATCH /v1/enrolments/{id}` supports `correct` (field changes, which re-validate), `withdraw` (date) and `migrate` (date + note). Every change appends to the ledger (T1.7) and the audit log.

**Accept:** each action is tested, and a withdrawn enrolment no longer counts toward intake.

#### T1.6 Audit middleware 🔒 — owner #1

`core/audit.log(actor, role, action, entity, entity_id, reason=None)` is called for:
- PII reads
- exports
- unmasks (a reason is **required**, otherwise 400)
- verifications
- consent changes
- AI calls (prompt hash only)

Audit records store a hashed IP.

**Accept:** a test asserts audit rows are written for each action type, and unmasking without a reason returns 400.

#### T1.7 Seat Ledger part 1 (D1) 🔒 — owner #1

- **File:** `services/ledger.append(institution_id, event_type, payload)`.
- **Payload:** IDs and a SHA-256 of the record's canonical JSON. **No PII.**
- **Chaining:** `entry_hash = SHA256(prev_hash || seq || JCS(payload))`. Use one chain per deployment, serialised with an advisory lock.
- **Accept:** appends are chained correctly, and a `verify_chain()` test detects a modified row.

#### T1.8 Institution upload UI — owner #5

- **Page:** upload page with drag-and-drop and a live progress bar driven by SSE.
- **Batch history:** a list of past batches.
- **Language:** follows the user's locale.
- **Accept:** a manual run uploads a file and shows progress, then the results page. Add a Playwright smoke test if time allows.

**P1 exit gate:**
- Upload works end to end.
- Data is encrypted.
- RLS and audit tests are green.
- Ledger entries exist for every write.

---

### PHASE 2 — Validation, intake engine, multilingual reports (Req 2, 3; D7)

#### T2.1 Shared rules package ⭐ — owner #2

`rules/apaar_rules` holds:
- layer 1, schema (pandera)
- layer 2, format: 12-digit APAAR, reason codes REFUSED / NOT_GENERATED / PENDING
- in-file duplicates (E201)
- normalisers re-exported from crypto (the pure functions only)

It is pure Python with no database, so the connector can import it.

**Accept:** every code in this layer has a test with a failing row.

#### T2.2 Server validation layers 3–5 ⭐ — owner #2

- **Layer 3, referential:** programme and institution exist; the institution is approved (E304); the academic year is valid.
- **Layer 4, registry lookup:** E103 if not found, E104 on name/DOB mismatch after normalisation.
- **Layer 5, business rules:** E401 category consistency, E402 age plausibility, E403 admission window, E404 lateral entry.
- **Result:** issues are stored as `{code, severity, row, field, message_key, params}`.
- **Accept:** one test per code, and a batch mixing errors and warnings blocks only the error rows.

#### T2.3 Intake engine 🔒 ⭐ — owner #2

- **File:** `services/intake.py`.
- **Steps:**
  1. Ensure counter rows exist with `INSERT ... ON CONFLICT DO NOTHING`.
  2. Lock them with `SELECT ... FOR UPDATE`.
  3. Apply caps from `seat_categories.yaml` × `approved_intake`, which comes from the **registry adapter only**.
  4. Emit E301, E302 or E303.
  5. **Count every accepted row**, including rows with E101W.
- **Accept:**
  - Unit tests for each category rule.
  - **A concurrency test:** two threads upload overlapping batches into the same programme, and the final count is ≤ cap + flagged excess. The counter is never silently exceeded.
  - The E303 test passes when the upload declares a different intake from the registry.
- **Prompt:**
  ```text
  Implement services/intake.py per @docs/APAAR_SIH_Reference.md §9.2 and rules/apaar_rules/seat_categories.yaml.
  approved_intake ONLY from adapters.aicte (never from upload). Counters in programme_category_counters, created with INSERT ON CONFLICT DO NOTHING then locked with SELECT ... FOR UPDATE in the same transaction.
  Rows with E101W (missing APAAR with reason) still count. Emit E301/E302/E303.
  Tests: per-category caps incl. CIWG sub-cap, declared-vs-registry mismatch, and a concurrency test with two threads and separate DB connections proving no silent overfill. Run and show output.
  ```

#### T2.4 Ingestion-time features (F1) 🔒 — owner #4

Compute, in memory, before encryption:
- the longest run of consecutive APAAR numbers
- the size of the largest group sharing one DOB
- the share of duplicate addresses, if an address column is accepted
- the upload timestamp relative to the deadline

Persist only these features, in the `batch_features` table.

**Accept:** a test proves no plaintext APAAR appears in `batch_features`, and seeded sequential IDs are detected.

#### T2.5 Error report export — owner #2

- **Endpoint:** `GET /v1/batches/{id}/issues` (paged) plus a CSV/XLSX download.
- **Messages:** rendered from `i18n/<locale>.json` with a fix hint.
- **Formula injection:** any cell starting with `= + - @ \t \r` is prefixed with `'`.
- **Accept:**
  - A downloaded report opens in Excel/LibreOffice.
  - An injection test shows the payload `=HYPERLINK(...)` is neutralised.

#### T2.6 Multilingual error reports (D7) — owner #4

- **Translation script:** `scripts/translate_templates.py`.
  - Reads `i18n/en.json` and sends **only template text** with `{placeholders}` to Gemini (bulk model, structured output `{key: translation}`).
  - Writes `i18n/hi.json`, `i18n/kn.json` and one more state language.
- **Validation:** the script checks every placeholder survives translation; any template where a placeholder is missing is rejected and retried.
- **Human review:** a team member who reads each language signs off. Record the reviewer in the file header.
- **Runtime:** reads the static files only, with **no live Gemini calls**. The locale comes from the JWT or `Accept-Language`, falling back to English.
- **Accept:**
  - A placeholder-integrity test passes for all locales.
  - The error report renders in 3 languages.
  - A test proves no row data reaches the translator.

#### T2.7 AI assist module + column mapping (Gemini use case A) 🔒 — owner #4

- **Gemini wrapper:** `services/ai_assist.py` uses `google-genai` with the Interactions API, structured output and Pydantic models (reference §12.2 code).
  - Read model IDs from config.
  - 20-second timeout and one retry.
  - When Gemini fails, degrade gracefully by returning `503 assist_unavailable`.
- **`scrub(prompt)`:** rejects any prompt containing:
  - a 12-digit run
  - a date pattern
  - any normalised name from the current batch
- **Audit:** log the prompt SHA-256, model, latency and the user who accepted the result.
- **Mapping endpoint:** `POST /v1/ai/mapping-suggest` takes headers plus **synthetic samples generated from format inference**, not real cells. The UI shows the suggested mapping and needs a confirm click.
- **Accept:**
  - Scrubber unit tests block every PII pattern.
  - Use the messy fixture `tests/fixtures/messy_headers.xlsx`, with headers such as "Stud APAAR No", "D.O.B" and "Branch Code".
  - Mapping that fixture gives correct targets for ≥ 90% of headers.
  - A prompt-injection header ("ignore instructions and …") still returns only enum targets.

**P2 exit gate:**
- Every error code is tested.
- The concurrency test is green.
- Reports render in 3 languages.
- The mapping flow works from upload to confirmation.

---

### PHASE 3 — Cross-institution integrity (Req 3, 5, 8; D1, D2)

#### T3.1 Exact cross-institution duplicates ⭐ — owner #2

After each batch, run the §10 step 1 query restricted to the batch's `apaar_bi` values. Create or extend `duplicate_cases` with E203.

**Accept:** the same APAAR uploaded by A, then by B, opens one case linking both enrolments. Withdrawn enrolments are ignored.

#### T3.2 Fuzzy duplicates 🔒 — owner #2

- **Blocking:** match `bi_dob_bucket` **and** at least one shared phonetic blind index.
- **Comparison:** decrypt only the candidate pairs, inside the service.
- **Scoring:** combine rapidfuzz `token_sort_ratio` on name and guardian name with exact DOB equality. A score of 90 or more raises E204 (review).
- **Accept:**
  - Fixtures with transliteration variants ("Mohammed / Mohd / Muhammad", missing initials) are matched.
  - Unrelated same-DOB pairs are not.
  - Decryption only happens inside `services/matching.py` (grep-based test).

#### T3.3 Case workflow + neutral notices 🔒 ⭐ — owner #2

- **States:** `flagged → notified → under_review → resolved(confirmed|false_positive|investigation)`.
- **Institution view:** sees only "A record in this batch needs AICTE review (case #id)".
- **Notices:** created **only** for rows in a submitted batch, and rate-limited per institution (slowapi).
- **AICTE view:** officers see both sides after unmasking with a reason.
- **Accept:** a security test shows Institution B's API responses contain no field from Institution A's enrolment, plus rate-limit tests.

#### T3.4 Duplicate pre-check (D2) 🔒 — owner #2, with #3 for tokens

- **Consent token:** the student approves with an OTP, and the platform issues an Ed25519-signed token: `{apaar_bi, institution_id, purpose:"precheck", exp: 15 min, nonce}`. It is single-use (nonce stored).
- **Endpoint:** `POST /v1/precheck` takes `{apaar, consent_token}` and returns only `CLEAR` or `NEEDS_REVIEW`. It is rate-limited and audit-logged.
- **Accept:**
  - Missing, expired, reused, or wrong-institution tokens are rejected.
  - The response never varies beyond the two values.
  - Timing is roughly constant: compute the lookup the same way in both branches.

#### T3.5 Ledger checkpoints + E501 (D1) 🔒 — owner #1

- **Checkpoints:** a daily job (plus a manual trigger endpoint for the demo) builds an RFC 6962-style Merkle tree (leaf = `0x00 || entry_hash`, node = `0x01 || left || right`) over entries since the last checkpoint. It signs the root with the AICTE Ed25519 key and stores the result.
- **Public endpoints:** `GET /v1/ledger/checkpoints/latest` and `GET /v1/ledger/proof/{seq}` (inclusion proof).
- **Verification tool:** `scripts/verify_ledger.py` checks the signature, the chain and the inclusion proofs.
- **Publishing:** also commit each checkpoint to a public place, e.g. a `checkpoints/` folder in a public repo. A database admin can't rewrite history without also changing that published copy.
- **E501:** any mutation after `ADMISSION_DEADLINE` is flagged and visible on the AICTE dashboard.
- **Accept:** the verifier passes on a clean ledger, fails after editing any row directly in SQL, and E501 fires for a post-deadline PATCH.

**P3 exit gate:**
- The seeded duplicate is caught.
- Notice-leak and oracle tests are green.
- Ledger tamper detection works.
- Pre-check without consent is refused.

---

### PHASE 4 — Monitoring, anomalies, DQS, reports (Req 4, 9; D3)

#### T4.1 Aggregates + live events ⭐ — owner #1

- **Materialised views:**
  - `mv_programme_fill` (by category)
  - `mv_institution_summary`
  - `mv_state_summary`
  - `mv_upload_compliance`
  - `mv_duplicate_exposure`
- **Refresh:** after each batch, `REFRESH MATERIALIZED VIEW CONCURRENTLY`. This needs unique indexes on the views.
- **Event bus:** `core/events.py`, an in-process pub/sub feeding SSE `GET /v1/events` filtered by role and institution.
- **Alerts:** 90% fill, 100% fill, cap reached, new case, new anomaly, E501.
- **Accept:** after an upload, the AICTE event arrives in under 5 seconds (an integration test with an SSE client).

#### T4.2 Institution dashboard ⭐ — owner #5

Shows:
- intake vs filled per programme and category (Recharts)
- open cases (neutral text)
- batch history
- its own DQS with a breakdown

**Accept:** it updates live after an upload. Check visually with a screenshot.

#### T4.3 AICTE dashboard ⭐ — owner #6

Shows:
- a state summary (table + bar chart; a choropleth is optional, use a properly licensed India GeoJSON if added)
- excess-enrolment ranking
- category mix
- upload compliance
- duplicate exposure
- ledger consistency (latest checkpoint verified ✓)
- an alerts feed
- a case queue with an unmask-with-reason dialog

**Accept:** every widget has a loading, empty and error state and updates live.

#### T4.4 Anomaly engine (+ Gemini use case C) — owner #4

- **Rules:**
  - fill ratio vs 3-year history using robust z (median/MAD), threshold 3.5
  - category-mix shift
  - DOB cluster
  - sequential-ID run (from `batch_features`)
  - deadline dump
- **Isolation Forest:** on institution-level features; flag the top 5%.
- **Explanation:** each flag stores `evidence_json` with the top-3 features (value, baseline, deviation). Gemini turns that evidence into a 2–3 sentence narrative. The prompt contains **only the evidence JSON**, and the UI shows the numbers from code alongside the narrative.
- **Accept:**
  - Seeded spikes are flagged with correct evidence.
  - Narrative generation passes the scrubber.
  - With Gemini off, flags still show their evidence.

#### T4.5 DQS + risk-based inspection queue (D3) — owner #4 (backend), #6 (UI)

- **Score:** `DQS = 100 × Σ wᵢ·componentᵢ` over:
  - validation pass rate
  - timeliness vs deadline
  - correction churn
  - open and confirmed cases
  - anomaly flags
  - E303/E501 count
- **Weights:** in config, documented in the UI.
- **Inspection queue:** ranks institutions by `(100 − DQS) × enrolment size`, with a "why" breakdown for each row.
- **Accept:** the components sum to the score in tests, and the queue ordering is correct on a fixture.

#### T4.6 Ask-the-data (Gemini use case D) 🔒 — owner #4

Generated SQL passes through `sqlglot.parse_one(sql, read="postgres")`. Reject anything that is:
- not a single `SELECT`
- using a table outside the allowlist of aggregate views
- calling functions outside an allowlist

Then inject `LIMIT 500` and run as the `readonly_role` with `SET LOCAL statement_timeout = '3s'`. The views suppress groups with k < 10. Show the SQL to the officer before running it.

**Accept:** injection attempts like `; DROP`, `pg_sleep`, cross-schema access and base-table access are all rejected, and 10 sample questions return correct results.

#### T4.7 Reports (Req 9) ⭐ — owner #6 (UI), #1 (backend)

Reports:
- accreditation pack per institution
- state summary
- category-quota utilisation
- excess-admission case file

Formats: CSV for all, PDF via reportlab. The policy brief is drafted by Gemini (use case E) from aggregate tables and edited by a human.

**Accept:** every report exports, and the numbers in each PDF match the API.

**P4 exit gate:**
- Live dashboards work.
- Anomalies show their evidence.
- The DQS queue works.
- All reports export.

---

### PHASE 5 — Verification, credentials, consent (Req 5, 6, 8, 10; D4, D5, D6)

#### T5.1 Trusted Issuer Registry (D4) ⭐ — owner #3

- **Data:** `issuer_registry` table.
- **Endpoints:**
  - `GET /.well-known/...` and `GET /inst/{id}/did.json`, serving `did:web` documents with `verificationMethod` (Multikey Ed25519).
  - `GET /v1/registry/snapshot`: a signed snapshot for offline caching.
- **Status by year:** approved, closed or progressive closure.
- **Accept:** DID resolution works for seeded institutions, and the snapshot signature verifies.

#### T5.2 VC sign/verify library (`eddsa-jcs-2022`) 🔒 ⭐ — owner #3

- **File:** `services/credentials.py`.
- **API:** `sign_vc(doc, issuer_key, vm_id)` and `verify_vc(vc, registry, status_cache) -> Result`.
- **Signing:** proof config → JCS → SHA-256, concatenated with SHA-256 of the JCS of the unsecured doc, then Ed25519, with `proofValue` encoded as multibase base58btc (`z…`). See reference §11.6.
- **Test vectors:** **ask Claude to fetch the official `eddsa-jcs-2022` test vectors from the W3C EdDSA cryptosuites spec and assert byte-equality** before trusting the implementation.
- **Verification outcomes:**
  - VALID
  - TAMPERED
  - UNTRUSTED_ISSUER (not in registry, or not approved at `validFrom`)
  - EXPIRED
  - REVOKED or SUSPENDED (via T5.3)
- **Accept:** the W3C vector test passes, and there is one test per outcome.
- **Prompt:**
  ```text
  Implement services/credentials.py: sign_vc and verify_vc using Data Integrity cryptosuite eddsa-jcs-2022 (W3C Data Integrity EdDSA Cryptosuites v1.0), per @docs/APAAR_SIH_Reference.md §11.5–11.6 and @docs/vc-profile.md.
  First fetch the official eddsa-jcs-2022 test vectors from the W3C spec and add them to tests/vectors/; the implementation must reproduce them byte-for-byte.
  Use cryptography (Ed25519), rfc8785 (JCS), base58 (multibase z). verify_vc returns VALID | TAMPERED | UNTRUSTED_ISSUER | EXPIRED | REVOKED | SUSPENDED.
  Tests for every outcome. Run and show output.
  ```

#### T5.3 Bitstring Status Lists 🔒 — owner #3

- **One list per issuer per purpose** (revocation, suspension), with at least 131,072 entries (confirm the minimum in the W3C spec).
- **`encodedList`:** multibase base64url (`u` prefix) of the GZIP-compressed bitstring, served as a signed `BitstringStatusListCredential`.
- **Assignment:** random unused index per new credential, rather than sequential, for herd privacy.
- **Revocation:** enrolment withdrawal and confirmed duplicates revoke automatically. "Under investigation" sets suspension.
- **Accept:** flipping a bit makes verification return REVOKED, and the encoded list matches the spec's format, checked against a spec example if one exists.

#### T5.4 Issuance flows ⭐ — owner #3

- **EnrolmentCredential:** issued when an enrolment is fully valid.
- **DegreeCredential:** issued by `university_registrar` through `POST /v1/credentials/{enrolment_id}/issue`. It includes the APAAR ID and student ID (Req 10).
- **Storage:** credentials go to the student's wallet (`credentials` table, student-visible).
- **Accept:** issuance works for both types, and a registrar can't issue for a non-affiliated institution.

#### T5.5 Consent service + inbox 🔒 ⭐ — owner #3 (backend), #5 (UI)

- **Request:** `POST /v1/consents/requests` with `{requester, purpose, fields[], expiry}` comes from a verifier.
- **Approval:** the student, or the guardian if the student is under 18, approves with an OTP.
- **Artifact:** `consents.artifact_sig` is the signed consent artifact.
- **Revocation:** revoking makes later verifications fail.
- **Inbox UI:** pending requests, active consents, revoke button.
- **Accept:**
  - Missing, expired, revoked and out-of-scope consents are each refused.
  - For an under-18 student, only the guardian can approve.

#### T5.6 Consent-scoped VerificationCredential (D5) — owner #3

On approval, mint a short-lived VC (7 days by default) containing **only the approved fields**, signed by the issuer and with a status entry.

**Accept:** fields outside the scope are absent, and the VC verifies.

#### T5.7 Certificate PDF + QR (Req 10) ⭐ — owner #3

- **PDF (reportlab):** name, programme, year, **Student ID and APAAR ID in full**, issuer, and a QR code.
- **QR modes:**
  - **Online:** `PUBLIC_BASE_URL/v/{credential_id}?t={one_time_token}`.
  - **Offline:** `AV1:` + base45(zlib(minimal VC JSON)).
- **Size check:** **measure and log the payload size**. If it exceeds what a single QR holds reliably at error-correction level M, shorten the claims.
- **Accept:** the PDF renders, and both QR modes decode back to the original in tests.

#### T5.8 Verifier page (offline-capable) ⭐ — owner #5

- **Scanning:** html5-qrcode.
- **Offline mode, in the browser:**
  1. Base45-decode, then inflate.
  2. Canonicalise with JCS and recompute the hash.
  3. Verify Ed25519 with `@noble/ed25519` against the **cached registry snapshot**.
  4. Check validity dates and the **cached status list**.
- **Online mode:** calls `/v1/verify`.
- **Result badge:** VALID / REVOKED / UNTRUSTED ISSUER / TAMPERED / EXPIRED.
- **Cache:** registry and status lists cached in IndexedDB, with a "last refreshed" time.
- **Accept:**
  - Cross-implementation test: VCs signed by Python verify in JS, and tampered ones fail.
  - With the network disconnected (DevTools offline), the cached verification works.

#### T5.9 Student transparency view (D6) — owner #5

`GET /v1/students/me/access-log` reads audit entries scoped to the student: verifications, unmasks with their reasons, consents and exports. Show it as a timeline in the student UI.

**Accept:** the student sees only their own entries, and every unmask appears with its reason.

#### T5.10 DigiLocker mock push — owner #3

`adapters.digilocker.push_uri(student, doc)` is called on degree issuance. The mock stores the call and shows it in the student UI as "Available in DigiLocker (mock)".

**Accept:** an adapter test passes, and the UI shows the badge.

#### T5.11 Stakeholder access matrix (Req 5) 🔒 — owner #3

Write `tests/security/test_access_matrix.py`, a parameterised test over **every endpoint × every role** asserting the allowed or denied outcome from `x-roles` in the contract.

**Accept:** all combinations match the contract.

**P5 exit gate:**
- Signing and verification are green on the W3C vectors.
- REVOKED, UNTRUSTED and TAMPERED all work in the browser offline.
- The consent refusal paths are tested.
- The certificate shows both IDs.

---

### PHASE 6 — Integrations (Req 7)

#### T6.1 API polish — owner #1

- Publish the Swagger UI at `/docs` from the contract.
- Add an API-client management UI for institution admins to create or revoke clients and see scopes.
- Add an `X-Request-Id` on every response, recorded in the audit log.
- Add cursor pagination everywhere.
- Add a CI job that runs a **contract test** (e.g. schemathesis) against the running API.

**Accept:** the contract test passes.

#### T6.2 Webhooks 🔒 — owner #1

- **Events:** the ones listed in reference §12.1.
- **Signature:** `X-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, t + "." + body)>`.
- **Delivery:** retries with exponential backoff for 24 hours, then a dead-letter table.
- **Sample receiver:** `scripts/webhook_receiver.py` verifies signatures and rejects anything older than 5 minutes.
- **Accept:** signature verification passes, a replay is rejected, and a 500 response triggers a retry.

#### T6.3 ERP connector CLI ⭐ — owner #2

- **CLI:** `connector/` built with typer. Commands:
  - `apaar-connector init` writes the YAML.
  - `validate --dry-run` uses the shared `apaar_rules`.
  - `push` does a chunked upload with `Idempotency-Key = SHA-256(file)` and OAuth2 client credentials.
  - `watch` polls a folder.
  - `--since` sends deltas.
- **SQL source:** read-only connection string, query from the YAML.
- **Logs:** local and PII-free.
- **Packaging:** a PyInstaller build job in CI for Windows and Linux.
- **Accept:** the messy ERP export fixture goes end to end (connector → batch → report), and logs contain no PII (grep test).

#### T6.4 Adapter Real stubs — owner #4

Every adapter has a Mock and a Real class behind the same Protocol, selected by config. Real classes raise `NotImplementedError` with a docstring describing the onboarding steps.

**Accept:** switching the config to Mock requires no change in calling code, verified by tests.

**P6 exit gate:** the connector works end to end, webhooks are verified, and the contract test is green.

---

### PHASE 7 — Hardening, testing, evaluation (Req 8 + non-functional)

#### T7.1 Synthetic data generator — **DONE** (`synthetic/`, see `synthetic/README.md`) — owner #4

```
python -m synthetic.generate --institutions 30 --students 50000 --out data/ --seed 42
python -m synthetic.generate --preset demo --out data_demo/ --seed 7
python -m synthetic.selfcheck data/
```

- **Outputs:** messy CSV/XLSX uploads, mock APAAR and AICTE registries, 3-year history, `manifest.json`, `mutations.json` and `ground_truth.json`. The answer key covers row codes, duplicate groups, programme and batch faults, anomalies and negative controls.
- **Remaining work:**
  - Re-run with `--seat-config rules/apaar_rules/seat_categories.yaml` once T0.4 is done; the TFW and lateral caps are placeholders.
  - Set the real admission window and reporting deadline in `faults.yaml`.
- **Accept:** `selfcheck` prints OK, and two runs with the same seed are byte-identical.

#### T7.2 Detection evaluation harness — owner #4

`scripts/evaluate.py` loads a generated dataset through the real pipeline and compares the codes and flags raised against `ground_truth.json`. It computes **precision and recall per code and per anomaly rule** and writes `docs/metrics.md`.

**Accept:** it runs end to end, and the numbers are reproducible with a fixed seed.

#### T7.3 Security test suite 🔒 — owner #3

`tests/security/` covers:
- RLS bypass
- notice and pre-check oracles
- unmasking without a reason
- JWT tampering and algorithm confusion (`alg=none`, HS/RS swap)
- rate limits
- CSV formula injection
- prompt injection via headers
- PII scrubber patterns
- webhook replay
- ledger tampering
- VC tampering and an untrusted issuer
- the access matrix

Then run the **security-reviewer subagent** over the whole `backend/app/` against `docs/threat-model.md` and fix the high-severity findings.

**Accept:** all tests are green, and no high-severity finding remains open.

#### T7.4 Load test — owner #1

Use locust or k6:
- a 50,000-row batch upload
- 50 concurrent dashboard users
- 100 verifications per second

Record throughput and p50/p95 latency in `docs/metrics.md`.

**Accept:** the numbers are recorded, and any obvious bottleneck is fixed or documented.

#### T7.5 Trust metrics — owner #4

`scripts/trust_metrics.py` computes the reference §2.4 metrics on the synthetic run and appends them to `docs/metrics.md`. These are the numbers for the deck.

**P7 exit gate:** `docs/metrics.md` exists with measured numbers, and the security suite is green.

---

### PHASE 8 — Demo and pitch

#### T8.1 Demo seed — owner #6

`make demo-seed` resets the database and loads:
- Institution A: clean data
- Institution B: messy data
- Institution C: an enrolment spike
- a fake issuer key
- a scripted post-deadline edit
- a student with an issued VC and a pending consent

It must be idempotent.

#### T8.2 Demo runbook — owner #6

`docs/demo-runbook.md` gives the exact clicks and commands for the 8 steps in reference §18, the expected screen after each, and a fallback if a step fails. Use pre-generated PDFs and QR codes, and keep the backup video locally.

#### T8.3 Deck — owner #6

The deck is built outside VS Code. It uses the reference §2 numbers (re-check them the week before), `docs/metrics.md`, the architecture, real vs mocked, and future scope.

**P8 exit gate:** three clean rehearsals in under 6 minutes.

---

## Part E — Start here (day 1 checklist)

1. **#1:** T0.1 scaffold, then T0.2 Claude setup, then push. Everyone clones.
2. **In parallel:**
   - #2 starts T0.3 (data dictionary), and T0.4 once a human has downloaded the Handbook.
   - #3 starts T0.7 and T0.10.
   - #4 starts T0.8 and T0.11.
   - #5 and #6 start T0.12 once T0.5 has a first draft.
3. **#1:** T0.5 contract draft, then a review meeting with all six. **Don't start P1 until the contract and T0.6 schema are merged.**
4. **Before P2:** confirm the seat-category caps against the Handbook PDF (T0.4). This is the one task that can't be delegated to Claude.

---

## Appendix A — Definition of done (every task)

- [ ] Acceptance checks run, with output shown.
- [ ] Tests added: happy path, wrong role, wrong institution, and invalid input where relevant.
- [ ] `make lint typecheck test` is green locally and in CI.
- [ ] No PII in logs (CI greps test logs for 12-digit numbers).
- [ ] Contract and docs updated if behaviour changed.
- [ ] 🔒 tasks: security-reviewer subagent run, high-severity findings fixed.
- [ ] One commit per task, message starting with the task ID.

## Appendix B — Requirement → task index

| PS item | Tasks |
|---|---|
| Req 1 upload + update | T1.4, T1.5, T6.3 |
| Req 2 fields (intake, enrolment, supernumerary, NRI/OCI/FN, other) | T0.3, T0.4, T0.11, T2.3 |
| Req 3 duplicates / invalid-missing APAAR / excess / inconsistencies / cross-institution | T2.1, T2.2, T2.3, T3.1–T3.4, T3.5 (E501) |
| Req 4 real-time dashboards | T4.1–T4.3 |
| Req 5 secure verification for stakeholders | T3.4, T5.5, T5.8, T5.11 |
| Req 6 verifiable records | T5.1–T5.4, T5.6 |
| Req 7 integration/API | T0.5, T6.1–T6.4 |
| Req 8 security, privacy, auth, RBAC, audit, consent | T0.6, T0.7, T0.10, T1.2, T1.3, T1.6, T1.7, T3.5, T5.5, T7.3 |
| Req 9 reports | T4.5, T4.7 |
| Req 10 APAAR + student ID on certificates | T5.4, T5.7 |
| Innovation: anomaly detection, analytics | T2.4, T4.4–T4.6 |
| D1–D7 | D1: T1.7, T3.5 · D2: T3.4 · D3: T4.5 · D4: T5.1 · D5: T5.6 · D6: T5.9 · D7: T2.6 |

## Appendix C — Claude Code project files

### `.claude/agents/security-reviewer.md`

```markdown
---
name: security-reviewer
description: Reviews diffs in this repo for security flaws against docs/threat-model.md
tools: Read, Grep, Glob, Bash
model: opus
---
You are a senior application-security engineer reviewing the APAAR platform.
Review only the diff or paths you are given. Check against docs/threat-model.md and CLAUDE.md rules:
- RLS bypass, missing role/institution checks, IDOR
- PII leaving the system (logs, Gemini prompts, error messages, webhook payloads)
- Oracles (responses or timing that reveal cross-institution facts)
- Crypto misuse (nonce reuse, missing AAD, non-constant-time compares, homemade crypto outside core/crypto.py)
- Injection (SQL, CSV formula, prompt injection), deserialisation, file-upload handling
- Ledger/audit writes skipped on any enrolment mutation
Report only findings that affect security or the stated requirements, each with file:line, severity (high/medium/low) and a concrete fix. No style comments.
```

### `.claude/skills/run-task/SKILL.md`

```markdown
---
name: run-task
description: Execute one task from docs/IMPLEMENTATION_PLAN.md by its ID
disable-model-invocation: true
---
Execute task $ARGUMENTS from @docs/IMPLEMENTATION_PLAN.md.

1. Read the task's section in the plan, the reference sections it cites in @docs/APAAR_SIH_Reference.md, and only the relevant parts of @docs/openapi.yaml.
2. Propose a short plan (files to change, tests to add) and wait for my approval.
3. Implement. Follow CLAUDE.md rules. Ask before adding any dependency.
4. Run the task's Accept checks and `make lint typecheck test`. Show the output. Iterate until green.
5. If the task is marked 🔒, run the security-reviewer subagent on the diff and fix high-severity findings.
6. Summarise changed files and propose a commit message starting with the task ID.
```
