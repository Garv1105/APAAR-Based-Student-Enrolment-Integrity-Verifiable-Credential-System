# Tasks, risks, blockers

Hour 0 = 2026-10-23 (session start). Feature freeze at hour 30.

## ▶ Next steps and open decisions (handoff, updated 2026-10-23)

**Where things stand:** `main` = `5703b37` on GitHub.
- **Backend:** upload, deterministic validation (17 codes), intake engine with row locks, cross-institution duplicates, seat ledger, RLS (`app_user`), audit, typed contract.
- **Frontend:** sign-in, upload, batch issues, institution and AICTE dashboards.
- **Checks:** 51 backend tests green; frontend build green; headless UI check passed at desktop and 390 px.
- **How to run:** README "Quick start", or the CLAUDE.md commands.

**Untracked files, waiting on decision 4 below (not committed):**
- `IMPLEMENTATION_PLAN_Dataset.md`: the same plan with T7.1 marked DONE.
- `synthetic.zip`: a teammate's generator plus an independent `selfcheck.py`. Reviewed: no network or subprocess use. Needs `pyyaml`.
- `data_demo.zip`: generator output, seed 7: 4 institutions, 1,897 rows, answer key.

**Open decisions for the user** (asked, not yet answered):
1. **Order:** build credentials and consent first (Req 5, 6 and 10 are still at zero; recommended), or integrate the teammate's dataset first?
2. **`pyyaml`:** may it be added as a dependency so `synthetic/` generate and selfcheck can run?
3. **Student ID:** the teammate's uploads have no `institution_student_id`, which Req 10 prints on certificates. Either (a) make it optional and show a platform-generated ID, or (b) ask the teammate to add the column.
4. **Plan file and zips:** replace `IMPLEMENTATION_PLAN.md` with the Dataset version? Keep the zips out of git and extract only the generator into `synthetic/`?

**Next task options:**
- **A. Credentials (T5.1–T5.8):**
  - Fetch the official `eddsa-jcs-2022` test vectors from the W3C spec and match them exactly before trusting the implementation.
  - Then build the trust registry (`did:web` style), the Bitstring Status List (confirm the 131,072 minimum in the spec), consent (request → mock OTP approve → scoped VerificationCredential), the verifier page (VALID/REVOKED/UNTRUSTED/TAMPERED/EXPIRED) and the printable certificate with APAAR ID, student ID and QR.
  - Credential, consent and issuer tables already exist with RLS deny-by-default; add policies with each feature.
