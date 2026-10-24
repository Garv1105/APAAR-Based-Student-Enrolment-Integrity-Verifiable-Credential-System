# Anomaly detection v2: implementation spec (D3+)

Status: proposed. Owner: _fill in_. Extends D3 (`backend/app/anomaly.py`, `backend/app/risk.py`).
Put this file in `docs/` and run one task per Claude Code session, in order: **A0 → A1 → A2 → A3 → A4 → A5**.

## Ground rules (same as CLAUDE.md)
- **Pure functions** in `backend/app/anomaly/` modules (no DB, no AI). DB glue stays in `risk.py`. The offline evaluator and the platform run the same code.
- **Aggregates only.** No plaintext APAAR, name or DOB is stored for analytics. Anything needing plaintext is computed in memory at upload and saved as a number in `batch_features`.
- **Every flag shows its evidence numbers** and keeps the label "Risk indicator for review, not proof of misconduct".
- **Deterministic.** Same data → same flags. Fixed thresholds live at the top of each module, documented.
- **Regulator-only.** Peer comparisons, the network and the profile score are visible only to `aicte_officer` / `auditor`. An institution sees only its own flags and never another college's numbers.
- **No new dependency without approval.** This spec needs **none**: numpy (already installed via pandas) is enough. Isolation Forest (`scikit-learn`) and `networkx` are optional alternatives, listed at the end.
- Every task: tests first, evidence (test output) shown, `security-reviewer` run on A3 and A4.

## Module layout (A0)
Turn `backend/app/anomaly.py` into a package without breaking imports:
```
backend/app/anomaly/
  __init__.py      # re-exports everything the old anomaly.py exported (programme_flags, dqs, inspection_queue, ...)
  rules.py         # the existing five rules, moved unchanged
  stats.py         # robust_z, mad, benjamini_hochberg, normal_sf (shared helpers)
  peer.py          # A1
  profile.py       # A2
  network.py       # A3
  feedback.py      # A4
```
Acceptance: all existing tests pass unchanged.

---

## A1: Peer-group baselines

**Idea.** Today a programme is compared only with its own last 3 years. Add a second comparison with **similar programmes this year**. "Fill up 85% while similar colleges grew 4%" is much stronger evidence than "up 85% vs own history". It also works for a **new college with no history**, which the current spike rule can't judge at all.

**Peer group definition** (most specific level that has at least `MIN_PEERS = 8` members, excluding the programme itself):
1. same programme code + same state + same size band
2. same programme code + same size band (national)
3. same programme code (national)

Size band by approved intake: `S` ≤ 60, `M` 61–180, `L` > 180. Record which level was used: it goes in the evidence.

**Metrics compared** (each is a number per programme for this year):
| Metric | Definition |
|---|---|
| `fill_ratio` | regular filled / approved intake |
| `fill_growth` | this year's fill ratio − median of own history (only if history exists) |
| `foreign_share` | supernumerary-pool admissions / active enrolments |
| `rejection_rate` | rejected rows / submitted rows (institution-programme) |
| `late_share` | rows uploaded in the last 24 h before the deadline / rows |

**Score.** For each metric, peer robust z = `(x − median(peers)) / (1.4826 × max(MAD(peers), floor))`. Floors per metric go in a `FLOORS` dict at the top of `peer.py` (e.g. fill_ratio 0.03).

**False-alarm control across the country.** With ~9,000 institutions, z > 3 still flags dozens by chance. So:
1. Convert each one-sided z to a p-value: `p = 0.5 × erfc(z / √2)` (`math.erfc`, no scipy).
2. Apply **Benjamini–Hochberg** over *all* programme × metric tests nationally, `FDR_Q = 0.05`.
3. Flag `PEER_OUTLIER` only if the test survives BH **and** the practical gap is large enough (`MIN_GAP` per metric, e.g. fill_ratio ≥ 0.15). Both a statistical and a practical threshold, like the existing spike rule.

**Flag evidence:**
```json
{"metric": "fill_growth", "value": 0.85, "peer_median": 0.04, "peer_mad": 0.03, "peer_z": 12.6,
 "peer_level": "programme+state+size", "peer_count": 14, "p_value": 1e-9, "bh_q": 0.05}
```
Explanation text: `CSE fill growth +85% vs +4% median of 14 similar programmes (Karnataka, size M)`.

