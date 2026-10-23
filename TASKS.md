# Tasks, risks, blockers

Hour 0 = 2026-10-23 (session start). Feature freeze at hour 30.

## ▶ Next steps and open decisions (handoff, updated 2026-10-23)

**Decisions made (2026-10-23):**
- **Order:** credentials and consent first (Req 5, 6 and 10). The teammate's dataset integration happens in parallel on a separate branch.
- **`pyyaml`:** pinned in `requirements-dev.txt` (script-only); YAML is read with `safe_load` only.
- **Student ID:** required and unique per institution. Codes **E105** (blank) and **E205** (duplicate in the file, or matching an active enrolment at the same institution) are done. The teammate is adding the column to `synthetic/`.
- **Plan file:** `IMPLEMENTATION_PLAN.md` kept, with the T7.1 section merged in. The generator source is committed in `synthetic/`. `*.zip`, `/data/` and `/data_demo/` are gitignored.

**Where things stand:** `main` = `36c3bf4` on GitHub. Local, not yet pushed: T7.1 generator, T2.2 student ID, and T5.x credentials (branch `t5.2-vc`).
- **Backend:**
  - upload; deterministic validation (19 codes); intake engine with row locks; cross-institution duplicates; seat ledger; RLS (`app_user`); audit; typed contract
  - **W3C credentials:**
    - Enrolment, Degree and consent-scoped Verification credentials, signed with `eddsa-jcs-2022` (official W3C vectors pass byte for byte)
    - trust registry (MOCK), Bitstring Status Lists, verify endpoint
    - consent with a guardian path (MOCK), student transparency log, certificate QR (`AV1:` + Base45)
- **Frontend:**
  - sign-in (staff and students); upload; batch issues; institution and AICTE dashboards
  - institution student records; student portal; verifier portal; registrar page; printable certificate; verify tool
- **Checks:**
  - 83 backend tests green
  - frontend build green
  - headless walkthroughs of the upload/monitoring flow and of the full credentials demo (issue → consent → VALID → withdraw → REVOKED → degree + certificate → forged = UNTRUSTED), both passing
- **Security reviews (credentials 59d5172, consent d61a174):** no high findings. All mediums fixed; lows fixed except those listed under limitations.
- **How to run:** README "Quick start", or the CLAUDE.md commands.

**Open items (not started):**
- **Offline browser verifier:** verify a VC with no network, using a cached AICTE-signed registry snapshot and status lists (both already served signed, with a 24 h expiry). Needs JS Ed25519 + RFC 8785 JCS libraries (dependency decision) and IndexedDB caching. Add a cross-implementation test: Python-signed VCs verify in JS, tampered ones fail.
- **Camera QR scan:** scan the certificate QR (`AV1:` + Base45) on the verifier page. Needs a QR-scanning library (dependency decision); Base45 decoding plus native `DecompressionStream('deflate')` cover the rest.
- **D3 anomaly engine, DQS and inspection queue:** explainable rules (fill ratio vs 3-year history by robust z, category-mix shift, DOB cluster, sequential APAAR, deadline dump), evidence shown on every flag, a Data Quality Score with visible components, and a risk-ranked inspection queue. `synthetic/` ground truth already labels these anomalies.
- **D7 multilingual error reports (hi, kn):** translate `backend/i18n/en.json` templates only (no data); every placeholder must survive; a human reviewer signs off and is recorded in each file; a placeholder-integrity test; a language switcher in the UI. The rendering path (`?lang=`) already exists.
- **D2 duplicate pre-check:** consent-gated endpoint that returns only CLEAR or NEEDS_REVIEW; single-use signed student consent token; rate-limited and audit-logged; no oracle.
- **Gemini column mapping (use case A):** headers plus synthetic samples only, behind a PII scrubber and audit, paid tier only, confirm before apply, outputs limited to enum targets. Needs a billing-enabled key and a dependency decision. Deterministic alias mapping (dataset branch) is the fallback.

**Next task options:**
- **A. Credentials (T5.1–T5.9), done.** Remaining credential gaps:
  - offline browser verifier (needs JS Ed25519 + JCS dependencies)
  - camera QR scanning
  - a real guardian identity
  - DigiLocker mock push (T5.10)
- **B. Dataset integration (~5–7 h), owned by the teammate on a separate branch:**
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
- [x] eddsa-jcs-2022 issue/verify (official W3C vectors), trust registry, status lists (T5.1–T5.4)
- [x] Consent request/approve/deny/revoke, consent-scoped VerificationCredential, guardian path (MOCK) (T5.5, T5.6)
- [x] Verifier page, student portal, registrar page, institution student records

### H22–27 Outputs
- [x] Certificate print page + QR with APAAR ID and student ID (T5.7)
- [x] Student access log (T5.9)
- [ ] CSV policy/accreditation reports (Req 9)

### H27–30 Stretch (drop first)
- [ ] Anomaly rules + DQS
- [ ] SSE

### H30–36 Reliability only
- [ ] Full eval, security checks, demo seed, rehearsal, final limitations

## Blockers
- ~~B1 Postgres unreachable / password unknown~~ resolved: user fixed the listener and added credentials to `backend/.env`.

## Integration risks
1. Python 3.14 wheels — **resolved**, all deps installed.
2. Bitstring Status List minimum length (131,072): **resolved**. Confirmed in the W3C spec source (16KB uncompressed) and implemented.
3. Seat caps beyond FN/OCI/CIWG (TFW, PMSSS, J&K, PwD, lateral entry) are not verified against the Handbook → not modelled.
4. Contract drift: `contracts.py` is the single contract; `openapi.json` exported from it.
5. OneDrive sync may lock files during npm install.
6. eddsa-jcs-2022 interoperability: **resolved**. The official W3C vectors (w3c/vc-di-eddsa @ 13e7070) reproduce byte for byte.

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
- Credentials:
  - Student sign-in is MOCK and **not authentication**:
    - APAAR + DOB plus a fixed consent OTP means anyone who knows a candidate's DOB (e.g. an employer) can sign in as the student and approve its own consent request.
    - Lockout: 5 attempts per APAAR per 15 min, reserved before the lookup (race-safe). It is in-process only, can be abused to lock out a known APAAR, and there is no per-IP throttle.
    - Guardian approval is self-asserted, and labelled MOCK in the consent artifact.
    - Production needs APAAR/DigiLocker authentication and real OTP delivery.
  - The consent-request audit row records the request id but no client IP hash (no audit row records IPs yet).
  - Verification is online only; there is no offline browser verifier and no camera scanner (both listed as open items).
  - The APAAR existence oracle on consent requests is **fixed**: identical responses, 20/hour per verifier, audited, and verifiers have no direct SQL access to `consents`.
  - Regulators see credentials masked, but there is no unmask-with-reason endpoint yet.
  - Two requests racing with the same issuance Idempotency-Key get a 500 instead of a replay.
- Keys come from a local `backend/.keys.json` file generated at first run (prototype only; production = KMS/HSM).
