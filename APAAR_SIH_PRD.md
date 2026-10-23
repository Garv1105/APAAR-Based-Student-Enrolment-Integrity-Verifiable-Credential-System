# SIH Reference: APAAR-Based Student Data Management and Verification System

**Version 2.1** | Team of 6 | Phased execution plan (see §16) | PS **SIH26263**: AICTE APAAR ID student data platform

> **What changed in v2**
> - Fixed 12 design bugs (§3). These cover hashing vs analytics, encryption vs fuzzy matching, the missing student role, the duplicate-check oracle, per-category supernumerary caps, missing-APAAR handling, intake source of truth, concurrency and the Gemini privacy boundary.
> - Added a full **W3C Verifiable Credentials** design (§11).
> - Added integrations: Gemini, ERP connector, DigiLocker, APAAR/ABC adapters, webhooks (§12).
> - Added a **Why it matters** section with sourced numbers, plus the platform's own trust metrics (§2).
> - Added **ideas to make it stand out**, each mapped to a PS requirement (§19).
> - The synthetic data generator is a placeholder (§15). We'll design it later.
>
> **v2.1:** In-scope differentiators locked (§19.1: Seat Ledger, duplicate pre-check, DQS + risk-based inspection, trust registry, consent-scoped credentials, student transparency view, **multilingual error reports**). Stretch and roadmap ideas moved to Future scope (§19.2). Added the end-to-end phased execution plan with a requirement traceability matrix (§16).

---

## 0. Problem Statement (verbatim from SIH)

SIH26263: Development of an APAAR ID-Based Student Data Management and Verification Platform for AICTE-Approved Institutions

Problem Description AICTE currently receives student-related information from approved institutions through different data submission mechanisms. While PGDM institutions provide detailed student data annually, other AICTE-approved institutions primarily provide statistical information such as total enrolment during the approval process. This creates challenges in maintaining complete, authentic, and verifiable student records. With APAAR ID serving as a national academic identity, there is a need to develop an integrated digital platform that uses APAAR ID as a unique academic identifier for students enrolled in AICTE-approved institutions. The proposed solution should enable institutions to securely submit student-level data to the AICTE portal after the completion of admissions and facilitate real-time verification and monitoring of student records. Key Requirements 1. Develop a secure platform/API through which AICTE-approved institutions can upload and update student-level information using APAAR ID as the unique identifier. 2. Provide data fields for: o Approved Intake o Actual Student Enrolment o Supernumerary Seats o NRI Category o OCI Status o Foreign National (FN) Status o Other relevant student information. 3. Provide automated validation to identify: o Duplicate student records o Invalid/missing APAAR IDs o Admissions exceeding approved intake o Inconsistencies in student data o Potential duplicate enrolment across institutions. 4. Develop dashboards for AICTE and institutions for monitoring admissions and student records in real time. 5. Provide a secure verification mechanism for authorized stakeholders such as AICTE, institutions, employers, and other regulatory bodies. 6. Enable generation of verifiable student records linked to the student's academic identity. 7. Provide integration/API capability with existing institutional and AICTE systems. 8. Ensure appropriate data security, privacy, authentication, role-based access control, audit trails, and consent mechanisms. 9. Enable generation of reports for policy-making, accreditation, monitoring, and regulatory purposes. 10. Support printing/display of APAAR ID along with the student ID on certificates issued by degree-awarding bodies. Expected Solution Participants are expected to develop a scalable, secure, interoperable and user-friendly APAAR-based Student Data Management and Verification System that can be integrated with the AICTE portal. The solution should provide: Institution → Student Data Upload → APAAR Validation → Data Verification → AICTE Central Repository → Analytics & Monitoring → Authorized Verification Expected Outcome The proposed solution should enable AICTE to establish authentic and verifiable student records linked to a national academic identity, facilitate real-time monitoring of admissions, detect excess enrolment, and strengthen data-driven governance and policy formulation. Innovation Expected The solution should go beyond simple data collection by providing automated validation, intelligent anomaly detection, real-time monitoring, secure verification, and analytics, thereby creating a reliable national-level student data ecosystem for AICTE-approved institutions.

---

## 1. Problem in one paragraph

AICTE receives detailed student data only from PGDM institutions. Other approved institutions mostly submit totals (e.g. "480 enrolled"). AICTE therefore cannot easily detect excess enrolment, double enrolment across institutions, or unverifiable records. The task: build a secure platform where institutions upload student-level data keyed by **APAAR ID**, the system validates it, AICTE monitors it in real time, and authorised parties can verify records with student consent.

**Flow from the brief:**
`Institution -> Student Data Upload -> APAAR Validation -> Data Verification -> AICTE Central Repository -> Analytics & Monitoring -> Authorized Verification`

**Our one-line pitch:** *Every seat accounted for, every record verifiable, without moving more personal data than necessary.*

---

## 2. Why it matters: numbers and trust metrics

All figures are from the Sources list at the end of this document. Where we derive a number ourselves, it is marked **(derived)**. Re-check the latest figures the week before the finale and put the date on the slide.

### 2.1 Scale of the problem

| Metric | Figure | Source |
|---|---|---|
| Approved engineering intake, 2025-26 | **15.98 lakh seats** (up ~7% year on year) | [S2] |
| AICTE-approved engineering institutions, 2025-26 | **5,875** (first rise in six years) | [S2] |
| Engineering seats filled, 2024-25 | **12.53 lakh** of 14.90 lakh approved. Vacancy **16.36%** | [S2] |
| Total higher-education enrolment, India, 2023-24 (AISHE) | **4.50 crore** students | [S3] |
| APAAR IDs generated (all levels) | **24.25 crore** by 30 Mar 2026 (Rajya Sabha reply). **26.35 crore verified** by 2 Jul 2026 (PIB) | [S4] |
| Is APAAR mandatory? | MoE told Parliament it is **voluntary and consent-based** | [S4] |
| Engineering/technical colleges closed in 2025-26 | **58** institutions | [S9] |

**Why this matters for design:** these numbers describe the totals AICTE already receives. The PS is about what totals **cannot** show: who is behind each number, and whether any one seat is counted twice or not at all.

### 2.2 Cost of the failure modes the PS targets

| Failure mode | Evidence | Source |
|---|---|---|
| **Excess admission** | AICTE norms prescribe a penalty of **5× the total fees per excess admission**, plus intake reduction or withdrawal of approval. The Supreme Court upheld a **₹23.1 crore** penalty on one management institute for admitting **42** students beyond its sanctioned seats. That is ≈ **₹55 lakh per excess seat (derived)**. | [S6] |
| **Fake/unrecognised degrees** | UGC's February 2026 list names **32 fake universities**. Delhi has 12 of them. | [S7] |
| **Credential fraud in hiring** | AuthBridge's 2025 report flagged discrepancies in **5% of education checks**. Fake certificates and degrees from blacklisted institutions were the main issues. | [S8] |
| **Historic baseline** | A 2015 HireRight India study found **education** was the largest category of CV discrepancies (52%). | [S18] |

### 2.3 Illustrative impact (derived; label these as illustrative on the slide)

- **Visibility gap.** At 15.98 lakh approved engineering seats, each **0.1% of hidden over-admission ≈ 1,600 students** in seats AICTE never sanctioned. Faculty ratios and infrastructure norms are set against those sanctioned seats.
- **Verification effort.** Applying a 5% education-check discrepancy rate [S8] to India's graduate pool means employers keep paying for manual background checks. A signed credential that verifies in **under a second, offline**, removes that cost per check.
- **Approval process.** AICTE today approves intake against *declared totals*. Student-level, APAAR-keyed data lets approval and inspection become **risk-based** (see §19, D3).

### 2.4 Trust metrics the platform itself reports

These are the KPIs our dashboards expose. They make the system auditable rather than just "a database." **In the prototype, these are measured on synthetic data. Present them as measured results, never as national claims.**

| Trust metric | Definition | Why a regulator cares |
|---|---|---|
| **APAAR coverage** | % of enrolments with a registry-verified APAAR, split by reason codes for the rest (REFUSED / NOT_GENERATED / PENDING) | Shows real coverage without punishing consent-based opt-outs |
| **Seat integrity** | (Enrolled within intake + within each category cap) ÷ total enrolled, per programme | Direct measure of excess admission |
| **Duplicate exposure** | Active cross-institution duplicate cases per 10,000 enrolments, and median time to resolution | Measures double enrolment and how fast it is closed |
| **Data quality score (DQS)** | Weighted: validation pass rate, timeliness vs deadline, correction churn, dispute rate | Ranks institutions for risk-based inspection |
| **Ledger consistency** | % of institutions whose submissions match published signed checkpoints (§19, D1) | Detects silent backdating or deletion |
| **Verification latency** | p50/p95 time to verify a credential, online and offline | Proves the employer-side benefit |
| **Consent health** | % of third-party verifications with valid, unexpired, scope-matched consent (must be 100%) | Demonstrates privacy by design |
| **Detection quality** | Precision/recall of each validator and anomaly rule on injected ground truth | Proves detection works rather than only claiming it (§15) |

---

## 3. Fixes applied in v2 (bugs found in v1)