**Peers stay anonymous.** Evidence holds only aggregate peer stats (median, MAD, count). Never peer names or ids.

**Tests (`tests/test_peer.py`):**
- the fallback hierarchy picks the right level when a group is too small
- BH: textbook example (known p-values → known rejections)
- 50 programmes from the same distribution → 0 flags; plant one at +85% → exactly that one flagged
- new institution with no history: flagged by peer rule, not by the history rule
- evidence contains no peer institution ids

---

## A2: Multivariate "unusual overall profile" score

**Idea.** Each rule looks at one number. A college can be slightly odd on *five* numbers at once and pass every single rule. Compute **one distance** that measures how unusual the whole profile is versus peers, and **split that distance into per-feature contributions**, so every flag says *why*.

**Why robust Mahalanobis, not Isolation Forest (say this in the pitch):**
- the score has a statistical meaning (distance from the typical college, accounting for features that move together)
- it decomposes *exactly* into per-feature contributions, so no SHAP library is needed
- it's deterministic and needs no new dependency (numpy)
- Isolation Forest is listed as an optional comparison (end of file)

**Feature vector per institution** (current year):
| Feature | Source |
|---|---|
| `fill_ratio` | counters (weighted over programmes by intake) |
| `foreign_share` | counters |
| `age_iqr` | **new aggregate** in `batch_features`: interquartile range of age at admission, computed in memory at upload |
| `date_bunching` | **new aggregate**: share of the batch's admissions on its busiest 3 admission dates |
| `rejection_rate` | `upload_batches.row_counts_json` |
| `late_share` | `batch_features.minutes_before_deadline` |
| `correction_churn` | ledger `enrolment.updated` / enrolments |

Schema change: add `age_iqr real` and `date_bunching real` to `batch_features`, filled in `ingest.py` from the in-memory rows (same place `max_dob_cluster` is computed). Aggregates only.

