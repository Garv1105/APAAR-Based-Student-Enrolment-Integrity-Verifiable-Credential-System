"""Field encryption, blind indexes, normalisation and signing (PRD §8, §10, §11).

Primitives come from `cryptography` (OpenSSL) and `rfc8785`; nothing is hand-rolled.
Keys live in backend/.keys.json, generated on first use.
ponytail: local key file is prototype-only; production = KMS/HSM with rotation.
"""
import base64
import hashlib
import hmac
import json
import os
import re
import unicodedata
from pathlib import Path

import base58
import jellyfish
import rfc8785
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

KEY_FILE = Path(os.environ.get("APAAR_KEY_FILE", Path(__file__).resolve().parent.parent / ".keys.json"))
KEYS_ENV = "APAAR_KEYS_JSON"  # serverless: every instance reads the same keys from the environment, read-only
_SYMMETRIC = ("k_enc", "k_apaar_bi", "k_dob_bi", "k_name_bi")  # separate keys (PRD §8 rule 2)
_keys: dict | None = None


def _load() -> dict:
    global _keys
    if _keys is None:
        if os.environ.get(KEYS_ENV):
            _keys = json.loads(os.environ[KEYS_ENV])
        elif KEY_FILE.exists():
            _keys = json.loads(KEY_FILE.read_text())
        else:
            _keys = {k: os.urandom(32).hex() for k in _SYMMETRIC}
            _keys["signing"] = {}
            _save()
    return _keys


def _save() -> None:
    KEY_FILE.write_text(json.dumps(_keys, indent=1))


def _missing(name: str) -> None:
    """With keys from the environment a new key would exist on one instance only: fail loudly instead."""
    if os.environ.get(KEYS_ENV):
        raise RuntimeError(f"key '{name}' is missing from {KEYS_ENV}; regenerate it with tools/deploy_keys.py")


def _key(name: str) -> bytes:
    keys = _load()
    if name not in keys:  # e.g. 'k_jwt', 'k_otp' added after first run
        _missing(name)
        keys[name] = os.urandom(32).hex()
        _save()
    return bytes.fromhex(keys[name])


def secret(name: str) -> bytes:
    return _key(name)


# ---------- normalisation ----------
HONORIFICS = {"mr", "mrs", "ms", "miss", "dr", "smt", "shri", "sri", "kumari", "kum", "km", "prof"}


def normalise_name(name: str) -> str:
    """casefold, strip accents, punctuation and honorifics, collapse whitespace.
    ponytail: Latin script only; Indic-script transliteration not implemented."""
    s = unicodedata.normalize("NFKD", name or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).casefold()
    tokens = [t for t in re.split(r"[^a-z]+", s) if t and t not in HONORIFICS]
    return " ".join(tokens)


# ---------- encryption ----------
def _aad(table: str, column: str, row_id) -> bytes:
    return f"{table}|{column}|{row_id}".encode()


def encrypt(table: str, column: str, row_id, plaintext: str) -> bytes:
    """AES-256-GCM, random 96-bit nonce. AAD = table|column|row_id, so a ciphertext can't be
    moved to another row or column without failing authentication."""
    nonce = os.urandom(12)
    return nonce + AESGCM(_key("k_enc")).encrypt(nonce, plaintext.encode(), _aad(table, column, row_id))


def decrypt(table: str, column: str, row_id, blob: bytes) -> str:
    blob = bytes(blob)
    return AESGCM(_key("k_enc")).decrypt(blob[:12], blob[12:], _aad(table, column, row_id)).decode()


# ---------- blind indexes ----------
def _hmac(key_name: str, value: str) -> bytes:
    return hmac.new(_key(key_name), value.encode(), hashlib.sha256).digest()


def apaar_bi(apaar: str) -> str:
    return _hmac("k_apaar_bi", apaar).hex()


def dob_bucket(dob_iso: str) -> int:
    """16-bit truncation creates collisions on purpose (less frequency leakage)."""
    return int.from_bytes(_hmac("k_dob_bi", dob_iso)[:2], "big")


def name_phonetic(name: str) -> list[str]:
    return sorted({_hmac("k_name_bi", jellyfish.metaphone(t)).hex()[:32] for t in normalise_name(name).split()})


def mask_apaar(apaar: str) -> str:
    return f"XXXX-XXXX-{apaar[-4:]}"


# ---------- signing ----------
def jcs(obj) -> bytes:
    # Fast path for flat dicts of ASCII keys and str/int/bool/None values (ledger states): there JCS is exactly sorted-key
    # compact JSON. rfc8785 is pure Python and ~30x slower, which made a full ledger verify take ~25 s on 58k rows.
    if isinstance(obj, dict) and all(isinstance(k, str) and k.isascii() for k in obj) and all(
            v is None or isinstance(v, (str, bool)) or (isinstance(v, int) and abs(v) < 2**53) for v in obj.values()):
        return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    return rfc8785.dumps(obj)


def multibase_b58(data: bytes) -> str:
    return "z" + base58.b58encode(data).decode()


def from_multibase_b58(s: str) -> bytes:
    if not s.startswith("z"):
        raise ValueError("expected base58btc multibase ('z' prefix)")
    return base58.b58decode(s[1:])


ED25519_PUB_PREFIX = b"\xed\x01"  # multicodec ed25519-pub, as used by Multikey


def signing_key(name: str) -> Ed25519PrivateKey:
    """Named Ed25519 key (issuer DIDs, 'aicte-ledger'). Created on first use."""
    keys = _load()
    if name not in keys["signing"]:
        _missing(name)
        keys["signing"][name] = os.urandom(32).hex()
        _save()
    return Ed25519PrivateKey.from_private_bytes(bytes.fromhex(keys["signing"][name]))