| # | Problem in v1 | Fix in v2 | Section |
|---|---|---|---|
| F1 | "Near-sequential APAAR IDs" anomaly can't run on HMAC hashes. Requirement 10 also needs the **real** APAAR printed, which a hash can't give. | Store APAAR **encrypted** (AES-256-GCM, envelope keys) **and** an HMAC blind index. Compute sequence features at ingestion, in memory, before encryption. Persist only derived features. | §8, §9 |
| F2 | Fuzzy matching "blocks on DOB" while DOB and name are encrypted, so blocking and comparison were impossible. | **Blind indexes**: HMAC of normalised DOB and of phonetic name keys. Block on those, then decrypt only candidate pairs inside the matching service. | §10 |
| F3 | No `student` role, but the consent flow needs student approval. Minors were not handled. | Added `student` and `guardian` roles and a consent inbox. Students under 18 need guardian consent (DPDP treats under-18s as children). | §6, §13 |
| F4 | The "another active enrolment exists" message works as an **enumeration oracle**: an institution could probe any APAAR. | Notice fires **only** for rows in a genuinely submitted batch. Rate-limited, audit-logged, and the message contains no institution details. | §10 |
| F5 | `supernumerary_allowed` was a single number. | Per-category caps come from a `seat_categories` config. Per the Handbook, approved intake **excludes** supernumerary seats. FN/OCI/CIWG get **15% over approved intake**, with one-third of that reserved for Children of Indian Workers in Gulf countries. Vacant FN/OCI/CIWG seats may go to NRI only with AICTE approval. | §9 |
| F6 | Requirements 6 and 10 covered only by a QR token. | W3C VC 2.0 credentials with a trust registry, status lists and a printed-certificate QR. | §11 |
| F7 | Isolation Forest on synthetic data is easy to challenge and isn't explainable on its own. | Rules and robust z-scores are primary. IF is secondary, with per-feature deviation explanations. Both are evaluated on injected ground truth. | §9.4, §15 |
| F8 | Plan assumed 48 hours. SIH 2025 software finales ran **36 hours** [S17]. | Re-planned for 36h with a feature freeze at hour 30. | §16 |
| F9 (new) | Institutions **self-declared** their approved intake, so they could simply declare a bigger number. | Approved intake comes **only** from the AICTE approval registry (EOA records). A mismatched declaration raises **E303**. | §9 |
| F10 (new) | Missing APAAR was always an error, but APAAR is **consent-based** [S4] and CBSE allows REFUSED / NOGEN markings [S5]. Worse, an institution could **hide excess students by leaving out their APAAR**. | Missing APAAR plus a reason code is a **warning**. The row is accepted with a provisional ID and **always counted toward intake**. | §9 |
| F11 (new) | Concurrent uploads could both pass the intake check (race condition). | The intake counter updates inside one transaction with a row lock on the programme-year row. | §9 |
| F12 (new) | No rule for what may be sent to an external LLM. | Gemini is behind a **no-PII boundary**: headers, aggregates and public documents only. Paid tier only. Never used on student-facing screens. | §12.2 |

---

## 4. Key terms

| Term | Meaning |
|---|---|
| APAAR ID | Automated Permanent Academic Account Registry. A lifelong 12-digit academic ID (One Nation One Student ID, NEP 2020). Consent-based [S4]. |
| ABC | Academic Bank of Credits, linked to APAAR. Stores credits earned. |
| Approved intake | The maximum number of students a course may admit, **excluding** supernumerary seats, as approved by AICTE [S1]. |
| Supernumerary seats | Seats over and above approved intake for specific categories, e.g. FN/OCI/CIWG at up to 15% [S1]. Each scheme has its own cap. |
| NRI / OCI / FN / CIWG | Non-Resident Indian, Overseas Citizen of India, Foreign National, Children of Indian Workers in Gulf countries. |
| EOA | Extension of Approval: AICTE's annual approval letter listing approved intake per course. |
| Excess enrolment | Admissions above approved intake within the regular pool, **or** above any category's supernumerary cap. |
| VC | W3C Verifiable Credential: a tamper-evident, cryptographically signed claim [S10]. |
| Blind index | A keyed hash (HMAC) of a normalised value. It allows equality lookups on encrypted data without decrypting. |

---

## 5. The 10 requirements → where we cover them

| Req | What | Covered in |
|---|---|---|
| 1 | Secure upload/API keyed by APAAR | §7 ingestion, §12 integrations |
| 2 | Fields: intake, enrolment, supernumerary, NRI, OCI, FN, other | §8 schema, §9 intake engine |
| 3 | Duplicates, invalid/missing APAAR, excess intake, inconsistencies, cross-institution duplicates | §9, §10 |
| 4 | Real-time dashboards | §14 |
| 5 | Secure verification for AICTE, institutions, employers, regulators | §11, §13 |
| 6 | Verifiable student records | §11 (W3C VC) |
| 7 | Integration/API | §12 |
| 8 | Security, privacy, auth, RBAC, audit, consent | §6, §13, §19 D1 |
| 9 | Reports for policy, accreditation, regulation | §14 |
| 10 | APAAR ID + student ID on certificates | §11.8 |

---

## 6. Architecture

```
Institution ERP ──(apaar-connector / REST /v1)──┐
Institution Portal ─────────────────────────────┤
AICTE Officer Dashboard ────────────────────────┤
Student / Guardian Consent Inbox ───────────────┼──► FastAPI gateway (OAuth2/JWT, RBAC, rate limits, audit)
University Registrar (degree issuer) ───────────┤        │
Verifier (QR scan / web) ───────────────────────┘        ├─ Validation engine (pydantic/pandera + rule registry)
                                                          ├─ Intake engine (category caps, row-locked counters)
                                                          ├─ Matching service (blind index → decrypt-in-service)
                                                          ├─ Anomaly engine (rules + robust z + Isolation Forest)
                                                          ├─ Credential service (VC 2.0, status lists, trust registry)
                                                          ├─ Seat ledger (hash chain + signed checkpoints)
                                                          ├─ Consent service (purpose/scope/expiry, guardian flow)
                                                          ├─ AI assist (Gemini, no-PII boundary)
                                                          ├─ Webhooks + SSE event bus
                                                          └─ Adapters: APAAR/ABC (mock) · DigiLocker (mock)
                                                                       · AICTE EOA registry (mock) · Counselling (mock)
PostgreSQL (row-level security) ◄──┘     Key store (Vault/KMS in prod; sealed env file in demo)
```

**Stack:** React + Tailwind + Recharts | FastAPI | PostgreSQL 16 (row-level security) | FastAPI background tasks + SSE (no Celery/Redis in the 36h build) | pandas, pandera, rapidfuzz, jellyfish (phonetics), scikit-learn | `cryptography` (AES-GCM, Ed25519, HMAC), `rfc8785` (JSON canonicalisation), `base58` | `google-genai` SDK | Docker Compose.

**Roles (RBAC):**

| Role | Can do |
|---|---|
| `institution_admin` | Upload and correct own data, see own dashboards and own cases (neutral notices only) |
| `university_registrar` | Issue degree credentials for affiliated institutions' students |
| `aicte_officer` | National monitoring. Masked by default; unmask only with a reason, which is logged |
| `auditor` | Read-only access to audit log, ledger and reports |
| `verifier` | Verify credentials and request consent. Sees only consented fields |
| `student` | View own records, approve or revoke consent, see who verified them, hold credentials |
| `guardian` | Gives consent on behalf of students under 18 |
| `integration_client` | Machine identity for ERP connectors (OAuth2 client credentials, scoped) |

Institution isolation is enforced **in the database** with PostgreSQL row-level security keyed on `institution_id`, not only in API code.

---

## 7. Ingestion

- **Channels:** portal CSV/Excel upload, `POST /v1/batches` JSON API, and the ERP connector (§12.3). All three produce an `upload_batch`.
- **Idempotency:** every write accepts an `Idempotency-Key` header. Retries never double-insert.
- **Async:** a batch is accepted immediately (`202`). Validation runs as a background task, and progress streams to the browser over **SSE**.
- **Raw files:** stored encrypted, auto-deleted after N days (retention policy). Only validated rows reach core tables.

---

## 8. Data model (core tables)

```
institutions(id, aicte_permanent_id, name, state, status[approved|closed|progressive_closure], ...)
programmes(id, institution_id, code, name, level, year)
approved_intake(programme_id, academic_year, approved_intake, source_eoa_ref, fetched_at)  -- from AICTE registry only (F9)
seat_categories(code, scope[within_intake|supernumerary], cap_rule_json, handbook_ref)        -- F5
programme_category_counters(programme_id, academic_year, category_code, filled, cap)           -- row-locked (F11)

students(id,
         apaar_enc,            -- AES-256-GCM ciphertext (F1)
         apaar_bi,             -- HMAC(k_apaar_bi, apaar) blind index, unique where present
         apaar_masked,         -- e.g. XXXX-XXXX-0042
         apaar_status,         -- VERIFIED | REFUSED | NOT_GENERATED | PENDING | MISMATCH (F10)
         provisional_id,       -- issued when no APAAR
         name_enc, dob_enc, guardian_name_enc,
         bi_dob_bucket,        -- truncated HMAC of normalised DOB (F2)
         bi_name_phon[],       -- HMACs of phonetic keys of normalised name (F2)
         created_at)

enrolments(id, student_id, programme_id, academic_year, status[active|withdrawn|migrated|completed],
           seat_category_code, is_supernumerary, is_lateral_entry, category, is_nri, is_oci, is_fn,
           enrolled_on, withdrawn_on, batch_id)

upload_batches(id, institution_id, channel, status, row_counts_json, idempotency_key, created_at)
validation_issues(id, batch_id, row_no, code, severity, message, field)
anomaly_flags(id, institution_id, programme_id, type, score, evidence_json, status, ai_summary)
duplicate_cases(id, student_id, enrolment_ids[], status, resolution, resolved_by, resolved_at)
consents(id, student_id, granted_by[student|guardian], requester_id, purpose, scope_fields[],
         granted_at, expires_at, revoked_at, artifact_sig)
credentials(id, type, subject_student_id, issuer_did, status_list_id, status_index, issued_at, vc_hash)
status_lists(id, issuer_did, purpose[revocation|suspension], bitstring_gz, version)
issuer_registry(did, institution_id, public_keys_json, status, valid_from, valid_until)
ledger_entries(seq, institution_id, event_type, payload_hash, prev_hash, entry_hash, ts)
ledger_checkpoints(id, upto_seq, root_hash, aicte_sig, published_at)
api_clients(id, institution_id, client_id, scopes[], secret_hash)
webhook_endpoints(id, institution_id, url, secret_enc, events[], active)
audit_logs(id, actor, role, action, entity, entity_id, reason, ts, ip_hash)
```

