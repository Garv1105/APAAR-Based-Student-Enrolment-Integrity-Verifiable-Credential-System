# Tasks, risks, blockers

Hour 0 = 2026-10-23 (session start). Feature freeze at hour 30.

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
- [ ] Frontend shell: login/role switch, upload page, two dashboards  ← NEXT
- [x] Eval through API + Postgres: 450/450 rows exact, E501 patch steps correct

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
- [ ] RLS

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
Gemini features, D7 translations, ERP connector, webhooks, DigiLocker, fuzzy matching, Merkle checkpoints, D2 pre-check, Isolation Forest, PDF reports, RLS (stretch), guardian consent flow, SSE (stretch).

## Known limitations
- APAAR format rule is "exactly 12 digits"; no checksum (real algorithm not public). Stated as mock rule.
- Rows rejected with errors (e.g. E101 missing APAAR with no reason) are not counted toward intake until corrected; the dashboard shows the pending-rejected count so they can't silently vanish.
- NRI students may occupy the FN/OCI/CIWG supernumerary pool; the AICTE approval required for that is not modelled.
- Precision/recall is measured on synthetic data written by the same team that wrote the rules: it proves the rules implement the spec, not real-world detection accuracy. Say so on the slide.
- Order-dependent labels (E201, E301, E302, E303) are derived in `gen.py` by re-applying the PRD §9.2 counting rule, so those four are a consistency check, not independent ground truth.
- E303 fires once per programme per batch, on the first accepted row with a mismatching declaration.
- Validation runs synchronously in the request (no 202 + background task / SSE); fine for demo-sized batches, measured later.
- Institution isolation is enforced in API queries (tested), not yet by Postgres RLS.
- Ledger writes are serialised by one global advisory lock.
- Name matching is Latin-script only (no Indic transliteration).
- Keys come from a local `backend/.keys.json` file generated at first run (prototype only; production = KMS/HSM).