def public_multikey(priv: Ed25519PrivateKey) -> str:
    return multibase_b58(ED25519_PUB_PREFIX + priv.public_key().public_bytes_raw())


def public_from_multikey(mk: str) -> Ed25519PublicKey:
    raw = from_multibase_b58(mk)
    if raw[:2] != ED25519_PUB_PREFIX or len(raw) != 34:
        raise ValueError("not an Ed25519 Multikey")
    return Ed25519PublicKey.from_public_bytes(raw[2:])


ED25519_PRIV_PREFIX = b"\x80\x26"  # multicodec ed25519-priv


def private_from_multikey(mk: str) -> Ed25519PrivateKey:
    raw = from_multibase_b58(mk)
    if raw[:2] != ED25519_PRIV_PREFIX or len(raw) != 34:
        raise ValueError("not an Ed25519 private Multikey")
    return Ed25519PrivateKey.from_private_bytes(raw[2:])


# ---------- W3C Data Integrity, cryptosuite eddsa-jcs-2022 (vc-di-eddsa §3.3) ----------
def _jcs_proof_config(document: dict, proof: dict) -> dict:
    cfg = {k: v for k, v in proof.items() if k != "proofValue"}
    if "@context" in document and "@context" not in cfg:
        cfg["@context"] = document["@context"]
    return cfg


def _jcs_hash_data(document: dict, proof_config: dict) -> bytes:
    unsecured = {k: v for k, v in document.items() if k != "proof"}
    return hashlib.sha256(jcs(proof_config)).digest() + hashlib.sha256(jcs(unsecured)).digest()


def eddsa_jcs_2022_sign(document: dict, proof_options: dict, priv: Ed25519PrivateKey) -> dict:
    """Returns a copy of `document` with a DataIntegrityProof. proof_options: type, cryptosuite,
    created, verificationMethod, proofPurpose. The document's @context is copied into the proof."""
    cfg = _jcs_proof_config(document, proof_options)
    sig = priv.sign(_jcs_hash_data(document, cfg))
    return {**{k: v for k, v in document.items() if k != "proof"}, "proof": {**cfg, "proofValue": multibase_b58(sig)}}


def eddsa_jcs_2022_verify(secured: dict, pub: Ed25519PublicKey) -> bool:
    proof = secured.get("proof")
    if not isinstance(proof, dict) or proof.get("type") != "DataIntegrityProof" or proof.get("cryptosuite") != "eddsa-jcs-2022":
        return False
    ctx = proof.get("@context")
    if ctx is not None:  # document @context must start with the proof's @context, in order
        doc_ctx = secured.get("@context") or []
        if not isinstance(ctx, list) or list(doc_ctx[:len(ctx)]) != ctx:
            return False
    try:
        sig = from_multibase_b58(proof["proofValue"])
        pub.verify(sig, _jcs_hash_data(secured, _jcs_proof_config(secured, proof)))
        return True
    except Exception:  # bad encoding or InvalidSignature
        return False


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


# ---------- webhooks (Standard Webhooks v1: HMAC-SHA256 over "id.timestamp.body") ----------
def webhook_secret() -> str:
    return "whsec_" + base64.b64encode(os.urandom(32)).decode()


def _webhook_key(secret: str) -> bytes:
    return base64.b64decode(secret.removeprefix("whsec_"))


def webhook_sign(secrets_: list[str], msg_id: str, ts: int, body: bytes) -> str:
    """Value of the webhook-signature header: one 'v1,<base64>' per active secret (several during a rotation)."""
    msg = f"{msg_id}.{ts}.".encode() + body
    return " ".join("v1," + base64.b64encode(hmac.new(_webhook_key(s), msg, hashlib.sha256).digest()).decode() for s in secrets_)


def webhook_verify(secret: str, msg_id: str, ts: int, body: bytes, signature_header: str, now: int, tolerance: int = 300) -> bool:
    if abs(now - ts) > tolerance:
        return False
    expected = webhook_sign([secret], msg_id, ts, body).split(",", 1)[1]
    return any(sig.startswith("v1,") and hmac.compare_digest(sig[3:], expected) for sig in signature_header.split())


# ---------- passkeys (P1) ----------
_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def activation_code() -> str:
    """10 Crockford base32 characters (50 bits), shown as XXXX-XXXX-XX."""
    raw = "".join(_CROCKFORD[b % 32] for b in os.urandom(10))
    return f"{raw[:4]}-{raw[4:8]}-{raw[8:]}"


def activation_code_hash(code: str) -> str:
    """Keyed hash (HMAC, k_activation): a leaked table can't be brute-forced offline. Tolerates case, dashes, spaces
    and the Crockford look-alikes (I/L -> 1, O -> 0)."""
    norm = re.sub(r"[\s-]", "", code or "").upper().translate(str.maketrans("ILO", "110"))
    return hmac.new(_key("k_activation"), norm.encode(), hashlib.sha256).hexdigest()


def consent_terms_hash(terms: dict) -> str:
    return hashlib.sha256(jcs(terms)).hexdigest()


def consent_challenge(terms_hash: str) -> bytes:
    """WebAuthn challenge that commits to the consent terms: SHA-256(SHA-256(JCS(terms)) || 32 random bytes)."""
    return hashlib.sha256(bytes.fromhex(terms_hash) + os.urandom(32)).digest()


def random_challenge() -> bytes:
    return os.urandom(32)
