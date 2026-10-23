# MVP Scope — APAAR SIH26263 judging prototype

Source of truth for requirements: `APAAR_SIH_PRD.md` v2.1. This file says what the 36h build actually delivers.
Status legend: **IN** = built and tested in this prototype, **DEFER** = documented, not built.

## Mandatory flow covered
`Institution upload → APAAR validation (mock registry) → data verification (rules, intake, duplicates) → central repository (Postgres, encrypted) → analytics (dashboards, CSV reports) → authorized verification (W3C VC + consent)`

## Included (IN)

| # | Feature | PS req | Test criterion |
|---|---|---|---|
| 1 | CSV upload + JSON `POST /v1/batches`, `Idempotency-Key` | 1, 7 | Same key twice → same batch id, no duplicate rows |
| 2 | Update path `PATCH /v1/enrolments/{id}` (correct / withdraw / migrate) | 1 | Withdrawn enrolment leaves counts and duplicate checks |
| 3 | Data dictionary fields: approved intake (registry only), enrolment counts, supernumerary pool, NRI/OCI/FN/CIWG flags, lateral entry, admission date, year of study, guardian name, institution student ID | 2 | Schema + `data/README` dictionary; E303 when declared ≠ registry |
| 4 | Validation codes E101, E101W, E102, E103, E104, E201, E202, E203, E301, E302, E303, E304, E401, E402, E403, E404, E501 | 3 | One unit test per code; precision/recall on labelled synthetic data |
| 5 | Intake engine: regular pool vs approved intake, FN/OCI/CIWG supernumerary 15% cap with CIWG 1/3 sub-cap, every accepted row counted with or without APAAR, row-locked counters | 2, 3 | Concurrency test: two parallel batches produce exactly the expected number of E301 flags |
| 6 | Field encryption (AES-256-GCM) for APAAR, name, DOB, guardian; HMAC blind indexes (separate keys); masked APAAR display | 8 | Standards test vectors (NIST GCM, RFC 4231); DB contains no plaintext APAAR |
| 7 | Cross-institution exact duplicate via APAAR blind index, case workflow, neutral notice to the second institution | 3 | Seeded pair caught; notice text contains no other-institution data |
| 8 | Seat ledger: hash-chained enrolment events + Ed25519-signed head checkpoint, `verify` endpoint; E501 on post-deadline mutation | 3, 8 | Editing any stored ledger row → verification fails |
| 9 | Auth: seeded users, JWT, role guard (institution_admin, aicte_officer, auditor, verifier, student); institution scoping; audit log of reads/writes/unmask/verify | 8 | Institution B cannot read A's rows; tampered JWT rejected |
| 10 | W3C VC 2.0 EnrolmentCredential + DegreeCredential with `eddsa-jcs-2022`, trust registry (`did:web` style ids), Bitstring Status List revocation | 5, 6 | Round-trip VALID; flip bit → REVOKED; unknown issuer → UNTRUSTED; edit → TAMPERED; past validUntil → EXPIRED |
| 11 | Consent: verifier requests fields, student approves (mock OTP), consent-scoped short-lived VerificationCredential, refused if missing/expired/revoked/out-of-scope | 5, 8 | Tests for each refusal reason |
| 12 | Printable certificate page with APAAR ID + student ID + QR (online verify URL) | 10 | Page shows both IDs; QR resolves to VALID |
| 13 | Dashboards: institution (intake vs filled by category, batches, issues, notices) and AICTE (national totals, excess ranking, category mix, cases, ledger status), 3s polling | 4 | Upload changes AICTE numbers within one poll |
| 14 | CSV reports: accreditation pack, state summary, category utilisation, excess-admission case file (formula-injection safe) | 9 | Each export downloads; cells starting `= + - @` are neutralised |
| 15 | Student transparency view: access log of their record | 8 | Verification and unmask appear in the student's log |
| 16 | Explainable anomaly rules (fill-ratio robust z vs 3-yr history, category-mix shift) + simple DQS — **only if time before hour 30** | Innovation, 4 | Each flag shows its evidence numbers |

## Deferred (DEFER), with reason
- Gemini: column mapping, translations, anomaly narrative, ask-the-data, policy drafts. Not needed for deterministic core; adds no-PII and paid-tier obligations.
- Multilingual error reports (D7): depends on reviewed translations. English only.
- ERP connector CLI, webhooks, DigiLocker mock, OAuth2 client credentials (JWT only).
- Fuzzy duplicate matching (E204) — PRD cut-list item 5. Blind-index columns exist, matcher not built unless time.
- Merkle-tree daily checkpoints (simple signed chain head instead), duplicate pre-check D2.
- Isolation Forest, PDF reports (CSV only; certificate is an HTML print page).
- Postgres row-level security — stretch; institution scoping is enforced in API code and tested.
- Guardian consent for under-18 students: data field exists, flow not built.
- SSE (polling instead), Docker Compose (no Docker on host).

## Mocked (labelled `MOCK` in UI and `"source": "mock"` in API)
APAAR registry, AICTE EOA/approval registry, OTP, identity provider (seeded users). All data is synthetic.

## Dependencies (pinned in `requirements.txt`)
Python 3.14.2: fastapi, uvicorn, psycopg[binary] 3.3, pydantic 2, cryptography 50, rfc8785, base58, pyjwt, argon2-cffi, pandas, openpyxl, rapidfuzz, jellyfish, qrcode, pytest, httpx.
Node 22.16: Vite, React, Recharts (frontend, versions pinned at install).
PostgreSQL 18 (local).
