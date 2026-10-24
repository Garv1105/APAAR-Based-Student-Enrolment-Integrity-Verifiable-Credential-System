# APAAR Student Data Platform (SIH26263)

AICTE platform: institutions upload student-level data keyed by APAAR ID; we validate it, detect excess and duplicate enrolment, monitor in real time, and issue W3C Verifiable Credentials verifiable with consent.

36-hour judging prototype (hybrid of the PRD and the implementation plan; see MVP_SCOPE.md for what is in/out).

- Requirements and design: `APAAR_SIH_PRD.md` (v2.1)
- Phased task plan and task IDs: `IMPLEMENTATION_PLAN.md` (6-person reference plan; only the tasks in MVP_SCOPE.md are in scope)
- Scope, deferred features: `MVP_SCOPE.md`. Progress, blockers, limitations: `TASKS.md`
- API contract (source of truth): `backend/app/contracts.py` (pydantic). `backend/openapi.json` is generated from it; never hand-edit the JSON. Change the contract first, then backend and frontend.

## Stack (actual)
- Python 3.14 venv at `.venv` (pip, pinned in `requirements.txt`), FastAPI, raw psycopg 3 (no ORM), SQL schema in `backend/app/schema.sql` + RLS in `backend/app/rls.sql` (no alembic).
- PostgreSQL 18 installed locally (no Docker on this machine). Admin URL in `backend/.env` (`DATABASE_URL`, gitignored); app runs as non-owner role `app_user`.
- Frontend (planned): Vite + React + TS in `frontend/`.

## Commands (run from `backend/`)
- Tests: `..\.venv\Scripts\python.exe -m pytest -q tests` (single: `... -m pytest tests/test_api.py::test_name`). Uses database `apaar_test`.
- Eval table: `..\.venv\Scripts\python.exe -m pytest -s tests/test_eval.py`
- Regenerate synthetic data: `..\.venv\Scripts\python.exe data/gen.py --seed 42`
- Reset + seed demo DB `apaar`: `..\.venv\Scripts\python.exe -m app.seed --reset`
- Demo seed (reset `apaar` + replay scenario through the API, credential + pending consent): `..\.venv\Scripts\python.exe -m app.demo`
- Run API: `..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload` → http://127.0.0.1:8000/docs (users inst-a, inst-b, inst-c, inst-d, aicte, auditor, employer, univ; password `demo`)
- Regenerate contract: `..\.venv\Scripts\python.exe -c "import json; from app.main import app; open('openapi.json','w').write(json.dumps(app.openapi(), indent=1))"`

## Non-negotiable rules
- Validity, seat limits and duplicate detection are deterministic code. AI (if ever added) may explain, never decide.
- IMPORTANT: No PII ever goes to an LLM or to logs. Gemini runs on the FREE tier (owner's decision, 2026-10-25; Google may use free-tier prompts), so it only ever sees synthetic, allow-listed aggregates (codes, counts, percentages, labels): never names, DOB, APAAR, guardian or row contents. All calls go through `backend/app/ai.py` (allow-listed inputs, audited, advisory output with a rule-based fallback). Re-decide the tier before any real data.
- Approved intake comes ONLY from the AICTE registry tables (mock), never from upload data.
- Every accepted enrolment row counts toward intake, with or without a valid APAAR.
- Institution isolation is enforced by Postgres RLS (`rls.sql`): app connects as `app_user` (non-owner), tables use FORCE ROW LEVEL SECURITY, role/institution set per connection in `db.py`. Cross-institution checks go only through the SECURITY DEFINER functions in `rls.sql`.
- Crypto only in `app/crypto.py` (AES-GCM with AAD = table|column|row_id, HMAC blind indexes, Ed25519, JCS). No ad-hoc hashing elsewhere except the ledger's chain hashes via crypto helpers.
- Every enrolment mutation appends to the ledger; every PII read/export/unmask/verification writes an audit row. Unmask requires a reason.
- Cross-institution duplicate notices reveal nothing about the other institution. No endpoint looks up arbitrary APAARs outside the caller's own institution.
- Validation codes come only from `app/codes.py`; user-facing messages come from `backend/i18n/<locale>.json` templates.
- Errors are `application/problem+json`. Writes accept `Idempotency-Key` (same key + different body → 422).
- Mocks are labelled MOCK. Never claim compliance, security or integration that hasn't been verified with evidence.
- Ask before adding any dependency.

## Testing
- Every endpoint has a wrong-role and a wrong-institution case (`tests/test_access_matrix.py`).
- Don't weaken tests to pass; fix the code, or fix a test only when its expectation was demonstrably wrong (say so).
- Run the `security-reviewer` agent (`.claude/agents/security-reviewer.md`) only when asked; after security-relevant changes, offer it in one line.
- Show test output as evidence.

## Git
- Branch `t<task-id>-<slug>`; one commit per task, message starts with the task ID (e.g. `T2.3: intake engine`). Merge to `main`.

## Compaction
When compacting, preserve: current task ID, files modified, failing tests and the exact test commands.
