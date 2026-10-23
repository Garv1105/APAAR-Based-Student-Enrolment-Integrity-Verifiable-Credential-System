"""W3C vc-di-eddsa official eddsa-jcs-2022 test vectors (tests/vectors/eddsa-jcs-2022/, see SOURCE.txt).
The implementation must reproduce every intermediate value byte for byte."""
import hashlib
import json
from pathlib import Path

from app import crypto

V = Path(__file__).resolve().parent / "vectors/eddsa-jcs-2022"


def j(name):
    return json.loads((V / name).read_text(encoding="utf-8"))


def t(name):
    return (V / name).read_text(encoding="utf-8").strip()


def test_keypair_decodes_to_matching_ed25519_keys():
    kp = j("keyPair.json")
    priv = crypto.private_from_multikey(kp["privateKeyMultibase"])
    assert crypto.public_multikey(priv) == kp["publicKeyMultibase"]


def test_canonical_forms_and_hashes_match():
    unsigned, cfg = j("unsigned.json"), j("proofConfigJCS.json")
    assert crypto.jcs(unsigned).decode() == t("canonDocJCS.txt")
    assert crypto.jcs(cfg).decode() == t("proofCanonJCS.txt")
    assert hashlib.sha256(crypto.jcs(unsigned)).hexdigest() == t("docHashJCS.txt")
    assert hashlib.sha256(crypto.jcs(cfg)).hexdigest() == t("proofHashJCS.txt")
    assert crypto._jcs_hash_data(unsigned, cfg).hex() == t("combinedHashJCS.txt")


def test_signature_and_signed_document_match_byte_for_byte():
    kp, unsigned = j("keyPair.json"), j("unsigned.json")
    priv = crypto.private_from_multikey(kp["privateKeyMultibase"])
    opts = {k: v for k, v in j("proofConfigJCS.json").items() if k != "@context"}  # @context comes from the document
    signed = crypto.eddsa_jcs_2022_sign(unsigned, opts, priv)
    assert crypto.from_multibase_b58(signed["proof"]["proofValue"]).hex() == t("sigHexJCS.txt")
    assert signed["proof"]["proofValue"] == t("sigBTC58JCS.txt")
    assert crypto.jcs(signed) == crypto.jcs(j("signedJCS.json"))


def test_verify_official_signed_document_and_reject_tampering():
    pub = crypto.public_from_multikey(j("keyPair.json")["publicKeyMultibase"])
    signed = j("signedJCS.json")
    assert crypto.eddsa_jcs_2022_verify(signed, pub)
    tampered = json.loads(json.dumps(signed))
    tampered["credentialSubject"]["alumniOf"] = "The School of Forgery"
    assert not crypto.eddsa_jcs_2022_verify(tampered, pub)
    bad_ctx = json.loads(json.dumps(signed))
    bad_ctx["@context"] = bad_ctx["@context"][:1]
    assert not crypto.eddsa_jcs_2022_verify(bad_ctx, pub)
    other = crypto.signing_key("someone-else").public_key()
    assert not crypto.eddsa_jcs_2022_verify(signed, other)
