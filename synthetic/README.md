# Synthetic dataset generator

This generator creates fake institution uploads for the APAAR platform, together with a matching set of fake registries. It also writes an answer key (`ground_truth.json`) recording every problem planted in the data, so you can measure exactly what the platform catches and what it misses.

All data is invented. APAAR IDs are random 12-digit numbers starting with `9` (configurable). Use the data only in dev and test environments.

## Run

```bash
pip install openpyxl pyyaml        # or: uv add openpyxl pyyaml

# full evaluation set (~10 s)
python -m synthetic.generate --institutions 30 --students 50000 --out data/ --seed 42

# small demo set: A clean, B messy with every row-level fault, C anomalies, D closed institution
python -m synthetic.generate --preset demo --out data_demo/ --seed 7

# prove the answer key matches the files (re-reads every file from disk)
python -m synthetic.selfcheck data/
```

Options:

| Option | What it does |
|---|---|
| `--faults <yaml>` | Change fault rates and counts (default `synthetic/faults.yaml`) |
| `--seat-config <yaml>` | Override the seat caps with values checked against the AICTE Handbook |
| `--seed` | Same seed, byte-identical output |
| `--out` | Must be an empty or new folder |

> **Before the evaluation counts:**
> - The caps marked `verify: true` in `faults.yaml` (TFW 5%, lateral entry 10%) are **placeholders**. The FN/OCI/CIWG 15% pool and the CIWG one-third share come from reference [S1].
> - Once the Handbook caps are checked, pass them with `--seat-config`.
> - Also replace the admission window and reporting deadline with the real calendar.

## What it writes

```
data/
├── uploads/<institution_id>/batch_01.csv|xlsx, batch_02...   # what institutions upload
├── registry/apaar_registry.json        # mock APAAR registry (seed the ApaarRegistry adapter)
├── registry/aicte_institutions.json    # mock AICTE approvals: status by year, programmes, intake, aliases
├── registry/approved_intake.csv        # same intake data, flat (seed approved_intake)
├── registry/seat_categories_used.yaml  # caps used in this run
├── history/enrolment_history.csv       # 3 prior years per programme (anomaly baselines)
├── manifest.json                       # every batch: file, institution, upload_at, header row, dialect
├── mutations.json                      # later edits; post-deadline ones expect E501
├── ground_truth.json                   # the answer key
└── summary.txt
```

### Messiness built in (what the parser and Gemini column mapping must handle)

| Aspect | What varies |
|---|---|
| **Headers** | Several names per field (`Stud APAAR No`, `D.O.B`, `Quota`…). Some files shuffle column order, add `Sl No` / `Remarks` columns, or put a title row and a blank row above the header. |
| **Dates** | `dd-mm-yyyy`, `dd/mm/yyyy`, `yyyy-mm-dd`, `dd.mm.yyyy`, or native Excel dates. |
| **Booleans** | `Y/N`, `Yes/No`, `1/0`, `TRUE/FALSE`, or `Y`/blank. |
| **APAAR formats** | Plain, `1234 5678 9012`, `1234-5678-9012`, or numeric Excel cells. These are **valid** after stripping spaces and hyphens. |
| **Category values** | Seat type, APAAR reason, status and gender each come in several spellings (`Regular` / `Within Intake`, `NOGEN` / `Not Generated`, `Studying` / `Active`…). |
| **Programmes** | Code (`BE-CSE`), short form (`CSE`) or full name. `aicte_institutions.json` lists aliases. |
| **Names** | UPPER / Title case, honorifics (`Mr.`, `Kum.`), stray spaces, middle initials. |
| **CSV files** | `,` or `;` delimiters, with or without a UTF-8 BOM. |
| **Hostile header** | One institution (B in the demo) has a **prompt-injection header** to test the Gemini column-matching guardrails. |

`manifest.json` records each file's exact dialect. Use it to debug the parser. **Don't** let the platform read it, because a real institution won't send one.

## `ground_truth.json` (the answer key)

| Key | Contents |
|---|---|
| `rows` | `{file, row, codes[], faults[], accepted}`. `row` is the 1-based data row after the header (title, blank and header rows are not counted). Rows not listed here should produce **no** codes. |
| `duplicate_groups` | E201 (same file), E202 (same institution, 2nd batch), E203 (exact APAAR across institutions), E204 (fuzzy: no APAAR, name variant, same DOB and guardian). `flagged_member` is the copy uploaded later; flagging either member counts as a hit. |
| `programme_faults` | E301 (regular pool over intake), E302 (FOREIGN pool, CIWG sub-cap, TFW or LATERAL over cap), E303 (declared intake ≠ registry). These are derived by counting accepted active rows, so rows without APAAR but with a reason **count**. |
| `batch_faults` | E304: uploads from an institution that isn't approved this year. |
| `anomalies` | ENROLMENT_SPIKE, CATEGORY_MIX_SHIFT, DOB_CLUSTER, SEQUENTIAL_APAAR, DEADLINE_DUMP, each with evidence. |
| `negatives` | Cases that **must not** raise codes, to measure false positives: <br>• `withdrawn_then_reenrolled`: no E203/E204 <br>• `twins`: same DOB, surname and guardian, but different people, so no E201/E202/E204 <br>• `transliteration_variant`: `Mohd` vs `Mohammed`, so no E104 |
| `mutations_expected` | Post-deadline edits and withdrawals that must raise E501. |
| `conventions.severity` | Severity per code. `accepted=false` means the row has an error-severity code. |

## Planted faults

| Code | How it is planted |
|---|---|
| E101 | APAAR blank, no reason |
| E101W | APAAR blank with REFUSED / NOT_GENERATED / PENDING. **Legitimate**: the row is accepted and counted |
| E102 | APAAR one digit short or long, or a letter in place of a digit (`O`, `I`, `l`, `S`, `B`) |
| E103 | Valid format, not in the registry |
| E104 | DOB shifted 1–3 years, or a first name that isn't a spelling variant |
| E201–E204 | See `duplicate_groups` |
| E301–E304 | See `programme_faults` / `batch_faults` |
| E401 | FN and OCI both Y; NRI and FN both Y; or seat type FN with the FN flag N |
| E402 | Age at admission between 11 and 13.5, or between 40 and 52 |
| E403 | Admission date before or after the window |
| E404 | Lateral entry in year 1 |
| E501 | `mutations.json` entries after the reporting deadline |

## How the answer key is verified

`selfcheck.py` doesn't trust the generator. It reads the files back, parses each dialect and recomputes:
- every row-level code from the raw cells and the registries
- every duplicate group
- every programme-level cap breach

It also checks that no APAAR ID is reused anywhere outside a recorded group or negative. Run it after changing `faults.yaml` or the generator. It doubles as a reference parser for the evaluation scripts.

## How the platform uses it

- `backend/data/eval_anomalies.py` and `backend/data/eval_fuzzy.py` score the anomaly rules and fuzzy duplicate matching against `ground_truth.json`, reading the files with `selfcheck.py`'s parser.
- `tools/load_world.py` uploads a generated world through the API in `upload_at` order (used for the live demo data).
- `--preset demo` gives a small set: A clean, B messy, C anomalies, plus cross-institution duplicates between A and B.

## Deliberately not included

- **Ghost students via ABC credits (FS1)** and **counselling reconciliation (FS2)**. These are future scope.
- **Reservation/social category.** The PS doesn't require it, so it's left out under data minimisation.