Design rules:
1. Keep the **person** (`students`) separate from the **enrolment**. Cross-institution detection then becomes a simple GROUP BY.
2. **Key separation:** `k_enc` (data encryption), `k_apaar_bi`, `k_dob_bi` and `k_name_bi` are different keys. Compromise of one blind-index key doesn't expose the others.
3. **Approved intake is never taken from institution input** (F9).

---

## 9. Automated validation and intake engine

### 9.1 Layers (in order)

1. **Schema:** required columns, types, date formats (pandera/Pydantic).
2. **Format:** APAAR is 12 digits. A missing APAAR must carry a reason code (F10).
3. **Referential:** programme and institution exist, academic year valid, institution status is `approved` (not closed).
4. **Registry lookup (mock APAAR/ABC):** ID exists, and name/DOB match after normalisation.
5. **Business rules:** category consistency, age plausibility, admission window, lateral entry only in year 2.
6. **Intake engine:** per programme, year and category, against caps from the AICTE registry (§9.2).
7. **Duplicates:** within the file, then within the institution, then across institutions (§10).

**Ingestion-time features (F1):** before encrypting, compute batch features in memory. Examples are the longest run of consecutive APAAR numbers, DOB clustering and the share of identical addresses. Persist **only the features**, never the plaintext.

### 9.2 Intake engine (F5, F9, F10, F11)

```
for each (programme, year):
    regular_pool   = enrolments where seat_category.scope = within_intake
    regular_limit  = approved_intake            # from AICTE EOA registry, never from upload
    for each supernumerary category c:
        cap_c = rule(c)(approved_intake)        # e.g. FN/OCI/CIWG = 15% of approved intake,
                                                #      CIWG sub-cap = 1/3 of that
    excess_regular = max(0, |regular_pool| - regular_limit)        -> E301
    excess_c       = max(0, |enrolled in c| - cap_c)               -> E302
```

- **Every row counts**, with or without a valid APAAR. Leaving out an APAAR never removes a student from the count (F10).
- Counters update in **one transaction** with `SELECT ... FOR UPDATE` on the `programme_category_counters` row. Two parallel uploads can't both slip under the cap (F11).
- `seat_categories.cap_rule_json` holds each scheme's rule (TFW, PMSSS, J&K, lateral entry, PwD and so on), each with a Handbook reference. **Fill the exact caps from the AICTE Approval Process Handbook** [S1]. Don't hard-code from memory.

### 9.3 Error codes (v2)

| Code | Name | Severity | Note |
|---|---|---|---|
| E101 | MISSING_APAAR_NO_REASON | Error | Missing and no reason code given |
| E101W | MISSING_APAAR_WITH_REASON | Warning | REFUSED / NOT_GENERATED / PENDING. Row accepted, provisional ID issued, **counted** |
| E102 | INVALID_APAAR_FORMAT | Error | |
| E103 | APAAR_NOT_FOUND_IN_REGISTRY | Error | |
| E104 | APAAR_DETAILS_MISMATCH | Warning | Name/DOB differ after normalisation |
| E201 | DUPLICATE_IN_FILE | Error | |
| E202 | DUPLICATE_IN_INSTITUTION | Error | |
| E203 | CROSS_INSTITUTION_DUPLICATE | Flag (AICTE) | Neutral notice to the institution (F4) |
| E204 | PROBABLE_DUPLICATE_FUZZY | Review | Never auto-flagged |
| E301 | EXCESS_OVER_APPROVED_INTAKE | Flag (AICTE) | Regular pool |
| E302 | CATEGORY_CAP_EXCEEDED | Flag (AICTE) | Per supernumerary category |
| E303 | INTAKE_DECLARATION_MISMATCH | Flag (AICTE) | Declared intake ≠ AICTE registry |
| E304 | INSTITUTION_NOT_APPROVED | Error | Closed or not approved for this programme and year |
| E401 | INCONSISTENT_CATEGORY | Error | e.g. FN and OCI both true, or NRI and FN both true |
| E402 | IMPLAUSIBLE_AGE | Warning | |
| E403 | ADMISSION_DATE_OUTSIDE_WINDOW | Warning | |
| E404 | LATERAL_ENTRY_YEAR_MISMATCH | Error | Lateral entry outside year 2 |
| E501 | POST_DEADLINE_MUTATION | Flag (AICTE) | Edit or deletion after the cut-off. Visible in the ledger |

Errors block the row and warnings let it through. Output is a downloadable row-level error report, with messages available in English, Hindi and the state language (§12.2).

### 9.4 Anomaly detection (F7)

- **Primary (explainable rules):**
  - Fill ratio vs 3-year history, scored with a robust z-score (median and MAD).
  - Category-mix shifts (NRI/FN share).
  - DOB or address clusters.
  - Runs of sequential APAAR numbers (from ingestion features).
  - Bulk uploads at the deadline.
- **Future scope:** a ghost-student signal from missing ABC credit activity (§19.2, FS1).
- **Secondary:** an Isolation Forest on institution-level features. Every flag shows its **top 3 contributing features** with their deviation, e.g. "fill ratio 1.18 vs 3-yr median 0.71 (+4.2 MAD)".
- Gemini writes a plain-language summary **from the evidence JSON only** (§12.2). The numbers come from code, never from the model.
- Always labelled **"risk indicator for review"**, never proof of misconduct.

---

## 10. Cross-institution duplicate detection (F2, F4)

**Definition:** the same student holds active enrolments at two or more institutions in the same academic year.

**Step 1: exact match on the APAAR blind index**

```sql
SELECT s.apaar_bi, COUNT(DISTINCT p.institution_id) AS n_inst
FROM enrolments e
JOIN students s   ON s.id = e.student_id
JOIN programmes p ON p.id = e.programme_id
WHERE e.academic_year = '2026-27' AND e.status = 'active' AND s.apaar_bi IS NOT NULL
GROUP BY s.apaar_bi
HAVING COUNT(DISTINCT p.institution_id) > 1;
```

Run this incrementally for the APAARs in each new batch, not over the whole table. Index `(student_id, academic_year, status)` and `students(apaar_bi)`.

**Step 2: fuzzy match (APAAR missing or invalid), working on encrypted data**

1. **Normalise** before hashing:
   - Names: casefold, strip honorifics and initials, transliterate to Latin, collapse whitespace.
   - DOB: ISO date.
2. **Blind indexes:**
   - `bi_dob_bucket = trunc16(HMAC(k_dob_bi, dob))`. Truncating to 16 bits deliberately **creates collisions**, so the index leaks less to frequency analysis.
   - `bi_name_phon[] = HMAC(k_name_bi, metaphone(token))` for each name token.
3. **Block** on matching `bi_dob_bucket` **and** at least one shared phonetic hash. This is cheap SQL on indexes.
4. **Decrypt only the candidate pairs** inside the matching service. Score them with rapidfuzz on name and guardian name, and compare exact DOB.
5. Above the high threshold: **E204 review**. Below: drop. Never auto-confirm.

**Step 3: legitimate cases.** Students migrate and withdraw mid-year. `withdrawn` / `migrated` status with dates ends an enrolment. Only `active` enrolments are compared. A full NOC-based transfer workflow is future scope (§19.2, FS4).

**Step 4: resolution workflow.**
`flagged → both institutions notified (neutral text) → officer reviews → resolved` as confirmed duplicate, false positive, or under investigation.

**Step 5: privacy of the check (F4).**
- Institution B sees only: "A record in this batch needs AICTE review (case #1234)." The notice doesn't name the other institution or confirm anything about the other enrolment.
- The notice fires **only** for rows actually submitted in a batch. There is **no lookup endpoint** for arbitrary APAARs.
- Notices are rate-limited per institution and audit-logged. Only AICTE officers see both sides, and only after unmasking with a recorded reason.
- For the pre-admission check, see §19, D2.

---

## 11. W3C Verifiable Credentials (Requirements 5, 6 and 10)

### 11.1 Why VCs

The W3C published the **Verifiable Credentials 2.0** family as Recommendations on **15 May 2025**. The family includes:
- the Data Model v2.0
- Data Integrity 1.0
- the **EdDSA cryptosuites** (Ed25519)
- JOSE/COSE securing
- **Bitstring Status List** [S10][S11]

Using it gives us four properties:
- **Tamper-evident:** any change breaks the signature.
- **Offline-verifiable:** no call to our server is needed if the verifier has the trust registry and status list cached.
- **Issuer-anchored:** a credential is only trusted if its issuer is in **AICTE's registry of approved institutions**. This directly blocks "degrees" from the 32 UGC-listed fake universities [S7].
- **Standards-based:** interoperable with wallets and DigiLocker-style flows. It isn't our own invented format.

### 11.2 Roles

