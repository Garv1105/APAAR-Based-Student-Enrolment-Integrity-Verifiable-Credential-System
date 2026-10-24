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
- **P1 passkey consent (Req 5, 8):**
  - WebAuthn passkeys from one-time institution activation codes (keyed hash only, reason audited).
  - Discoverable sign-in. Consent assertions are bound to the request's terms, with user verification required.
  - Guardian passkeys for minors; minor status is checked on the day of each request.
  - Reissue cooldown (24 h) and a student notice; reissue count on the AICTE dashboard.
  - The MOCK DOB/OTP path exists only behind `DEMO_MODE`.
- **W1 webhooks + ERP connector (Req 7):** Standard Webhooks signing; outbox with retries and backoff; delivery log; redeliver; secret rotation (24 h overlap); max 5 endpoints; SSRF guard that pins the validated IP (Host + SNI); `tools/erp_connector/` (YAML mapping, file-hash Idempotency-Key, verifying receiver).
- **A0 anomaly package:** `backend/app/anomaly/` (`rules.py` = the five D3 rules unchanged, `stats.py` shared helpers); same public interface. Spec: `docs/ANOMALY_V2_SPEC.md`.
- **A1 peer baselines:** each programme (and each institution, for rejection rate and late uploads) is compared with similar units this year (programme+state+size, then programme+size, then programme; institutions: state+size, then size; at least 8 peers). Uses peer robust z, one-sided p (`math.erfc`), Benjamini–Hochberg at q=0.05 across all tests nationally, plus a minimum practical gap. Fill and foreign share are tested raw only for programmes with no history; with history, their change is tested. Regulator-only. Too few peers gives "insufficient peers" (`GET /v1/anomalies/peer-status`); today's 4-college DB has no peer groups.
- **A3 shared-student network:** regulator-only `shared_student_edges(year)` (blind-index join, counts only: active, historical, A→B→A carousel). Rings are found on the 2-core of the kept-edge graph via union-find (`SHARED_STUDENT_RING`, with active sharing inside the ring counted in the ring flag); `SEAT_BLOCKING` for pairs outside rings. `GET /v1/network` feeds an AICTE SVG network view (kept edges by default, "show all" toggle, edge counts, drill-down to the duplicate cases).
- **A4 inspector feedback:** AICTE officers confirm, dismiss or mark "needs info" on a flag, with a written reason (audited, idempotent). Each rule's precision uses a Beta(1,1) prior with a 90% interval, and its weight is max(0.25, precision), so no rule can be silenced. Queue risk = active × ((100 − DQS) + Σ weight × severity × 10). Severity is mapped per rule to 0..1. A dismissed flag stays hidden until its primary evidence field moves more than 20%. The Rule performance panel shows per-reviewer dismissal rates. Fairness: an open duplicate case counts only against the institution whose enrolment was uploaded later.
- **Demo seed (T8.1):** `python -m app.demo` resets the demo database, replays the scenario through the API, and issues one credential with a pending consent request. `--live` leaves B for the on-stage upload. Runbook: `docs/demo-runbook.md` (T8.2), with the live steps rehearsed through the API.
- **T-WORLD national synthetic world:** `seed.py` loads `foreign_filled` (NULL when missing). `WORLD_DIR=<world>` (process env only, never `.env`; tests clear it) adds a generated world's registry and APAAR people on top of the repo's, so the data stays outside the repo. On `POST /v1/batches`, `X-Demo-Upload-Time` sets the batch's upload time (`created_at` and deadline features) only with `DEMO_MODE=true`; otherwise it is ignored and audited (`batch.demo_clock_ignored`). `tools/load_world.py` replays the manifest (PATCH via `GET /v1/enrolments?apaar=`); `tools/eval_world.py` scores the result against `ground_truth.json`. Last run (seed 2026, 300 colleges): 151/156 checks pass. Every validation code, E203 count, row error, ring, seat-blocking pair and negative control passes. Misses: NEW_COLLEGE_OUTLIER (PEER_OUTLIER 0/4, with 27 unexplained peer flags, mostly institution-level `late_share` because many world uploads land in the final day) and 1 of 4 SUBTLE_PROFILE colleges outside the queue's top 10% (rank 46/300).

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
- DigiLocker mock push (T5.10). SSE. Isolation Forest (on the cut list).
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
- A1 peer baselines:
  - Rejection rate is institution-level only, because rejected rows carry no programme.
  - Peer flags aren't counted in the DQS (it stays own-data only, so it matches the institution's own view).
  - The peer rule needs at least 8 similar units per group, so it does nothing until the 300-college world is loaded.