- **B. Dataset integration (~5–7 h):**
  - Deterministic header-alias and value normalisation: dates in `dd/mm/yyyy`, `dd-mm-yyyy`, `dd.mm.yyyy` and Excel serials; Y/Yes/1/TRUE booleans; APAAR with spaces or hyphens is valid; category spellings.
  - XLSX input, title rows, `;` delimiter.
  - Seat model with REGULAR/FN/OCI/CIWG/NRI in a FOREIGN pool (TFW and LATERAL caps are unverified placeholders, so don't treat them as real).
  - Mutation `delete` maps to withdraw, because there is no delete endpoint by design.
  - Reseed from their `registry/`, and an evaluation script against their `ground_truth.json`. Programme-level E301/E302/E303 count as a hit if any row in that programme carries the code.

**Also still open:** case resolution and AICTE unmask with reason (closes security-review L2), CSV policy reports (Req 9), anomaly rules and DQS, SSE.

## Checklist
### H0–3 Foundation
- [x] Repo + runtime inspection
- [x] Python venv + deps (`requirements.txt`)
- [x] MVP_SCOPE.md, TASKS.md
- [x] Schema `backend/app/schema.sql`
- [x] API contract `backend/app/contracts.py`
- [x] Seed registries `backend/data/seed/`
- [x] Synthetic generator + ground truth `backend/data/gen.py`
- [x] Crypto module + standards test vectors
- [x] Pure validation engine + one test per code (31 tests green)
- [x] In-memory eval on 450 labelled rows: precision/recall 1.000 for all 17 row-level codes (`pytest -s tests/test_eval.py`)
- [x] DB connection + schema load (`apaar` database on local PG 18.6, 21 tables)
- [x] `git init` + first commit

### H3–10 Vertical slice
- [x] Batch upload (CSV multipart / text/csv / JSON) → validate → store encrypted → issues + report CSV
- [x] Row-locked intake counters + concurrency test (2×70 rows vs intake 120 → exactly 20 E301)
- [x] Institution + AICTE dashboard endpoints
- [x] Frontend: login/role switch, upload (drag-drop, idempotent re-upload), batch issues with filters, institution + AICTE dashboards (3 s polling); verified headless at desktop + 390 px, no console errors
- [x] Eval through API + Postgres: 450/450 rows exact, E501 patch steps correct

### Hybrid hardening (CLAUDE.md rules adopted)
- [x] T0.2 CLAUDE.md matches actual stack; security-reviewer agent
- [x] T1.3 AES-GCM AAD = table|column|row_id
- [x] T0.8 codes in app/codes.py, messages from i18n/en.json (+ fix hints)
- [x] T1.4 Idempotency-Key bound to request hash (reuse with other body → 422)
- [x] T0.6 Postgres RLS: app_user non-owner, FORCE RLS, SECURITY DEFINER cross-institution functions, raw-SQL isolation tests
- [x] T5.11 access matrix: 13 endpoints × 7 callers

### H10–15 Integrity (pulled forward, backend done)
- [x] E202/E203 against DB, duplicate cases, neutral notice to both institutions
- [ ] Case resolve endpoint + AICTE unmask-with-reason
- [x] PATCH enrolment (withdraw/migrate decrements counters), ledger chain + signed checkpoint + E501
- [x] JWT auth, role guard, audit log on writes/reads/exports

### H15–22 Verification
- [ ] eddsa-jcs-2022 issue/verify, trust registry, status list
- [ ] Consent request/approve, VerificationCredential
- [ ] Verifier page

### H22–27 Outputs
- [ ] Certificate print page + QR
- [ ] AICTE charts, CSV reports, student access log

### H27–30 Stretch (drop first)
- [ ] Anomaly rules + DQS
- [ ] SSE

### H30–36 Reliability only
- [ ] Full eval, security checks, demo seed, rehearsal, final limitations

## Blockers
- ~~B1 Postgres unreachable / password unknown~~ resolved: user fixed the listener and added credentials to `backend/.env`.

## Integration risks
1. Python 3.14 wheels — **resolved**, all deps installed.
2. Bitstring Status List minimum length (131,072) — confirm in W3C spec before claiming herd privacy.
3. Seat caps beyond FN/OCI/CIWG (TFW, PMSSS, J&K, PwD, lateral entry) are not verified against the Handbook → not modelled.
4. Contract drift: `contracts.py` is the single contract; `openapi.json` exported from it.
5. OneDrive sync may lock files during npm install.
6. eddsa-jcs-2022: interoperability depends on matching the W3C spec test vector; until checked it is "self-consistent only".

## Not implemented (see MVP_SCOPE.md Deferred)
Gemini features, D7 translations, ERP connector, webhooks, DigiLocker, fuzzy matching, Merkle checkpoints, D2 pre-check, Isolation Forest, PDF reports, guardian consent flow, SSE (stretch).

## Known limitations
- APAAR format rule is "exactly 12 digits"; no checksum (real algorithm not public). Stated as mock rule.
- Rows rejected with errors (e.g. E101 missing APAAR with no reason) are not counted toward intake until corrected; the dashboard shows the pending-rejected count so they can't silently vanish.
- NRI students may occupy the FN/OCI/CIWG supernumerary pool; the AICTE approval required for that is not modelled.
- Precision/recall is measured on synthetic data written by the same team that wrote the rules: it proves the rules implement the spec, not real-world detection accuracy. Say so on the slide.
- Order-dependent labels (E201, E301, E302, E303) are derived in `gen.py` by re-applying the PRD §9.2 counting rule, so those four are a consistency check, not independent ground truth.
- E303 fires once per programme per batch, on the first accepted row with a mismatching declaration.
- Validation runs synchronously in the request (no 202 + background task / SSE); fine for demo-sized batches, measured later.
- RLS settings are session-level per request connection (no pool). student_id_by_bi() reveals to an institution, during ingestion only, whether a person row already exists for an APAAR it is submitting.
- Ledger writes are serialised by one global advisory lock.
- Security review t0.6 (no high findings; M1–M3, L3–L5 fixed). Open lows: L1 student_id_by_bi tells an institution, during ingestion, whether a person row exists for a submitted APAAR; L2 an institution can read the full enrolment_ids array of a duplicate case it is part of (other side's internal ids, no PII) — fix with a scoped view when case resolution is built.
- Schema changes need `app.seed --reset` (drops and rebuilds the demo DB); there are no migrations.
- Name matching is Latin-script only (no Indic transliteration).
- Keys come from a local `backend/.keys.json` file generated at first run (prototype only; production = KMS/HSM).
