import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
os.environ.pop("APAAR_KEYS_JSON", None)
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