- A3 network:
  - `historical_shared` and `carousel` need multi-year enrolment and migration data; on today's single-year data they are about 0, so edges mostly reflect students active at two colleges.
  - The carousel detects return trips (A→B→A) only, not 3-college loops.
  - A ring's shared-student total adds up edge counts, so a student shared by 3 colleges counts on each edge.
  - Students without an APAAR are not in the network.
- A4 feedback:
  - Precision is learned only from flags inspectors actually review, so it leans toward flags that already rank high (normal for human-in-the-loop systems). Recall can't be learned from reviews; it comes only from the synthetic evaluation.
  - "First" in the fairness rule means first uploaded to the platform (enrolment id), not the self-declared admission date.
  - Severity mappings are fixed constants in `feedback.py`, not tuned on data.
  - No dual control: one officer's dismissal hides a flag, and it can override another officer's review. Mitigations in place:
    - re-dismissing keeps the first dismissal's evidence as the baseline
    - dismissed flags stay listed (marked, with reviewer and reason) in `/v1/anomalies`
    - per-reviewer dismissal rates are shown
  - Not done:
    - second-officer sign-off for high-severity dismissals
    - dismissal expiry
  - The reason field rejects digit runs and dates, but it is free text, not a full PII scrubber. It is stored for regulators only and not written to the audit log.
  - Fairness side effect: an institution's own `duplicate_exposure` reveals whether another college's enrolment of the student came first. The neutral notice already tells both sides that a case exists. A scoped regulator-only path is the long-term fix (see L2).
  - Each review recomputes all flags (peer and network) to find the key. There is no per-officer rate limit.
- Credentials:
  - Student sign-in and consent use **passkeys** (P1). The old APAAR + DOB + fixed-OTP path exists only with `DEMO_MODE=true`, labelled MOCK.
  - Activation codes reach the student out of band. In the prototype the institution hands them over; production delivers them via DigiLocker or the registered mobile number. Whoever holds an unused code can register the passkey; a reissued code puts a 24 h consent cooldown on the new passkey and notifies the student.
  - Attestation is not checked (`none`): we trust that the user has *a* passkey, not a specific authenticator model.
  - Students without an APAAR (provisional ID only) can't activate yet.
  - The guardian's identity rests on the institution issuing the guardian code to the right person.
  - **M2 closed (P1.1):** every new passkey waits `PASSKEY_FIRST_COOLDOWN_HOURS` (default 24) before its first consent approval, so an intercepted first code can't be used at once; reissued codes always wait 24 h. The live demo sets it to 0: `python -m app.demo --live` writes `PASSKEY_FIRST_COOLDOWN_HOURS=0` into `backend/.env`. Production should also deliver codes via DigiLocker or the registered mobile number.
  - No activation codes while the person is active at another institution or in an open duplicate case, unless AICTE resolved their case as a false positive (P1.1). After a false positive both institutions can issue codes for the shared person row; each revokes only the passkeys its own codes created.
  - Throttles: activation 5 per APAAR + 20 per client per 15 min; sign-in options 30 per client per minute; approvals 10 per student per 15 min. All in-process.
  - The lockout (5 tries per APAAR per 15 min) is in-process only, can be abused to lock out a known APAAR, and has no per-IP throttle.
  - Guardian approval is self-asserted and labelled MOCK.
  - No audit row records an IP hash.
  - Verification is online only.
  - Unmask-with-reason exists only for duplicate cases.
  - Racing issuance requests with the same Idempotency-Key get a 500.
  - The consent-request APAAR oracle is fixed.
- Webhooks (W1):
  - The dispatcher is one in-process poller thread (restart-safe through the outbox table). There is no separate worker.
  - Institutions only; university registrars can't register endpoints.
  - `case.opened` fires whenever a batch adds an enrolment to a case, new or existing.
  - Up to ~5 s per attempt is spent holding the delivery row lock.
  - The connector's receiver remembers seen event ids in memory only.
  - No UI yet (API + connector only).
- Keys live in a local `backend/.keys.json` (prototype; production = KMS/HSM).
