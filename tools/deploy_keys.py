"""Complete a key file for a serverless deployment, then print it as one line for the APAAR_KEYS_JSON variable.

    set APAAR_KEY_FILE=<keys file kept OUTSIDE git>   (the same file used to seed the production database)
    set APAAR_DB=<database>  DATABASE_URL=<admin URL>
    .venv\\Scripts\\python.exe tools/deploy_keys.py --out <file for the env value>

Serverless instances can't write keys, so every key the API may ask for must exist up front: the symmetric keys, the
AICTE signers, the demo forged issuer and every issuer DID in the trust registry. Never commit either file.
"""
import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
os.environ.pop("APAAR_KEYS_JSON", None)  # this tool writes the key file
from app import consent, credentials, crypto, db, ledger  # noqa: E402

SYMMETRIC = ("k_enc", "k_apaar_bi", "k_dob_bi", "k_name_bi", "k_jwt", "k_activation")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="where to write the one-line JSON (keep it out of git)")
    a = ap.parse_args()
    if not os.environ.get("APAAR_KEY_FILE"):
        sys.exit("Set APAAR_KEY_FILE to the production key file first")
    for name in SYMMETRIC:
        crypto.secret(name)
    with db.connect() as c:
        dids = [r["did"] for r in c.execute("SELECT did FROM issuer_registry")]
    for name in [ledger.SIGNER, consent.CONSENT_SIGNER, credentials.AICTE_REGISTRY_KEY, "did:web:fake-university.example", *dids]:
        crypto.signing_key(name)
    keys = json.loads(crypto.KEY_FILE.read_text())
    Path(a.out).write_text(json.dumps(keys, separators=(",", ":")), encoding="utf-8")
    print(f"{len(keys) - 1} symmetric keys, {len(keys['signing'])} signing keys -> {a.out} ({Path(a.out).stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
