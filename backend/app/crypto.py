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
_SYMMETRIC = ("k_enc", "k_apaar_bi", "k_dob_bi", "k_name_bi")  # separate keys (PRD §8 rule 2)
_keys: dict | None = None


def _load() -> dict:
    global _keys
    if _keys is None:
        if KEY_FILE.exists():
            _keys = json.loads(KEY_FILE.read_text())
        else:
            _keys = {k: os.urandom(32).hex() for k in _SYMMETRIC}
            _keys["signing"] = {}
            _save()
    return _keys


def _save() -> None:
    KEY_FILE.write_text(json.dumps(_keys, indent=1))


def _key(name: str) -> bytes:
    keys = _load()
    if name not in keys:  # e.g. 'k_jwt', 'k_otp' added after first run
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


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()