**Algorithm (`profile.py`):**
1. Standardise each feature robustly: `z_j = (x_j − median_j) / (1.4826 × MAD_j)` over the peer set (use A1's level 2 grouping: institution type + size band; fall back to all).
2. Covariance of the z-matrix with **shrinkage**: `S = (1 − λ)·cov(Z) + λ·I`, with `λ = 0.2` (documented constant; it keeps the matrix invertible with few institutions).
3. Robustness: compute `S` once, drop the top 10% most distant institutions, recompute `S` (one trimming pass).
4. Distance: `d² = zᵀ S⁻¹ z`.
5. **Contributions:** `c_j = z_j × (S⁻¹ z)_j`. These sum exactly to `d²`. Report each feature's share `c_j / d²`. Show the top 3 positive contributions.
6. Flag `UNUSUAL_PROFILE` if `d²` exceeds the **99.5th percentile of the chi-square distribution with p degrees of freedom** (p = 7 → ≈ 20.3; hard-code a small table, no scipy), **and** the institution has at least `MIN_ROWS = 30` rows.
7. Needs at least `MIN_INSTITUTIONS = 5 × p = 35` institutions in the set; otherwise skip and say so in the API response (`"profile_score": "insufficient peers"`).

**Flag evidence:**
```json
{"d2": 31.4, "threshold": 20.3, "peers": 120,
 "top_contributors": [{"feature": "date_bunching", "value": 0.71, "peer_median": 0.18, "share": 0.46},
                      {"feature": "age_iqr", "value": 0.4, "peer_median": 1.6, "share": 0.27},
                      {"feature": "late_share", "value": 0.9, "peer_median": 0.1, "share": 0.15}]}
```
Explanation text: `Overall profile unusual vs 120 peers, mainly: 71% of admissions on 3 dates (peers 18%), ages unusually uniform, 90% uploaded on deadline day`.

**UI:** a horizontal bar chart of contributions on the institution's AICTE detail page.

**Tests (`tests/test_profile.py`):**
- contributions sum to d² (within 1e-9)
- 200 institutions from one multivariate normal: flag rate ≈ 0.5% (between 0 and 2%)
- plant one institution mildly odd on 4 features (each under its single-rule threshold) → flagged, and its top contributors are those 4 features
- fewer than 35 institutions → no flags, "insufficient peers"
- deterministic: same input → identical output

---

## A3: Shared-student network (ghost-student rings, seat blocking)

**Idea.** Today a cross-institution duplicate is a *pair* case. Look at the **whole network**: colleges are nodes, and an edge means they share students (now or over the past years). Normal migration creates a few thin, scattered edges. A **ring** (several colleges repeatedly sharing the same students) points to ghost students used to show full classes, or seat blocking (a student holding seats in several colleges).

**Edge data, privacy-safe.** Add a SECURITY DEFINER function in `rls.sql`, callable by regulator roles only:
```
shared_student_edges(year) RETURNS TABLE(inst_a, inst_b, active_shared, historical_shared, carousel)
```
It joins enrolments on the APAAR **blind index** (never plaintext) and returns **counts only**:
- `active_shared`: students active at both now (true double enrolment)
- `historical_shared`: students enrolled at both over the past 3 years (moved between them)
- `carousel`: students who moved A→B and later B→A (or around a cycle of 3)

Institutions cannot call it (test this).

**Algorithm (`network.py`, pure Python, union-find, no networkx):**
1. Build a weighted undirected graph. Edge weight `w = active_shared + 0.5 × historical_shared + 2 × carousel`. Keep edges with `w ≥ EDGE_MIN = 3`.
2. Connected components (union-find).
3. Per component with ≥ 3 colleges, compute:
   - `size`: colleges
   - `density`: edges / possible edges
   - `shared_ratio`: total shared students / total enrolments of the component
   - `cycle`: the component contains a cycle (edges ≥ nodes)
   - `carousel_total`
4. Flag `SHARED_STUDENT_RING` if `size ≥ 3` **and** (`density ≥ 0.5` **or** `carousel_total ≥ 5`) **and** `shared_ratio ≥ 0.02`.
5. Also flag per edge `SEAT_BLOCKING` if `active_shared ≥ 5` between two colleges (students actively enrolled at both).

**Negative controls (must NOT flag):** two neighbouring colleges with 1–2 legitimate migrations; a chain A–B–C with one migration each (low density, no carousel).

**Flag evidence:**
```json
{"colleges": 4, "density": 0.83, "shared_students": 46, "carousel": 9, "shared_ratio": 0.06, "has_cycle": true}
```
Explanation: `4 colleges share 46 students; 9 moved in a loop between them`. The flag is attached to every college in the ring.

**UI (AICTE only):** a network view on the AICTE dashboard. Draw it with a small force layout in SVG (no new dependency, or a ~50-line simple layout). Ring members highlighted. Clicking an edge shows counts only. Names of students never shown; drilling down goes through the existing unmask-with-reason flow.

**Tests (`tests/test_network.py`):**
- union-find components on a hand-made graph
- planted 4-college ring with a carousel → flagged; all 4 colleges carry the flag
- negative controls → no flags
- an institution user calling `shared_student_edges` → permission denied (raw SQL test, like `test_rls.py`)

---

## A4: Inspector feedback loop (the system learns)

**Idea.** AICTE inspectors mark each flag **confirmed**, **dismissed** or **needs info**. The system tracks **precision per rule** and uses it to weight the inspection queue. Over time, rules that keep being confirmed rank higher; noisy rules rank lower.

**Stable flag identity.** Flags are recomputed on every request, so give each a stable key:
`flag_key = sha256(type | institution_id | programme | academic_year)` (via `crypto` helpers). Same anomaly → same key.

**Schema:**
```sql
CREATE TABLE flag_reviews (
  id bigserial PRIMARY KEY,
  flag_key text NOT NULL, rule text NOT NULL, institution_id text NOT NULL, academic_year text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('confirmed','dismissed','needs_info')),
  reason text NOT NULL CHECK (length(reason) >= 10),
  evidence_snapshot jsonb NOT NULL,      -- the numbers the inspector saw
  reviewer text NOT NULL, reviewed_at timestamptz NOT NULL DEFAULT now()
);
```
RLS: insert/select for `aicte_officer`; select for `auditor`; institutions none. Every review also writes an audit row.

**Endpoint:** `POST /v1/flags/{flag_key}/review` `{decision, reason}` (aicte_officer only, Idempotency-Key). `GET /v1/rules/performance` (regulators).

**Learning rule (`feedback.py`):**
- Per rule: `precision = (confirmed + 1) / (confirmed + dismissed + 2)`. This is a Beta(1,1) prior, so a rule with 1 review isn't judged 0% or 100%. Also report the counts and a 90% credible interval.
- Rule weight in the queue: `weight = max(WEIGHT_FLOOR, precision)` with `WEIGHT_FLOOR = 0.25`.
- Inspection risk becomes `(100 − DQS) × active + Σ_flags weight(rule) × severity(flag) × FLAG_POINTS` (keep `FLAG_POINTS` documented). The queue shows the weight next to each flag.
- A dismissed flag is hidden from the queue for that institution **until its evidence changes by more than 20%** (compare with `evidence_snapshot`), so it doesn't come back every refresh, but returns if things get worse.

**Guardrails (important; say these to judges):**
- **No rule can be switched off by feedback.** The weight floor keeps every rule visible.
- Dismissals need a written reason and are audit-logged.
- `GET /v1/rules/performance` shows per-reviewer dismissal rates, so one inspector quietly dismissing everything is visible.
- Recall can't be learned from reviews (missed cases are never reviewed). Recall comes only from the synthetic evaluation. Say this.

**UI:** confirm/dismiss buttons with a reason box on each flag; a "Rule performance" panel: rule, reviews, precision with interval, current weight.

**Tests (`tests/test_feedback.py`):**
- precision math with the prior (0 reviews → 0.5; 9 confirmed / 1 dismissed → 10/12)
- weight never below the floor even after 50 dismissals
- dismissed flag hidden; evidence grows 25% → it returns
- institution and verifier roles get 403 on the review endpoint (access matrix)
- every review produces an audit row

---

## A5: Evaluation and generator changes

The teammate's generator (`synthetic/`) needs new planted faults and labels in `ground_truth.json`:

| Fault | Plant | Expected flag |
|---|---|---|
| `peer_outlier_new_college` | new institution, no history, fill growth far above peers | `PEER_OUTLIER` |
| `subtle_multi_feature` | institution mildly odd on 4 features, each under its rule threshold | `UNUSUAL_PROFILE` |
| `ghost_ring` | 4 colleges sharing ~40 students, ~8 in a carousel | `SHARED_STUDENT_RING` on all 4 |
| `seat_blocking_pair` | 2 colleges with 6 students active at both | `SEAT_BLOCKING` |
| negative controls | normal migrations, a chain with single migrations, a big but proportional college | nothing |

Scale for the evaluation: **≥ 150 institutions** across ≥ 5 states (the profile score needs ≥ 35 per peer set; peer baselines need ≥ 8 per group). Keep the 30-institution preset for the demo, but seed the demo DB from a bigger run so peer groups exist.

`tests/test_eval_v2.py` (or extend `test_eval.py`): run 5 seeds, print a table per flag type: planted, caught, precision, recall, false alarms on negative controls. Report honestly, as before.

**Simulated feedback demo:** a script `python -m app.demo_feedback` that "reviews" flags using the ground truth (confirm planted, dismiss the rest) and prints how the queue order changes. Good for the slide "the system learns from inspectors".

---

## Demo story (2 minutes)
1. AICTE inspection queue: a new college with no history is at the top. Its flag says "fill +85% vs +4% for 14 similar programmes". The peer rule caught what the history rule can't.
2. A college that passes every single rule is flagged as an unusual profile; the bar chart shows why (admissions bunched on 3 dates, uniform ages, deadline-day upload).
3. Network view: a ring of 4 colleges lights up, "46 shared students, 9 moving in a loop".
4. The inspector confirms the ring and dismisses one noisy flag; the rule-performance panel updates and the queue reorders.
5. Close: "Every flag is explainable, false alarms are controlled nationally at 5%, and the system learns from inspectors without any rule being silenced."

## Time estimate
A0 0.5 h · A1 2 h · A2 2 h · A3 2.5 h · A4 2 h · A5 1.5 h (+ teammate's generator changes in parallel). **~10 h total.** If short on time, cut in this order: carousel detection (keep active/historical edges), the network UI (show a table instead), the dismissed-flag suppression.

## Optional alternatives (need dependency approval)
- **Isolation Forest** (`scikit-learn`): run alongside A2 as a comparison and report both on the eval table. Not the primary score, because it needs SHAP for explanations.
- **`networkx`**: Louvain community detection instead of connected components, if rings ever merge into one big component at national scale.
- **MinCovDet** (`scikit-learn`): a textbook robust covariance instead of the one-pass trimming in A2.
