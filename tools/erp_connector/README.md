# APAAR ERP connector

A small command-line tool for colleges without developers. It works in two parts:
- **push:** reads an ERP export (CSV or JSON, `,` `;` or tab delimited), maps its columns with a YAML file, and uploads it as a batch.
- **receive:** runs a local receiver that verifies the platform's signed webhooks.

It prints counts, codes and ids only, never student data. It needs `httpx` and `PyYAML`, which are already in the project venv.

## Worked example (local prototype)

1. **Start a fresh demo database** (in `backend/`):
   ```
   ..\.venv\Scripts\python.exe -m app.seed --reset
   ```
2. **Start the API.** Allowing `http://localhost` webhooks is for development only; production webhooks must be https:
   ```
   $env:WEBHOOK_ALLOW_LOCALHOST="true"; ..\.venv\Scripts\python.exe -m uvicorn app.main:app
   ```
3. **Register a webhook as `inst-a`** (any HTTP client; PowerShell shown). Copy the `secret` from the response: it is shown once.
   ```
   $t = (Invoke-RestMethod -Method Post http://127.0.0.1:8000/v1/auth/login -ContentType application/json -Body '{"user_id":"inst-a","password":"demo"}').access_token
   Invoke-RestMethod -Method Post http://127.0.0.1:8000/v1/webhooks -Headers @{Authorization="Bearer $t"} -ContentType application/json `
     -Body '{"url":"http://127.0.0.1:8787/hook","events":["batch.validated","case.opened","case.resolved","credential.issued","credential.revoked"]}'
   ```
4. **Start the receiver** (second terminal, from `tools/erp_connector/`). It asks for the secret, or reads `APAAR_WEBHOOK_SECRET`:
   ```
   ..\..\.venv\Scripts\python.exe connector.py receive --port 8787
   ```
5. **Push the example export** (third terminal). It asks for the password, or reads `APAAR_PASSWORD`:
   ```
   ..\..\.venv\Scripts\python.exe connector.py push --mapping example\mapping.yaml example\erp_export.csv --user inst-a
   ```
   Output: `batch #1: rows 25, accepted 25, ...`. Run it again and it reports `replayed: already uploaded`, because the
   `Idempotency-Key` is derived from the SHA-256 of the export plus the mapping.
6. **Within about 2 s the receiver prints** `VERIFIED ok: batch.validated {"batch_id": 1, "codes": {...}, "counts": {...}}`.

`example/erp_export.csv` is synthetic (25 rows of `backend/data/synthetic/A1.csv`) in typical ERP form: renamed headers,
`dd/mm/yyyy` dates, `Yes`/`No` flags and `;` as the delimiter. `example/mapping.yaml` shows every mapping option:
`columns`, `values`, `dates` + `date_format`, and `defaults`.

## The password and secret
They come from an environment variable or a prompt, **never a command-line argument**, which would show up in the process
list and in shell history.

## Verifying webhooks in your own system
Webhooks follow [Standard Webhooks](https://www.standardwebhooks.com/) v1:
- **Headers:** `webhook-id`, `webhook-timestamp` and `webhook-signature: v1,<base64 HMAC-SHA256(key, id + "." + timestamp + "." + body)>`, where `key` is the base64 after `whsec_`.
- **Checks:** reject timestamps more than 5 minutes off, and event ids you've already seen.
- **Retries:** a retry keeps the same `webhook-id` with a fresh timestamp.
- **Secret rotation:** after a rotation the header carries two signatures for 24 h. Accept if either matches.

`verify()` in `connector.py` is a 15-line reference implementation.

## Limitations
- The receiver keeps seen event ids in memory only, so a restart forgets them. A production receiver stores them for at least the 5-minute window.
- There is no scheduler. Run `push` from Windows Task Scheduler or cron.