| Role | Who | Holds |
|---|---|---|
| Trust anchor | **AICTE** | Issuer registry: approved institutions/universities, their DIDs and keys, approval status by year |
| Issuer | **Institution** (Enrolment VC). **University / degree-awarding body** (Degree VC) | Ed25519 signing key |
| Holder | **Student** (web wallet in the consent inbox, plus a DigiLocker copy) | Credentials |
| Verifier | Employer, regulator, another institution | Cached registry and status lists |

Affiliated colleges don't award degrees; the university does. That is why Requirement 10 says "degree-awarding bodies", and why we separate **Enrolment** from **Degree** credentials.

### 11.3 Identifiers and keys

- **Issuer DID:** `did:web:registry.aicte-demo.in:inst:1-0000000001` resolves to a DID document holding the institution's public keys. `did:web` is a plain HTTPS fetch, so no blockchain is needed.
- **Trust registry entry:** `{did, institution_id, status, valid_from, valid_until, keys[]}`. A closed institution can't issue new credentials, but its earlier, validly issued ones still verify.
- **Keys:**
  - Prototype: Ed25519 keys, encrypted at rest.
  - Production: HSM/KMS. Rotation adds a new `verificationMethod` and keeps the old one for existing credentials.
  - Key compromise: mark the key revoked in the registry.

### 11.4 Credential types

1. **EnrolmentCredential**: issued by the institution after validation passes. Valid for the academic year.
2. **DegreeCredential**: issued by the university on award. Carries the **APAAR ID and student ID** (Requirement 10).
3. **VerificationCredential (purpose-scoped, short-lived)**: minted on demand **after consent**, containing **only** the fields the student approved, e.g. "B.E. CSE, 2027, institution X, valid". This is how we do data minimisation without heavyweight selective-disclosure cryptography. SD-JWT / BBS is on the roadmap.

### 11.5 Example (Enrolment VC, VC 2.0 with Data Integrity `eddsa-jcs-2022`)

```json
{
  "@context": ["https://www.w3.org/ns/credentials/v2"],
  "id": "urn:uuid:5f0c1c0e-6a3b-4c39-9a7e-2d1f8b7e1a42",
  "type": ["VerifiableCredential", "EnrolmentCredential"],
  "issuer": {
    "id": "did:web:registry.aicte-demo.in:inst:1-0000000001",
    "name": "Demo Institute of Technology"
  },
  "validFrom": "2026-08-20T00:00:00Z",
  "validUntil": "2027-07-31T23:59:59Z",
  "credentialSubject": {
    "apaarId": "100000000042",
    "studentId": "DIT/CSE/2026/0042",
    "name": "Asha R",
    "programme": "B.E. Computer Science and Engineering",
    "academicYear": "2026-27",
    "seatType": "WITHIN_INTAKE",
    "status": "ACTIVE"
  },
  "credentialStatus": {
    "id": "https://registry.aicte-demo.in/status/inst-1-0000000001/1#94567",
    "type": "BitstringStatusListEntry",
    "statusPurpose": "revocation",
    "statusListIndex": "94567",
    "statusListCredential": "https://registry.aicte-demo.in/status/inst-1-0000000001/1"
  },
  "proof": {
    "type": "DataIntegrityProof",
    "cryptosuite": "eddsa-jcs-2022",
    "created": "2026-08-20T10:15:00Z",
    "verificationMethod": "did:web:registry.aicte-demo.in:inst:1-0000000001#key-1",
    "proofPurpose": "assertionMethod",
    "proofValue": "z3FXQ...base58btc..."
  }
}
```

Notes:
- The VC 2.0 base context lets issuer-specific terms like `apaarId` work without writing our own JSON-LD context. Publish one later for clean semantics.
- We use **`eddsa-jcs-2022`** because it canonicalises with **JCS (RFC 8785)** instead of RDF. That makes it simple to implement in Python with `rfc8785` and `cryptography`.

### 11.6 How signing works (`eddsa-jcs-2022`)

```
proofConfig      = proof object without proofValue (+ the document's @context)
hashData         = SHA-256(JCS(proofConfig)) || SHA-256(JCS(document_without_proof))
signature        = Ed25519.sign(issuer_private_key, hashData)
proofValue       = "z" + base58btc(signature)          # multibase
```

**Verification (in order):**
1. Resolve `verificationMethod` to a public key, from the cached DID document or trust registry.
2. Check the issuer DID is in the **AICTE registry** and was approved on `validFrom`.
3. Recompute `hashData` and verify the Ed25519 signature.
4. Check `validFrom ≤ now ≤ validUntil`.
5. Fetch or use the cached **status list**, decompress it, and confirm the bit at `statusListIndex` is 0.
6. Show the result: **VALID / REVOKED / UNTRUSTED ISSUER / TAMPERED / EXPIRED**.

### 11.7 Revocation with Bitstring Status List

- Each issuer publishes a status-list credential: a GZIP-compressed bitstring with one bit per credential [S11]. Revoking an enrolment, for withdrawal or a confirmed duplicate, flips its bit.
- **Privacy:** the verifier downloads the whole list, so the issuer never learns *which* credential was checked. Use at least the spec's minimum list length (131,072 entries; confirm in the spec) so each credential hides among many.
- **Size:** a list with few revocations compresses to a few hundred bytes [S11], so it's cheap to cache for offline use.
- A second list with `statusPurpose: "suspension"` handles "under investigation" (reversible).

### 11.8 Certificates and the QR (Requirement 10)

The printed certificate (PDF generated by the university or institution) shows:
- Student name, programme, year, **Student ID and APAAR ID** printed in full, as Requirement 10 asks.
- A **QR code** in one of two modes:
  - **Online mode:** the QR holds `https://verify.aicte-demo.in/v/{credential_id}?t={one_time_token}`. Scanning shows a minimal result, and any extra fields require student consent.
  - **Offline mode:** the QR holds the *VerificationCredential* itself, compressed with zlib and Base45-encoded, as EU digital COVID certificates did. A minimal VC of roughly 1 KB compressed fits one QR. **Measure the real size in the demo.** The verifier app checks it with the cached registry and status list, no network needed.
- **Tamper demo:** edit one character of the printed text or the JSON → signature fails.

### 11.9 DigiLocker alongside VCs

DigiLocker's issuer model has institutions push or pull certificate URIs into a student's account through API Setu [S16]. We **mock** the issuer endpoints and push each Degree VC's PDF and URI to the student's DigiLocker. The VC gives offline cryptographic verification; DigiLocker gives national reach. They complement each other.

### 11.10 Implementation checklist (Python)

- `cryptography`: Ed25519 sign/verify, AES-GCM, HMAC
- `rfc8785`: JCS canonicalisation
- `base58`: multibase `z` encoding
- `qrcode` + `base45` + `zlib`: printed QR
- `reportlab` or `weasyprint`: certificate PDF
- Browser: `html5-qrcode` for the scanning page
- Status list: Python `gzip` + bit operations, served as a VC

---

## 12. Integrations (Requirement 7)

### 12.1 Public API (`/v1`, OpenAPI 3.1)

**Auth:**
- Machine clients use OAuth2 client credentials with scopes (`batches:write`, `cases:read`, `credentials:issue`).
- Humans log in with OIDC.
- mTLS is optional for state-level integrations.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/v1/batches` | Submit student records (JSON or file). Returns `202 {batch_id}` |
| GET | `/v1/batches/{id}` | Status, counts, error report link |
| GET | `/v1/batches/{id}/issues` | Row-level issues (paged) |
| PATCH | `/v1/enrolments/{id}` | Correct, withdraw or migrate (ledgered) |
| GET | `/v1/programmes/{id}/seats` | Intake vs filled by category |
| GET | `/v1/cases` | Duplicate and anomaly cases visible to the caller |
| POST | `/v1/credentials/{enrolment_id}/issue` | Issue an Enrolment or Degree VC |
| POST | `/v1/verify` | Verify a VC (online helper; offline verification also works) |
| POST | `/v1/consents/requests` | Verifier requests consent (purpose, fields, expiry) |
| GET | `/v1/registry/issuers/{did}` | Trust registry lookup (public) |
| GET | `/status/{issuer}/{list}` | Status list credential (public, cacheable) |
| GET | `/v1/ledger/checkpoints/latest` | Latest signed checkpoint (public) |

**Conventions:**
- `Idempotency-Key` on all writes.
- Cursor pagination.
- Errors use `application/problem+json`.
- Every response carries an `X-Request-Id`, which the audit log also records.

**Webhooks (outbound):**
- Events: `batch.completed`, `batch.failed`, `case.opened`, `case.resolved`, `seat.threshold`, `credential.revoked`, `consent.granted`, `consent.revoked`.
- Signing: `X-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, t + "." + body)>`. Receivers reject anything older than 5 minutes (replay protection).
- Delivery: retries with exponential backoff for 24h, then a dead-letter queue.

### 12.2 Gemini API integration (AI assist, behind a no-PII boundary)

**Models** (stable, from Google's current model list [S13]):
- `gemini-3.8-flash` for reasoning tasks
- `gemini-3.5-flash-lite` for high-volume, cheap tasks

**Interface:** the Interactions API with JSON-schema **structured outputs**, so every response is parsed into a Pydantic model [S14].

| Use case | What Gemini sees | What it returns | Model |
|---|---|---|---|
| **A. Column mapping** for messy institution Excel files | Header row + **3 synthetic placeholder values per column** (format only, generated by us) | `{source_header → target_field enum, confidence}`; a human confirms | flash-lite |
| **B. EOA PDF → approved-intake registry** (seeding the mock AICTE registry) | **Public** AICTE approval letters | Programme / intake table rows | flash |
| **C. Anomaly explanations** | Evidence JSON: aggregates and feature deviations, no student data | 2–3 sentence plain-language summary | flash |
| **D. Ask-the-data for officers** | Question + **schemas of allowlisted aggregate views** | A SQL query (shown to the officer before it runs) | flash |
| **E. Policy and accreditation report drafts** | Aggregate tables | Draft narrative; numbers come from tables, not the model | flash |
| **F. Error-message translation** | Error **templates** (no data) | Hindi + state-language versions, cached | flash-lite |

**Guardrails (security-critical):**
1. **No PII ever leaves.** A scrubber rejects any prompt containing 12-digit runs, dates of birth or names from the batch. Use case A sends synthetic samples, not real cells.
2. **Paid tier only.** Google's terms say unpaid-tier content may be used to improve its products and reviewed by humans, and tell developers not to send personal information there. Paid-tier prompts aren't used for product improvement and are processed under Google's data-processing terms [S15].
3. **Not on student-facing screens.** Gemini's terms bar using the API in apps directed at, or likely to be accessed by, people under 18 [S15]. First-year students can be 17, so AI assist is limited to institution and AICTE staff screens.
4. **Prompt-injection safe.** Uploaded cell values never enter prompts (only headers do), and outputs are constrained to schema enums of known fields. Model output never triggers an action without human confirmation.
5. **Text-to-SQL sandbox (D):**
   - Parse the generated SQL with `sqlglot` and require one `SELECT` that touches only allowlisted views.
   - Force a `LIMIT`.
   - Run it as a read-only database role with `statement_timeout`.
   - Views are aggregate-only (k ≥ 10 suppression), so no row-level data is reachable.
6. **Deterministic core.** Validation, intake, matching and credentials never depend on Gemini. If the API is down, the platform still works and only the "assist" buttons grey out.
7. **Audit.** Log the prompt hash, model, latency and the user who accepted the suggestion.

**Minimal code (use case A):**

```python
from typing import Literal
from pydantic import BaseModel
from google import genai

