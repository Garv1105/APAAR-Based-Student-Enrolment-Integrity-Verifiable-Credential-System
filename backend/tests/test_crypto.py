"""Standards test vectors for the primitives we rely on, plus our own wrappers."""
import hashlib
import hmac

import rfc8785
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app import crypto

H = bytes.fromhex


def test_ed25519_rfc8032_test1_and_test2():
    vectors = [  # RFC 8032 §7.1 TEST 1, TEST 2
        ("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
         "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a", "",
         "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b"),
        ("4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb",
         "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c", "72",
         "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00"),
    ]
    for sk, pk, msg, sig in vectors:
        priv = Ed25519PrivateKey.from_private_bytes(H(sk))
        assert priv.public_key().public_bytes_raw() == H(pk)
        assert priv.sign(H(msg)) == H(sig)
        priv.public_key().verify(H(sig), H(msg))


def test_hmac_sha256_rfc4231_cases_1_and_2():
    assert hmac.new(b"\x0b" * 20, b"Hi There", hashlib.sha256).hexdigest() == \
        "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
    assert hmac.new(b"Jefe", b"what do ya want for nothing?", hashlib.sha256).hexdigest() == \
        "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"


def test_aes256_gcm_mcgrew_viega_cases_13_and_14():
    k, iv = bytes(32), bytes(12)
    assert AESGCM(k).encrypt(iv, b"", None) == H("530f8afbc74536b9a963b4f1c4cb738b")
    assert AESGCM(k).encrypt(iv, bytes(16), None) == \
        H("cea7403d4d606b6e074ec5d3baf39d18" "d0d1c8a799996bf0265b98b5d48ab919")


def test_jcs_rfc8785_section_3_2_2_example():
    src = ('{"numbers":[333333333.33333329,1E30,4.50,2e-3,0.000000000000000000000000001],'
           '"string":"\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/",'
           '"literals":[null,true,false]}')
    import json
    expected = ('{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],'
                '"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}')
    assert rfc8785.dumps(json.loads(src)).decode() == expected


def test_field_encryption_roundtrip_and_column_binding():
    blob = crypto.encrypt("name", "Asha R")
    assert crypto.decrypt("name", blob) == "Asha R"
    assert b"Asha" not in blob
    try:
        crypto.decrypt("dob", blob)
        raise AssertionError("ciphertext moved to another column must not decrypt")
    except Exception as e:
        assert type(e).__name__ == "InvalidTag"


def test_blind_indexes_are_deterministic_and_key_separated():
    assert crypto.apaar_bi("100000000042") == crypto.apaar_bi("100000000042")
    assert crypto.apaar_bi("100000000042") != crypto.apaar_bi("100000000043")
    assert 0 <= crypto.dob_bucket("2007-05-01") < 65536
    assert crypto.name_phonetic("Mr. ASHA  Rao") == crypto.name_phonetic("asha rao")


def test_normalise_name():
    assert crypto.normalise_name("  Smt. Ásha   R. ") == "asha r"
    assert crypto.normalise_name("Dr.Ravi-Kumar") == "ravi kumar"


def test_multikey_roundtrip():
    priv = crypto.signing_key("test-issuer")
    pub = crypto.public_from_multikey(crypto.public_multikey(priv))
    pub.verify(priv.sign(b"x"), b"x")
