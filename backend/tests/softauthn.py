"""Software WebAuthn authenticator for tests: ES256 key, 'none' attestation, configurable UV flag and sign counter.
step=0 behaves like a synced passkey (sign count stays 0)."""
import base64
import hashlib
import json
import os
import struct

import cbor2
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec

ORIGIN, RP_ID = "http://localhost:5173", "localhost"


def b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


class SoftAuthenticator:
    def __init__(self, step: int = 1, origin: str = ORIGIN, rp_id: str = RP_ID):
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.cred_id = os.urandom(16)
        self.count, self.step, self.origin, self.rp_id = 0, step, origin, rp_id

    def _cose(self) -> bytes:
        n = self.key.public_key().public_numbers()
        return cbor2.dumps({1: 2, 3: -7, -1: 1, -2: n.x.to_bytes(32, "big"), -3: n.y.to_bytes(32, "big")})

    def _client(self, typ: str, challenge: str) -> bytes:
        return json.dumps({"type": typ, "challenge": challenge, "origin": self.origin, "crossOrigin": False}).encode()

    def _id(self) -> dict:
        return {"id": b64u(self.cred_id), "rawId": b64u(self.cred_id), "type": "public-key", "clientExtensionResults": {}}

    def register(self, options: dict, uv: bool = True) -> dict:
        cd = self._client("webauthn.create", options["challenge"])
        flags = 0x01 | 0x40 | (0x04 if uv else 0)
        auth = (hashlib.sha256(self.rp_id.encode()).digest() + bytes([flags]) + struct.pack(">I", 0) + b"\0" * 16
                + struct.pack(">H", len(self.cred_id)) + self.cred_id + self._cose())
        att = cbor2.dumps({"fmt": "none", "attStmt": {}, "authData": auth})
        return self._id() | {"response": {"clientDataJSON": b64u(cd), "attestationObject": b64u(att), "transports": ["internal"]}}

    def assertion(self, options: dict, uv: bool = True, count: int | None = None) -> dict:
        if count is None:
            self.count += self.step
            count = self.count
        cd = self._client("webauthn.get", options["challenge"])
        auth = hashlib.sha256(self.rp_id.encode()).digest() + bytes([0x01 | (0x04 if uv else 0)]) + struct.pack(">I", count)
        sig = self.key.sign(auth + hashlib.sha256(cd).digest(), ec.ECDSA(hashes.SHA256()))
        return self._id() | {"response": {"clientDataJSON": b64u(cd), "authenticatorData": b64u(auth), "signature": b64u(sig),
                                          "userHandle": None}}