TARGET = Literal["apaar_id", "student_name", "dob", "guardian_name", "programme_code",
                 "seat_category", "is_nri", "is_oci", "is_fn", "is_supernumerary",
                 "is_lateral_entry", "admission_date", "unmapped"]

class ColumnMap(BaseModel):
    source_header: str
    target_field: TARGET
    confidence: float

class MappingResult(BaseModel):
    mappings: list[ColumnMap]

client = genai.Client()  # GEMINI_API_KEY from a billing-enabled (paid) project

def suggest_mapping(headers: list[str], synthetic_samples: dict[str, list[str]]) -> MappingResult:
    prompt = (
        "Map each spreadsheet header to the closest target field. "
        "Use 'unmapped' if unsure. Headers and format-only samples:\n"
        + "\n".join(f"- {h}: {synthetic_samples[h]}" for h in headers)
    )
    interaction = client.interactions.create(
        model="gemini-3.5-flash-lite",
        input=prompt,
        response_format={
            "type": "text",
            "mime_type": "application/json",
            "schema": MappingResult.model_json_schema(),
        },
    )
    return MappingResult.model_validate_json(interaction.output_text)
```

### 12.3 ERP connector (`apaar-connector`)

A small open-source agent that institutions run on their side. It covers the many colleges without in-house developers.

- **Packaging:** Python CLI, also built as a single binary (PyInstaller) for Windows and Linux. Config is one YAML file.
- **Sources:**
  - (a) Watch a folder for CSV/Excel exports from any ERP.
  - (b) A read-only SQL query against the ERP database (Postgres, MySQL or MSSQL drivers).
  - (c) Manual upload.
- **Mapping:** a YAML `field_map`. The first-time setup can call **our backend** for Gemini mapping suggestions (use case A). The connector never holds a Gemini key, and only headers leave the campus.
- **Local pre-validation:** imports the **same rules package** as the server (schema, format and in-file duplicates), so most errors are fixed before upload.
- **Transport:** TLS, OAuth2 client credentials, chunked and resumable upload, `Idempotency-Key = SHA-256(file)`.
- **Modes:** `--dry-run` (validate only), `--schedule "0 2 * * *"`, and `--since` for delta pushes.
- **Logs:** local and PII-free (row numbers and codes only).

```yaml
# apaar-connector.yaml
institution_id: "1-0000000001"
api_base: "https://api.aicte-demo.in/v1"
client_id: "${CONNECTOR_CLIENT_ID}"
client_secret: "${CONNECTOR_CLIENT_SECRET}"
source:
  type: folder            # folder | sql
  path: "D:/erp_exports/admissions"
  pattern: "*.xlsx"
field_map:
  "Stud APAAR No": apaar_id
  "Student Name":  student_name
  "D.O.B":         dob
  "Branch Code":   programme_code
  "Quota":         seat_category
