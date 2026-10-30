# Demo runbook (about 6 minutes)

All data is synthetic, and the APAAR registry, AICTE registry and staff logins are MOCK. Say so at the start; the yellow banner shows it too.
Staff password: `demo`. Student: Asha Joshi, APAAR `328865551724`. She signs in with a **passkey**: the demo seed prints her one-time activation code.

**Rehearse the passkey steps on the presentation laptop itself.** Windows Hello (or a phone passkey) must be set up there, and the browser must open `http://localhost:5173`, not `127.0.0.1`. The fallback is to restart the API with `DEMO_MODE=true` (`$env:DEMO_MODE="true"` before uvicorn). That brings back the MOCK sign-in (APAAR + DOB `2006-11-05`) and OTP approval (`123456`); both are clearly labelled MOCK in the UI.

## Before the judges arrive (10 min)
1. **Start the API:** in `backend/`, run `..\.venv\Scripts\python.exe -m uvicorn app.main:app`.
2. **Start the frontend:** in `frontend/`, run `npm run dev`, then open http://localhost:5173.
3. **Reset the demo data (a few seconds):** in `backend/`, run `..\.venv\Scripts\python.exe ..\tools\demo_snapshot.py restore`. It puts back the saved starting point: all 304 colleges loaded, Institution B (Solapur) **not** uploaded yet, and Asha's passkey activation code unused again (the code printed when the snapshot was made). The API keeps running; sign in again in open tabs.
   - **One-time setup of that starting point** (about 15 min, only if the snapshot is missing or the data model changed): set `$env:WORLD_DIR="<world folder>"` and `$env:DEMO_MODE="true"` for the API and these commands, run `..\.venv\Scripts\python.exe -m app.demo --live`, then with the API running `..\.venv\Scripts\python.exe ..\tools\load_world.py --dir $env:WORLD_DIR`, then `..\.venv\Scripts\python.exe ..\tools\demo_snapshot.py save`. Note the activation code `app.demo` prints.
   - `app.demo` and `app.seed --reset` wipe the local database (the 300 colleges too); the snapshot survives them, so `restore` still works afterwards.
   - The live site (vidyapramaan.vercel.app) uses its own database and is never affected.
4. **Open two browser windows:** one normal and one **private** (sessions are per browser). Window 1 is for presenting; window 2 stays signed in as `aicte`.
5. **Keep `backend/data/synthetic/B1.csv` handy** for the drag-and-drop.

Reset between takes with `demo_snapshot.py restore` (step 3). Sign out of both windows first.

## The 8 steps

