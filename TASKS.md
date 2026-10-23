# Tasks, risks, blockers

Hour 0 = 2026-10-23. Feature freeze at hour 30. Updated 2026-10-24.

## Status
`main` = `origin/main`. 106 backend tests green, frontend build green. How to run: README "Quick start".

**Done:**
- **Upload and validation:** validation with 19 deterministic codes; row-locked intake engine; cross-institution duplicates.
- **Integrity:** case workflow (resolve, unmask with reason); seat ledger with signed checkpoint and E501; RLS (`app_user`); audit.
- **Credentials (Req 5, 6, 10):** W3C VCs with `eddsa-jcs-2022` (the official vectors pass); trust registry (MOCK); status lists; consent with a guardian path (MOCK); student access log; certificate QR.
- **Reports and monitoring:** Req 9 CSV reports; D3 anomaly rules, DQS and inspection queue.
- **UI:** institution, AICTE, student, verifier and registrar portals.
- **Demo seed (T8.1):** `python -m app.demo` resets the demo database, replays the scenario through the API, and issues one credential with a pending consent request. `--live` leaves B for the on-stage upload. Runbook: `docs/demo-runbook.md` (T8.2), with the live steps rehearsed through the API.

**Decisions:**
- pyyaml is dev-only and read with `safe_load`.
- Student ID is required (E105 blank, E205 duplicate).
- The teammate owns dataset integration on a separate branch.
- The security reviewer runs only when asked.

## Open items
- **Offline browser verifier:** cached signed registry and status lists, already served. Needs JS Ed25519 and JCS libraries (a dependency decision) and IndexedDB, plus a test that Python-signed VCs verify in JS.
- **Camera QR scan** on the verifier page. Needs a QR library (a dependency decision). Base45 plus `DecompressionStream` cover the decoding.
- **D7 hi/kn error reports:** translate the templates only; placeholder-integrity test; human sign-off; UI switcher (`?lang=` already works).
- **D2 duplicate pre-check:** consent-gated, returns CLEAR/NEEDS_REVIEW only, single-use token, rate-limited, audited.
- **Gemini column mapping (use case A):** headers and synthetic samples only, PII scrubber, paid tier, confirm before apply. The fallback is the deterministic alias mapping on the dataset branch.
- **Req 7:** webhooks and the ERP connector. DigiLocker mock push (T5.10). SSE. Isolation Forest (on the cut list).
- **H30–36:** rehearse `docs/demo-runbook.md` three times (under 6 min), record a backup video, final limitations pass.
- **Dataset branch (teammate):**
  - header aliases; date, boolean and APAAR normalisation
  - XLSX, title rows and `;` delimiter
  - FOREIGN seat pool (TFW and LATERAL caps are unverified placeholders)
  - `delete` maps to withdraw
  - reseed from `registry/`, then evaluate against `ground_truth.json`

## Integration risks
1. Seat caps beyond FN/OCI/CIWG (TFW, PMSSS, J&K, PwD, lateral entry) aren't verified against the Handbook, so they aren't modelled.
2. Contract drift: `contracts.py` is the only contract; `openapi.json` is exported from it.
3. OneDrive sync may lock files during npm install.

## Known limitations
- APAAR format rule is "exactly 12 digits", with no checksum (the real algorithm isn't public). This is a mock rule.
- Rows rejected with errors aren't counted toward intake until corrected. The dashboard shows the pending-rejected count.
- NRI students may occupy the FN/OCI/CIWG supernumerary pool. The AICTE approval this needs isn't modelled.
- Precision and recall are measured on synthetic data written by the same team that wrote the rules. They prove the rules implement the spec, not real-world accuracy. Say so on the slide.
- The order-dependent labels (E201, E301, E302, E303) are derived in `gen.py` with the PRD §9.2 counting rule, so they're a consistency check, not independent ground truth.
- E303 fires once per programme per batch.
- Validation runs synchronously in the request. There's no 202 + background task.
- RLS settings are per request connection (no pool). Ledger writes are serialised by one global advisory lock.
- Open lows from the security review:
  - **L1:** `student_id_by_bi` tells an institution, during ingestion, whether a person row exists for an APAAR it submits.
  - **L2:** the API returns only an institution's own enrolment ids, but `app_user` raw SQL can still read the full `enrolment_ids` array (the other side's internal ids, no PII).
- Schema changes need `app.seed --reset`; there are no migrations. Name matching is Latin-script only.
- D3:
  - The rules run on demand, with no stored history.
  - DOB and sequential-APAAR features are per batch.
  - The mix rule needs foreign-pool history, which only the teammate's data has.
  - There are few labelled positives.
  - The duplicate-exposure component penalises both institutions in a case.
- Credentials:
  - Student sign-in is MOCK and **not authentication**: APAAR + DOB plus a fixed consent OTP let anyone who knows a DOB approve consent as the student.
  - The lockout (5 tries per APAAR per 15 min) is in-process only, can be abused to lock out a known APAAR, and has no per-IP throttle.
  - Guardian approval is self-asserted and labelled MOCK.
  - No audit row records an IP hash.
  - Verification is online only.
  - Unmask-with-reason exists only for duplicate cases.
  - Racing issuance requests with the same Idempotency-Key get a 500.
  - The consent-request APAAR oracle is fixed.
- Keys live in a local `backend/.keys.json` (prototype; production = KMS/HSM).