schedule: "0 2 * * *"
```

### 12.4 Government-system adapters (mocked, swappable)

| Adapter | Interface | Real-world counterpart |
|---|---|---|
| `ApaarRegistry` | `lookup(apaar) → {exists, name, dob, status}` | APAAR / ABC |
| `AbcCredits` | `credits(apaar, since) → total` | Academic Bank of Credits (future: liveness signal, §19.2 FS1) |
| `AicteApprovals` | `approved_intake(programme, year)`, `institution_status(id)` | AICTE approval portal / EOA |
| `DigiLockerIssuer` | `push_uri(student, doc)`, pull APIs | DigiLocker issuer APIs via API Setu [S16] |
| `Counselling` | `allotments(institution, year)` | State CET / centralised counselling allotments (future, §19.2 FS2) |

Each adapter is an interface with a `Mock*` and a `Real*` (stub) implementation. In the pitch, say: *"Replace one class to go live."*

---

## 13. Consent, privacy and security

Not legal advice. Say "**designed in line with the DPDP Act 2023 and DPDP Rules 2025**", never "compliant".

**Timeline to cite:** the DPDP Rules were notified on 13 Nov 2025. Consent-manager registration starts **one year** later (13 Nov 2026), and the core consent, security and rights obligations follow at **18 months** (13 May 2027) [S12]. Our design is built for that end state.

**Two data flows:**
1. **Institution → AICTE:** regulatory purpose. A privacy notice is shown to students at admission.
2. **Third-party verification** (employer, other regulator): **explicit consent** from the student, or from the **guardian if the student is under 18**.

**What we build:**
- **Consent record:** purpose, scope (fields), requester, expiry and revocation, signed by the platform (`artifact_sig`). Verification fails if consent is missing, expired, revoked or out of scope.
- **Consent inbox:** the student or guardian sees pending requests, approves with an OTP (mocked), and sees a **verification history** of who checked what and when.
- **Consent-manager ready:** consent artifacts use a simple, documented JSON format, so a registered Consent Manager can relay them later.
- **Data minimisation:** collect only the fields the PS needs. **Never store Aadhaar.**
- **Identifiers:**
  - APAAR is stored encrypted, with a blind index and a masked display (F1).
  - Name and DOB are encrypted at field level, with blind indexes for matching (F2).
- **Role-based masking:**
  - Institutions see only their own students (RLS).
  - AICTE sees masked data by default. Unmasking needs a reason and is logged.
- **Audit:** every view, export, unmask, verification and model call is logged.
- **Retention:** raw upload files auto-deleted; withdrawn records archived per policy. Consent withdrawal and a grievance contact are in the UI.
- **Security basics:**
  - Transport: HTTPS, HSTS.
  - Passwords and sessions: Argon2 hashing, short-lived JWT with refresh rotation.
  - Input handling: rate limiting, input validation, CSV formula-injection neutralisation on exports.
  - Logging and keys: no PII in logs; secrets kept outside the repo.

---

## 14. Real-time monitoring, dashboards and reports (Requirements 4 and 9)

**Real-time:**
- An upload triggers background validation, with progress pushed over **SSE**.
- On completion, materialised views refresh and an event goes to the AICTE dashboard.
- Threshold alerts: seats at 90% and 100% of intake, category cap reached, new duplicate case, new anomaly, post-deadline mutation (E501).

**Institution dashboard:**
- Upload history and error reports.
- Intake vs filled, by category.
- Open cases (neutral text).
- Its own DQS, with what pulled it down.
- Error reports in the user's chosen language (D7).

**AICTE dashboard:**
- National and state map of seat integrity.
- Excess-enrolment ranking.
- Category mix (NRI/OCI/FN/CIWG).
- Anomaly trend.
- Upload compliance (who hasn't submitted).
- Duplicate exposure.
- Ledger consistency.
- Ask-the-data box (§12.2 D).

**Reports (CSV now, PDF stretch):**
- Accreditation pack per institution.
- State summary.
- Category-quota utilisation.
- Excess-admission case file for enforcement.
- Policy brief (Gemini draft + human edit).

---

## 15. Synthetic data generator — **PLACEHOLDER (to be designed later)**

We'll design this in a separate session. It must at least:
- Generate institutions, programmes and AICTE-registry intake across states, with realistic fill-ratio distributions (anchored to §2.1 vacancy levels).
- Generate students with Indian name variants (transliteration noise, initials, honorifics), DOB distributions, guardian names, and APAAR present / REFUSED / NOT_GENERATED.
- **Inject labelled faults** so every validator and anomaly rule has ground truth for precision/recall (§2.4):
  - Duplicates: within file, within institution, cross-institution exact and fuzzy.
  - Excess over intake, category-cap breaches, intake-declaration mismatch.
  - Ghost students: no ABC activity.
  - Sequential-ID runs, DOB clusters, deadline dumps, post-deadline edits.
  - Legitimate migrations and withdrawals (to test false positives).
- Export CSV/Excel in deliberately **messy ERP formats** (to exercise Gemini mapping).

---

## 16. Execution plan (end to end)

### 16.1 How to read this

The plan has 9 phases (P0–P8) in dependency order. Each phase lists:
- the PS requirements it delivers
- its tasks
- the owner, using the team numbers in §17
- **exit criteria**: what must be true before the phase counts as done

Timing is in §16.3. §16.2 checks that no PS item is left uncovered.

---

### P0 — Foundation and contracts

**PS coverage:** design for all requirements, mainly Req 2, 7 and 8. **Owners:** all, led by #1 and #3.

1. **Data dictionary for Req 2.** One row per field, giving its source, type and validation rule:
   - Approved intake: from the AICTE registry.
   - Actual enrolment: derived count.
   - Supernumerary seat category.
   - NRI, OCI, FN and CIWG flags.
   - Lateral entry, admission date, programme and guardian name.
   - "Other relevant information": decide the minimal list explicitly. Data minimisation is a design decision, so write it down.
2. **Seat-category config.** Extract each scheme's cap from the AICTE Approval Process Handbook into `seat_categories`, with clause references [S1].
3. **OpenAPI 3.1 contract.** Cover every endpoint in §12.1, the webhook payloads and the `problem+json` errors. Everyone works against this file.
4. **DB schema + RLS policies + key inventory.** Keys: `k_enc`, `k_apaar_bi`, `k_dob_bi`, `k_name_bi`, the issuer Ed25519 keys and the AICTE ledger key.
5. **VC profile.** Claim names, the three credential types and the QR payload format (§11).
6. **Error-code catalogue.** English message templates with placeholders for every code in §9.3. This becomes the input to D7.
7. **One-page threat model (STRIDE).** Cover:
   - the enumeration oracle
   - insider unmasking
   - backdating and tampering
   - CSV/formula injection
   - prompt injection
   - key theft
   - replayed webhooks
8. **Repo setup.** Docker Compose and CI (lint + tests). Seed the mock registries:
   - APAAR: mock IDs.
   - AICTE EOA: intake tables extracted from public approval letters with Gemini use case B, then checked by a human.
9. **Gemini project.** Create a billing-enabled (paid) Gemini project and keep the key in secrets.

**Exit criteria:**
- All 6 have reviewed the contract and schema.
- `docker compose up` brings up an empty, healthy stack.
- The mock registries answer lookups.

---

### P1 — Secure ingestion core

**PS coverage:** Req 1 (upload **and update**), Req 2 (storage), Req 7 (API), Req 8 (auth, RBAC, audit, privacy). **Owners:** #1, #2.

1. **Auth.** Human login issues JWTs, using seeded users plus an OTP mock. Machine clients use OAuth2 client credentials (`integration_client`).
2. **RBAC.** The 8 roles from §6, plus PostgreSQL **row-level security** on `institution_id`.
3. **Crypto library.** A shared module for AES-GCM field encryption, HMAC blind indexes and normalisation. It needs its own unit tests and test vectors.
4. **Ingestion.**
   - Portal CSV/XLSX upload and the `POST /v1/batches` JSON API.
   - `Idempotency-Key` handling.
   - `202` response, then a background task with SSE progress.
5. **Update path.** `PATCH /v1/enrolments/{id}` for corrections, withdrawals and migrations, so Req 1's "upload and update" is fully met.
6. **Audit middleware.** Logs every PII read, export, unmask and write.
7. **D1 Seat Ledger, part 1.** Every enrolment create, update or withdraw appends a hash-chained ledger entry.

**Exit criteria:**
- Institution A uploads 500 rows and watches live progress.
- The rows are stored encrypted, with blind indexes.
- An RLS test proves Institution B cannot read them.
- Audit and ledger entries exist for every write.

---

### P2 — Validation, intake engine, multilingual reports

**PS coverage:** Req 2 (all fields enforced), Req 3 (duplicates within institution, invalid/missing APAAR, excess intake, inconsistencies), Innovation (automated validation), D7. **Owners:** #2, #4.

1. **Validation layers 1–7** (§9.1) emitting the §9.3 codes. Includes the mock APAAR lookup and the missing-APAAR reason codes (F10).
2. **Intake engine** (§9.2):
   - Per-category caps from the registry.
   - Row-locked counters (F11).
   - Codes E301, E302, E303 and E304.
   - Every row counted, with or without APAAR.
3. **Ingestion-time features** (F1), computed in memory before encryption.
4. **Row-level error report** as a CSV/XLSX download, with a fix hint for each code.
5. **D7 Multilingual error reports.**
   - Gemini (use case F) translates the **templates** into Hindi plus 2 state languages. Kannada is a natural first pick for a Bengaluru team.
   - A team member who reads each language reviews the translations, and they are cached as static files.
   - Users choose their language in the portal.
   - Data values never go to Gemini. Only template text with `{placeholders}` does.
6. **Gemini column mapping** (use case A), with a confirm-before-apply UI.
7. **Shared rules package.** Package the validators so the ERP connector imports the same code.

**Exit criteria:**
- Every error code has a unit test with a row that triggers it.
- In a concurrency test, two parallel batches still can't exceed a cap.
- The error report renders correctly in 3 languages.
- A messy header file maps correctly after one confirm click.

---

### P3 — Cross-institution integrity

**PS coverage:** Req 3 (cross-institution duplicates), Req 5 (pre-check), Req 8 (audit trail, privacy). Delivers D1 and D2. **Owners:** #2, #1.

1. **Exact duplicates.** Match on the APAAR blind index, incrementally per batch (§10, step 1).
2. **Fuzzy duplicates.**
   - Block on the DOB-bucket and phonetic blind indexes.
   - Decrypt only the candidate pairs, inside the matching service.
   - Send matches to E204 for review.
3. **Legitimate moves.** Withdrawn and migrated enrolments are excluded from comparison.
4. **Case workflow.** `flagged → notified → reviewed → resolved`, with neutral notices and rate limits (F4).
5. **D2 Duplicate pre-check.**
   - Endpoint returns only `CLEAR` / `NEEDS_REVIEW`.
   - Requires a signed student consent token.
   - Rate-limited and audit-logged.
6. **D1 Seat Ledger, part 2.**
   - Daily Merkle-root checkpoints signed by the AICTE key.
   - A public checkpoint endpoint.
   - A `verify-ledger` CLI.
   - E501 for any mutation after the deadline.

**Exit criteria:**
- A seeded duplicate pair is caught in the same batch run.
- A test proves B's notice reveals nothing about A.
- Editing any stored ledger row makes checkpoint verification fail.
- Calling the pre-check without consent is refused.

---

### P4 — Monitoring, anomalies, DQS, reports

**PS coverage:** Req 4 (real-time dashboards for AICTE **and** institutions), Req 9 (reports), Innovation (anomaly detection, real-time monitoring, analytics). Delivers D3. **Owners:** #4, #6, #5.

1. **Live data.** Materialised views, SSE event bus and threshold alerts at 90% and 100% fill, cap reached, new case, new anomaly and E501.
2. **Institution dashboard** (§14).
3. **AICTE dashboard:**
   - state map
   - excess ranking
   - category mix
   - upload compliance
   - duplicate exposure
   - ledger consistency
4. **Anomaly engine** (§9.4). Rules plus robust z-scores first, then Isolation Forest, each flag with its top-3 features. Gemini writes the plain-language narrative (use case C).
5. **D3 Data Quality Score + risk-based inspection queue.** Transparent component weights, with "why this institution is ranked here" shown for each entry.
6. **Ask-the-data** (use case D), inside the sqlglot sandbox over aggregate views with k ≥ 10.
7. **Reports.** Accreditation pack, state summary, category-quota utilisation and excess-admission case file, as CSV and PDF. A policy brief drafted by Gemini (use case E) and edited by a human.

**Exit criteria:**
- An upload changes the AICTE dashboard within 5 seconds.
- Every anomaly flag shows its evidence.
- DQS components are visible and sum correctly.
- Each report exports successfully.

---

### P5 — Verification, credentials, consent

**PS coverage:** Req 5 (secure verification for AICTE, institutions, employers, regulators), Req 6 (verifiable records), Req 8 (consent), Req 10 (APAAR + student ID on certificates). Delivers D4, D5, D6. **Owners:** #3, #5.

1. **D4 Trusted Issuer Registry.** `did:web` documents for institutions and universities, with status by year.
2. **VC issuance.** Enrolment and Degree credentials, signed with `eddsa-jcs-2022`. Check against our own test vectors.
3. **Status lists.** Bitstring Status Lists for revocation and suspension. Withdrawals and confirmed duplicates revoke automatically.
4. **Consent service + inbox.**
   - Student or guardian approves with an OTP (mock).
   - Guardian path for students under 18.
   - Signed consent artifacts.
5. **D5 Consent-scoped VerificationCredential.** Issued with only the approved fields and a short expiry.
6. **Certificate PDF.** Shows the **APAAR ID and student ID** with a QR code in online or offline mode (§11.8).
7. **Verifier page.**
   - Scan a QR.
   - Verify offline using the cached registry and status list.
   - Show VALID / REVOKED / UNTRUSTED ISSUER / TAMPERED / EXPIRED.
8. **Stakeholder access per Req 5:**
   - AICTE officers: masked by default, unmask with a reason.
   - Regulators: `auditor` role.
   - Institutions: verifying an incoming student's prior credential.
   - Employers: `verifier` role, consent-gated.
9. **D6 Student transparency view.** Every access to the student's record, including verifications and unmasks.
10. **DigiLocker issuer mock.** Push the degree URI.

**Exit criteria:**
- Signing and verification round-trip on test vectors.
- Flipping a status bit turns VALID into REVOKED.
- An unregistered issuer gets UNTRUSTED.
- Missing or expired consent is refused.
- The printed certificate shows both IDs, and its QR verifies with the network off.

---

### P6 — Integrations

**PS coverage:** Req 7 (integration with institutional and AICTE systems). **Owners:** #1, #2.

1. **Public API.** Finalise it, publish the Swagger page and add an API-client management screen.
2. **Webhooks.** HMAC signatures, 5-minute replay window, retries and a dead-letter queue.
3. **ERP connector CLI.** Folder and SQL sources, `--dry-run`, schedule and delta modes, sharing the rules package.
4. **Adapter interfaces.** `ApaarRegistry`, `AicteApprovals` and `DigiLockerIssuer`, each with a Mock and a stubbed Real implementation.

**Exit criteria:**
- The connector pushes a messy ERP export end to end.
- A sample receiver verifies the webhook signatures.
- Swapping in a Mock adapter needs no change to calling code.

---

### P7 — Security hardening, testing, evaluation

**PS coverage:** Req 8 (proof the security works), "scalable, secure, interoperable" from the expected solution. **Owners:** #3, #4, plus everyone.

1. **Synthetic data generator** (§15, still to be designed). Produces data with labelled faults, then measures **precision and recall for every validator and anomaly rule**.
2. **Security tests:**
   - RLS bypass attempts.
   - Oracle probing of notices and pre-check.
   - Unmasking without a reason.
   - JWT tampering.
   - Rate limits.
   - CSV formula injection.
   - Prompt injection through a crafted header.
   - The PII scrubber must block 12-digit numbers, dates of birth and names.
3. **Load test.** Push a 50,000-row batch and record throughput and p95 latency for the API and verification.
4. **Compute the §2.4 trust metrics** on synthetic data. These numbers go in the deck.

**Exit criteria:** a one-page test report with real measured numbers and no open high-severity security findings.

---

### P8 — Demo, pitch, submission

**PS coverage:** communicates the whole flow, the expected outcome and the innovation. **Owners:** #6, plus everyone.

1. **Demo seed.** Scenario data for Institutions A, B and C, a fake issuer and a post-deadline edit.
2. **Rehearse the §18 demo three times** and record a backup video.
3. **Deck:**
   - Problem
   - Why it matters (§2)
   - Architecture
   - Live demo
   - Measured trust metrics (P7)
   - Real vs mocked (§20)
   - Future scope (§19.2)

**Exit criteria:** three clean runs in under 6 minutes, and a backup video saved locally.

---

### 16.2 Requirement traceability (nothing in the PS left uncovered)

| PS item | Built in | Proven by |
|---|---|---|
| **Req 1** Secure upload **and update** keyed by APAAR | P1, P6 | Demo 1–2; RLS + idempotency tests |
| **Req 2** Approved intake | P0 (registry), P2 (E303) | Demo 2 |
| Req 2 Actual student enrolment | P2 (counters) | Dashboards |
| Req 2 Supernumerary seats | P0 (config), P2 (E302) | Demo 2 |
| Req 2 NRI / OCI / FN status | P2 (E401 consistency) | Unit tests |
| Req 2 Other relevant info | P0 (data dictionary) | Schema review |
| **Req 3** Duplicate student records | P2 (E201, E202) | Demo 2 |
| Req 3 Invalid/missing APAAR | P2 (E101–E104) | Demo 2 |
| Req 3 Admissions exceeding intake | P2 (E301–E303) | Demo 2 |
| Req 3 Inconsistencies in data | P2 (E401–E404), P3 (E501) | Demo 2, 8 |
| Req 3 Duplicate enrolment across institutions | P3 (E203, E204, D2) | Demo 3 |
| **Req 4** Real-time dashboards, AICTE + institutions | P4 | Demo 3–4 |
| **Req 5** Secure verification for AICTE, institutions, employers, regulators | P5, P3 (D2) | Demo 5–7 |
| **Req 6** Verifiable records linked to academic identity | P5 (VCs + D4) | Demo 5–7 |
| **Req 7** Integration/API with institutional + AICTE systems | P1, P6 | Demo 1 |
| **Req 8** Security | P1, P7 | P7 report |
| Req 8 Privacy | P1 (encryption, minimisation), P5 (D5) | P7 scrubber + oracle tests |
| Req 8 Authentication / RBAC | P1 | RLS tests |
| Req 8 Audit trails | P1, P3 (D1) | Demo 8 |
| Req 8 Consent mechanisms | P5 | Demo 5 |
| **Req 9** Reports for policy, accreditation, monitoring, regulation | P4 (+ D3) | Report exports |
| **Req 10** APAAR + student ID on certificates | P5 | Printed certificate in demo 5 |
| Flow: Upload → APAAR validation → Data verification → Central repository → Analytics → Authorized verification | P1 → P2 → P2/P3 → P1 → P4 → P5 | Demo 1–7 in order |
| Outcome: detect excess enrolment; real-time monitoring; data-driven governance | P2, P4, D3 | Demo 2, 4 |
| Innovation: automated validation, anomaly detection, real-time monitoring, secure verification, analytics | P2, P4, P5 | Demo 2–7 |
| Non-functional: scalable, interoperable, user-friendly | P7 (load test), P5 (W3C VC), P6 (OpenAPI), D7 + Gemini mapping | P7 report |

### 16.3 Timing

**Track A — the edition's rules allow bringing a working prototype** (confirm in the official SIH 2026 guidelines):

| When | Phases | Note |
|---|---|---|
| Week 1 | P0 | Contract freeze at the end of the week |
| Weeks 2–3 | P1, P2 | Frontend builds against mocks of the contract in parallel |
| Weeks 4–5 | P3, P5 | Credentials (#3) run in parallel with integrity work (#2) |
| Week 6 | P4, P6 | |
| Week 7 | P7 | Needs the synthetic data generator, so design it by week 5 |
| Finale (36h) | Mentor-requested changes, then P8 | Keep 6 hours free for changes the judges ask for |

**Track B — strict rules, everything built at the finale:** P0 is done fully before the finale, as design documents only. Then:

| Hours | Phases |
|---|---|
| 0–3 | P0 leftovers, repo, seed registries |
| 3–12 | P1 + P2 core (validation, intake engine, error report) |
| 12–20 | P2 rest (D7, mapping) + P3 (exact duplicates, notices, ledger, pre-check) |
| 20–27 | P5 (registry, VC, status list, consent, certificate, verifier) + P4 core dashboards |
| 27–30 | P4 (anomaly, DQS) + P6 (webhooks, connector folder mode). **Feature freeze at hour 30** |
| 30–33 | P7 (bad-data run, security checklist, metrics) |
| 33–36 | P8 |

**If you fall behind, cut in this order:**
1. Ask-the-data.
2. PDF reports (keep CSV).
3. Isolation Forest (keep the rules).
4. Connector SQL mode.
5. Fuzzy matching (keep exact matching).

**Never cut:** intake engine, exact cross-institution duplicates, VC issue and verify, consent check, audit log, certificate QR. Each of these is a named PS requirement.

---

## 17. Team split (6)

| # | Role | Owns |
|---|---|---|
| 1 | Backend core | FastAPI, auth, RBAC + RLS, audit log, **D1 Seat Ledger**, webhooks, public API |
| 2 | Backend data | Ingestion, validation rules, intake engine, matching service + blind indexes, **D2 pre-check**, ERP connector |
| 3 | Credentials & security | VC issuance/verification, status lists, **D4 trust registry**, **D5 consent-scoped VCs**, key handling, consent service, certificate + QR, threat model |
| 4 | ML + AI | Anomaly engine, **D3 DQS**, Gemini assist + guardrails, **D7 multilingual reports**, synthetic data generator (later) |
| 5 | Frontend A | Institution portal, student/guardian consent inbox, **D6 transparency view**, verifier (QR) page |
| 6 | Frontend B + pitch | AICTE dashboard, inspection queue UI, reports, deck, demo script, video |

---

## 18. Demo script (~6 minutes)

1. **Clean push:** Institution A's ERP connector pushes a batch. Everything is green, and the ledger checkpoint ticks forward.
2. **Messy upload:**
   - Institution B uploads a messy Excel file. **Gemini suggests the column mapping** and the operator confirms it.
   - Validation flags invalid IDs, duplicate rows, **E303** (declared intake ≠ AICTE registry) and an FN/OCI cap breach.
   - Students without APAAR are still counted.
3. **Cross-institution duplicate:** the same student appears at A and B. A case opens live on the AICTE dashboard, and B sees only a neutral notice.
4. **Anomaly:** Institution C shows an enrolment spike. The anomaly flag shows its evidence and a plain-language explanation. The officer asks "which states are over 100% fill in CSE?", sees the generated SQL, and gets a chart.
5. **Credential:**
   - The student receives an Enrolment VC.
   - An employer requests verification and the student approves 3 fields.
   - The employer scans the QR **offline** → **VALID**.
6. **Revocation:** the enrolment is withdrawn and its status bit flips. Re-scanning shows **REVOKED**.
7. **Fake issuer:** a credential signed by an "unregistered university" key → **UNTRUSTED ISSUER**.
8. **Tamper:** the institution tries to backdate a deletion after the deadline. **E501** fires and the ledger shows the event can't be hidden.

---

## 19. Differentiators

### 19.1 In scope (built in the current execution)

Each item answers a regulator's real question and maps to a PS requirement. The phase column refers to §16.

| ID | Feature | What it does | PS link | Phase |
|---|---|---|---|---|
| **D1** | **Seat Ledger (transparency log)** | Every enrolment create, edit or withdraw is appended to a hash-chained log. AICTE publishes **signed daily checkpoints** (a Merkle root), the way Certificate Transparency works for TLS. An institution can't silently backdate or delete admissions after the deadline: any change breaks the chain against the published checkpoint, and E501 flags the attempt. **Not a blockchain**: append-only hashes and one signer, so it's cheap and auditable. | 3, 8 | P1, P3 |
| **D2** | **Admission-time duplicate pre-check** | Before confirming an admission, the institution calls a consent-gated endpoint that returns only `CLEAR` / `NEEDS_REVIEW`, with no details. It **prevents** double enrolment instead of detecting it months later. Requires a signed student consent token, and is rate-limited and audit-logged, so it can't be used to look people up (F4). | 3, 5 | P3 |
| **D3** | **Institution Data Quality Score + risk-based inspection queue** | DQS (§2.4) ranks institutions for AICTE inspection, showing why each one is ranked where it is. It turns the platform into an input to AICTE's approval process. | 4, 9 | P4 |
| **D4** | **Trusted Issuer Registry** | A public, cacheable registry of AICTE-approved issuers (`did:web`). Credentials from fake or closed institutions fail automatically [S7]. | 5, 6 | P5 |
| **D5** | **Consent-scoped minimal credentials** | Verifiers receive a short-lived VC holding only the fields the student approved. DPDP data minimisation is built into the cryptography. | 5, 8 | P5 |
| **D6** | **Student transparency view** | Students see every access to their record, e.g. "AICTE officer unmasked on date X for case #Y". This builds public trust in a national registry. | 8 | P5 |
| **D7** | **Multilingual error reports** | Error reports and messages in English, Hindi and state languages. Gemini translates the templates, a human reviews them and they're cached; data never goes to Gemini. Small colleges can fix their data without a consultant. | 1, 4 (user-friendly) | P2 |

**Pitch line:** D1, D2 and D3 answer the three questions an AICTE officer asks: *"Can they rewrite history?"*, *"Can we stop it upfront?"* and *"Where do we send inspectors?"*

### 19.2 Future scope (PRD roadmap)

**Next** = first after the hackathon (formerly stretch). **Later** = longer-term roadmap.

| ID | Feature | Why it matters | PS link | Horizon |
|---|---|---|---|---|
| FS1 | **Ghost-student signal via ABC credits** | An enrolment with no ABC credit activity after the first term flags seats filled on paper only | 3 | Next |
| FS2 | **Counselling-allotment reconciliation** | Cross-checks enrolments against state counselling allotments to show *where* excess comes from | 3 | Next |
| FS3 | **Installable offline verifier app (PWA)** | Offline verification already works in the verifier page (P5). An installable app adds field use in low-connectivity districts | 5 | Next |
| FS4 | **NOC-based transfer/migration workflow** | Links enrolments across institutions for legitimate mid-year moves, cutting false-positive duplicates | 3 | Next |
| FS5 | **Selective disclosure (SD-JWT VC / BBS)** | Replaces per-request minimal credentials with holder-controlled disclosure | 5, 8 | Next |
| FS6 | **Registered Consent Manager integration** | DPDP consent-manager registration begins 13 Nov 2026 [S12]. Our consent artifacts are designed to be relayed | 8 | Next |
| FS7 | **Live APAAR/ABC, AICTE approval and DigiLocker integration** | Swap the Mock adapters for Real ones (§12.4) after official onboarding | 7 | Next |
| FS8 | **Crypto-agility for lifelong records** | Degrees must verify for decades. Add a post-quantum signature (ML-DSA) next to Ed25519 as a second proof, with no format change | 6, 8 | Later |
| FS9 | **Differentially private open data** | Publish state and programme statistics for research without re-identification risk | 9 | Later |

---

## 20. Real vs mocked (say this openly in the pitch)

| Real in the prototype | Mocked |
|---|---|
| Upload, validation, intake engine with category caps, duplicate detection (exact + blind-index fuzzy) | APAAR / ABC registry |
| Anomaly rules + explanations, dashboards, reports | AICTE approval (EOA) registry (seeded from public EOA PDFs via Gemini use case B) |
| W3C VC issue/verify, status lists, trust registry, QR certificates | DigiLocker issuer API |
| Consent inbox, audit log, seat ledger, RLS, encryption + blind indexes | Identity provider (seeded users, OTP) |
| Gemini assist (no-PII), ERP connector, webhooks | Real student data (synthetic only) |

## 21. Pitfalls to avoid

- Building a plain CRUD app with no real validation logic.
- Ignoring supernumerary seats, or treating them as one number.
- **Letting institutions declare their own approved intake.**
- **Dropping rows without APAAR from the intake count.**
- Forgetting consent, or forgetting guardian consent for under-18s.
- Skipping cross-institution duplicates, or leaking cross-institution details in the notice.
- Sending any student data to an LLM, or using the free tier.
- Demoing only perfect data. Seed bad records so validation visibly catches them.
- Claiming real APAAR, AICTE or DigiLocker integration. Be upfront that it is mocked.
- Calling the ledger a "blockchain". It's a transparency log, and that's a strength.

## 22. Next documents to write

1. **OpenAPI contract** (endpoints in §12.1 with payloads): first, so frontend and backend can work in parallel.
2. SQL schema + RLS policies + seat-category config (with Handbook references).
3. Validation rule table: final codes plus the exact Handbook caps.
4. **Synthetic data generator spec** (§15). Pending.
5. VC profile: final claim names, a JSON-LD context, the QR payload format.
6. Pitch deck outline built on §2 numbers and the §18 demo.

---

## Sources

- [S1] AICTE Approval Process Handbook 2024-25 to 2026-27 (approved-intake definition; 15% FN/OCI/CIWG supernumerary, 1/3 for CIWG; NRI fill of vacant seats): https://cdnbbsr.s3waas.gov.in/s35938b4d054136e5d59ada6ec9c295d7a/uploads/2025/03/2025031399.pdf
- [S2] Education Today, AICTE engineering intake/enrolment data (15.98 lakh seats 2025-26; 5,875 institutions; 12.53 lakh filled, 16.36% vacancy in 2024-25): https://educationtoday.co/news/daily-news/btech-admissions-hit-eight-year-high-as-computer-science-leads-surge-in-enrolment
- [S3] Careers360, AISHE 2023-24 (4.50 crore enrolment): https://news.careers360.com/aishe-2023-24-higher-education-enrolment-reaches-4-50-crore-female-enrolment-rises-42-percentage-since-2014-15/amp
- [S4] Education Post, APAAR explainer (24.25 crore IDs by 30 Mar 2026; 26.35 crore verified by 2 Jul 2026; voluntary and consent-based): https://educationpost.in/news/explained/explained-apaar-id-one-nation-one-student-id
- [S5] CareerIndia, CBSE APAAR linkage and REFUSED/NOGEN relaxation: https://www.careerindia.com/news/apaar-id-2026-student-registration-privacy-rights-011-65627.html
- [S6] Supreme Court of India, FORE School of Management v. AICTE, 21 Jun 2019 (5× fee penalty; ₹23.1 crore for excess admissions): https://api.sci.gov.in/supremecourt/2016/23724/23724_2016_4_1501_14619_Judgement_21-Jun-2019.pdf
- [S7] Careers360, UGC list of 32 fake universities (Feb 2026): https://university.careers360.com/articles/ugc-list-of-fake-universities-in-india
- [S8] AuthBridge Workforce Fraud Files 2025 (5% education-check discrepancies): https://www.mediainfoline.com/uncategorized/authbridge-exposes-indias-hiring-red-flags
- [S9] Careers360, 58 engineering/technical colleges closed in 2025-26: https://news.careers360.com/aicte-58-engineering-technical-colleges-closed-academic-year-2025-26-btech-admission
- [S10] W3C, VC 2.0 family becomes W3C Recommendation: https://www.w3.org/news/2025/the-verifiable-credentials-2-0-family-of-specifications-is-now-a-w3c-recommendation
- [S11] W3C Bitstring Status List v1.0: https://www.w3.org/TR/vc-bitstring-status-list/
- [S12] DPDP Rules 2025 phased commencement: https://www.lawrbit.com/?p=9599 and https://www.hoganlovells.com/en/publications/indias-digital-personal-data-protection-act-2023-brought-into-force-
- [S13] Gemini API models: https://ai.google.dev/gemini-api/docs/models
- [S14] Gemini API structured outputs: https://ai.google.dev/gemini-api/docs/structured-output
- [S15] Gemini API Additional Terms of Service (unpaid vs paid data use; 18+ requirement): https://ai.google.dev/gemini-api/terms
- [S16] DigiLocker Issuer APIs (API Setu): https://apis.guru/apis/apisetu.gov.in/issuer and issuer push/pull workflow: https://cdn.apisetu.gov.in/portal/assets/workflow_issuer.pdf
- [S17] All India Radio, SIH 2025 Grand Finale (36 hours; 72,165 ideas; 271 problem statements): https://www.newsonair.gov.in/grand-finale-of-smart-india-hackathon-2025-kicks-off and https://www.newsonair.gov.in/8th-edition-of-smart-india-hackathon-2025-begins-mic
- [S18] People Matters, HireRight India screening trends (2015): https://www.peoplematters.in/article/background-verification/hirerights-latest-study-reveals-resume-fraud-india-11343