| # | Window / login | Do | Expect on screen | Say |
|---|---|---|---|---|
| 1 | W1 `inst-a` | Show the dashboard | Upload history green; seats within intake | "A submits student-level data keyed by APAAR, by portal or API." |
| | W2 `aicte` | **Sign checkpoint** (ledger card) | Ledger verified, new checkpoint signed | "Every enrolment change is hash-chained; AICTE signs checkpoints." |
| 2 | W1 `inst-b` | **Upload student records**: drag `B1.csv` | 208 rows · 187 accepted · 21 rejected · 10 warnings · 14 flags · 3 cases opened | "Validation is deterministic code, no AI." |
| | | **See row-level issues →**, then filter by codes E102, E201, E303, E302 and E101W | Invalid APAAR, duplicate in file, declared intake ≠ registry, FN/OCI/CIWG cap breach | "Intake comes only from the AICTE registry. Students without an APAAR still count (E101W)." |
| | | **Download error report (CSV)** | CSV with a fix hint per row | |
| 3 | W1 `inst-b` dashboard | **Notices from AICTE** | "A record in batch #… needs AICTE review (case #…)" | "B learns nothing about the other institution." |
| | W2 `aicte` | **Duplicate cases**: type a reason, **Unmask** | Both enrolments: A and B, names, student IDs | "Unmasking needs a reason, is logged, and the student sees it." |
| | | **Investigate** (note: "asking both") | Status: under investigation; credentials suspended | |
| 4 | W2 `aicte` | **Risk-based inspection queue**: click *Saraswati Narain Institute of Management Studies, Kanpur* | DQS breakdown; ENROLMENT_SPIKE flag with its evidence numbers | "Risk indicator for review, not proof. Every rank is explainable." |
| | | Excess admissions card | B.Tech CSE 125/120 regular, 22/18 supernumerary | |
| 5 | W1 `employer` | **My consent requests** | A pending request for Asha (name, programme, institution, status) | "Employers can't look anyone up. They ask; the student decides." |
| | W1 sign-in page | **Activate and register passkey** with APAAR `328865551724` + the printed code, confirm with Windows Hello, then **Sign in with passkey** | Student portal | "The DOB no longer gets anyone in. The institution hands the student a one-time code, and the student registers a passkey." |
| | W1 student | **Consent requests**: **Approve with passkey** | Request approved | "The passkey signs exactly this request: its verifier, fields and expiry." |
| | W1 `employer` | **Fetch & verify credential** | **VALID**, with only the 4 approved fields. Also click **Download JSON** (used in step 7) | "W3C VC 2.0, eddsa-jcs-2022, checked against the official W3C test vectors." |
| | W1 `inst-a` | **Student records and credentials**: search `328865551724`, then **Certificate & QR** | Certificate with APAAR ID + student ID + QR | |
| 6 | W1 `inst-a` | Same record: **Withdraw**, then confirm | Enrolment withdrawn | |
| | W1 `employer` | **Fetch & verify credential** again | **REVOKED** | "Withdrawal flips a bit in the public status list; the verifier's check reveals nothing to us." |
| 7 | W2 `aicte` | **Verify a credential**: **Try a forged credential (DEMO)** | **UNTRUSTED ISSUER** | "Issuers must be in AICTE's registry, which blocks fake universities." |
| | W2 `aicte` | Same page: **Load JSON file** (downloaded in step 5), change one letter of the name, **Verify now** | **TAMPERED** (the signature check fails before the status check) | "Change one character and the signature breaks." |
| 8 | W2 `aicte` dashboard | Totals | Post-deadline changes: 1 (a backdated withdrawal, E501); ledger verified | "A backdated deletion after the deadline is flagged and can't be hidden in the ledger." |
| | W1 student (Asha) | **Who accessed my data** | Credential issued; consent request and grant; employer verifications; withdrawal | "The student sees every access. An AICTE unmask shows up the same way, with its reason, for the student in that case." |

## Fallbacks
- **API not reachable:** check the uvicorn window, then rerun `app.demo --live`.
- **Upload fails or shows unexpected numbers:** rerun the seed *without* `--live` (`python -m app.demo`). B is then already uploaded and every later step still works; show the batch from **Upload history → View issues →**.
- **Consent fetch fails:** sign in as the student, check that the request shows as approved, then fetch again as the employer.
- **Passkey prompt fails or the laptop has no authenticator:** restart the API with `DEMO_MODE=true`, use the MOCK date-of-birth sign-in and the MOCK OTP, and say it's the demo fallback.
- **Activation code already used** (for example after a rehearsal): sign in as `inst-a`, open **Student records** for `328865551724`, then **Passkey activation code…**. This is a reissue, so the new passkey can't approve for 24 h. Rerun `python -m app.demo --live` instead to get a fresh first-time code.
- **Anything else:** say "this is the pre-recorded run" and switch to the backup video.

## Not in this demo (say so if asked)
- **Not built yet:** offline QR verification and a camera scanner. QR text can be pasted into **Verify a credential**.
- **Deferred:** an "ask the data" question box (Gemini column matching, the ERP connector and webhooks are built, just not in this script).
- **MOCK:** real APAAR/AICTE/DigiLocker integration.
- **Seat caps:** only the FN/OCI/CIWG caps are verified against the AICTE Handbook.
