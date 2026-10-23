"""W3C Verifiable Credentials 2.0 (PRD §11): trust registry (D4), Bitstring Status List, issuance, verification.

Signing/verification primitives (eddsa-jcs-2022) live in crypto.py and match the official W3C test vectors.
DIDs are did:web style identifiers on a MOCK demo host; keys are generated locally (prototype only).
"""
import base64
import gzip
import json
import os
import uuid
import zlib
from datetime import date, datetime, timedelta, timezone

from psycopg.types.json import Jsonb

from . import crypto

PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
VC_CONTEXT = ["https://www.w3.org/ns/credentials/v2"]
STATUS_LIST_BITS = 131_072        # W3C Bitstring Status List minimum length (16KB uncompressed)
AICTE_REGISTRY_DID = "did:web:registry.aicte-demo.in"   # signs registry snapshots (MOCK trust anchor)
AICTE_REGISTRY_KEY = "aicte-registry"
STUDENT_CREDENTIAL_TYPES = {"EnrolmentCredential", "DegreeCredential", "VerificationCredential"}
PUBLISHED_TTL = timedelta(hours=24)  # status lists / registry snapshots: offline verifiers must refresh after this


class CredentialError(Exception):
    def __init__(self, status: int, detail: str):
        self.status, self.detail = status, detail


def now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_iso(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def inst_did(host: str, institution_id: str) -> str:
    return f"did:web:{host}:inst:{institution_id}"


def did_path(did: str) -> str:
    """did:web:host:inst:X -> inst/X (the path its did.json is served from)."""
    return "/".join(did.split(":")[3:])


# ---------- trust registry (seeded by the admin role) ----------
def seed_trust_registry(conn, cfg: dict) -> None:
    names = {r["id"]: r["name"] for r in conn.execute("SELECT id, name FROM institutions")}
    entries = [(inst_did(cfg["host"], i["institution_id"]), "institution", i["institution_id"], names[i["institution_id"]],
                i["valid_from"], i["valid_until"]) for i in cfg["institutions"]]
    entries += [(u["did"], "university", None, u["name"], u["valid_from"], u["valid_until"]) for u in cfg["universities"]]
    for did, kind, inst_id, name, vfrom, vuntil in entries:
        vm = {"id": f"{did}#key-1", "type": "Multikey", "controller": did,
              "publicKeyMultibase": crypto.public_multikey(crypto.signing_key(did)), "status": "active"}
        conn.execute("INSERT INTO issuer_registry (did, kind, institution_id, name, public_keys_json, status, valid_from, valid_until) "
                     "VALUES (%s,%s,%s,%s,%s,'active',%s,%s)", (did, kind, inst_id, name, Jsonb([vm]), vfrom, vuntil))
        slug = did_path(did).replace("/", "-")
        for purpose in ("revocation", "suspension"):
            conn.execute("INSERT INTO status_lists (id, issuer_did, purpose, bits) VALUES (%s,%s,%s,%s)",
                         (f"{slug}-{purpose}", did, purpose, bytes(STATUS_LIST_BITS // 8)))
    for u in cfg["universities"]:
        for inst_id in u["affiliated"]:
            conn.execute("INSERT INTO affiliations VALUES (%s,%s)", (u["did"], inst_id))


def did_document(conn, did: str) -> dict | None:
    r = conn.execute("SELECT * FROM issuer_registry WHERE did=%s", (did,)).fetchone()
    if r is None:
        return None
    vms = [{k: v for k, v in vm.items() if k != "status"} for vm in r["public_keys_json"] if vm["status"] == "active"]
    return {"@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/multikey/v1"], "id": did,
            "verificationMethod": vms, "assertionMethod": [vm["id"] for vm in vms]}


def registry_entry(r: dict) -> dict:
    return {"did": r["did"], "kind": r["kind"], "name": r["name"], "status": r["status"],
            "validFrom": iso(r["valid_from"]), "validUntil": iso(r["valid_until"]) if r["valid_until"] else None,
            "verificationMethod": r["public_keys_json"], "source": "mock"}


def registry_snapshot(conn) -> dict:
    """AICTE-signed snapshot of all issuers, for verifiers that cache the registry offline."""
    doc = {"@context": VC_CONTEXT, "type": ["VerifiableCredential", "TrustedIssuerRegistrySnapshot"],
           "issuer": AICTE_REGISTRY_DID, "validFrom": iso(now_utc()), "validUntil": iso(now_utc() + PUBLISHED_TTL),
           "credentialSubject": {"issuers": [registry_entry(r) for r in conn.execute("SELECT * FROM issuer_registry ORDER BY did")]}}
    key = crypto.signing_key(AICTE_REGISTRY_KEY)
    return crypto.eddsa_jcs_2022_sign(doc, _proof_options(f"{AICTE_REGISTRY_DID}#key-1"), key)


def registry_public_key() -> str:
    return crypto.public_multikey(crypto.signing_key(AICTE_REGISTRY_KEY))


# ---------- Bitstring Status List ----------
def encode_list(bits: bytes) -> str:
    """Multibase base64url (no padding) of the GZIP-compressed bitstring (W3C Bitstring Status List §2.1)."""
    return "u" + base64.urlsafe_b64encode(gzip.compress(bytes(bits), mtime=0)).rstrip(b"=").decode()


def decode_list(encoded: str) -> bytes:
    if not encoded.startswith("u"):
        raise ValueError("encodedList must be multibase base64url ('u' prefix)")
    s = encoded[1:]
    return gzip.decompress(base64.urlsafe_b64decode(s + "=" * (-len(s) % 4)))


def bit_is_set(bits: bytes, index: int) -> bool:
    """Index 0 is the left-most bit of the first byte."""
    return bool(bits[index // 8] & (0x80 >> (index % 8)))


def status_list_url(list_id: str) -> str:
    return f"{PUBLIC_BASE_URL}/status/{list_id}"


def status_list_credential(conn, list_id: str) -> dict | None:
    sl = conn.execute("SELECT * FROM status_lists WHERE id=%s", (list_id,)).fetchone()
    if sl is None:
        return None
    url = status_list_url(list_id)
    doc = {"@context": VC_CONTEXT, "id": url, "type": ["VerifiableCredential", "BitstringStatusListCredential"],
           "issuer": sl["issuer_did"], "validFrom": iso(now_utc()), "validUntil": iso(now_utc() + PUBLISHED_TTL),
           "credentialSubject": {"id": f"{url}#list", "type": "BitstringStatusList", "statusPurpose": sl["purpose"],
                                 "encodedList": encode_list(sl["bits"])}}
    return crypto.eddsa_jcs_2022_sign(doc, _proof_options(f"{sl['issuer_did']}#key-1"), crypto.signing_key(sl["issuer_did"]))


def _status_entries(revocation_list_id: str, index: int) -> list[dict]:
    out = []
    for purpose in ("revocation", "suspension"):
        lid = revocation_list_id.removesuffix("-revocation") + f"-{purpose}"
        out.append({"id": f"{status_list_url(lid)}#{index}", "type": "BitstringStatusListEntry", "statusPurpose": purpose,
                    "statusListIndex": str(index), "statusListCredential": status_list_url(lid)})
    return out


# ---------- issuance ----------
def _proof_options(vm: str) -> dict:
    return {"type": "DataIntegrityProof", "cryptosuite": "eddsa-jcs-2022", "created": iso(now_utc()),
            "verificationMethod": vm, "proofPurpose": "assertionMethod"}


def _issuer(conn, did: str) -> dict:
    r = conn.execute("SELECT * FROM issuer_registry WHERE did=%s", (did,)).fetchone()
    now = now_utc()
    if r is None or r["status"] != "active" or r["valid_from"] > now or (r["valid_until"] and r["valid_until"] < now):
        raise CredentialError(409, "Issuer is not currently trusted in the AICTE registry (MOCK)")
    return r


def year_end(code: str) -> datetime:
    """'2026-27' -> 2027-07-31T23:59:59Z (end of the academic year)."""
    return datetime(int(code[:4]) + 1, 7, 31, 23, 59, 59, tzinfo=timezone.utc)


def subject_details(conn, enrolment: dict) -> dict:
    s = conn.execute("SELECT * FROM students WHERE id=%s", (enrolment["student_id"],)).fetchone()
    p = conn.execute("SELECT p.name, i.name institution, i.id institution_id FROM programmes p JOIN institutions i ON i.id=p.institution_id "
                     "WHERE p.id=%s", (enrolment["programme_id"],)).fetchone()
    d = {"name": crypto.decrypt("students", "name", s["id"], s["name_enc"]), "studentId": enrolment["institution_student_id"],
         "programme": p["name"], "institution": p["institution"], "academicYear": enrolment["academic_year"],
         "status": enrolment["status"].upper()}
    if s["apaar_enc"] is not None:
        d["apaarId"] = crypto.decrypt("students", "apaar", s["id"], s["apaar_enc"])
    else:
        d["provisionalId"] = s["provisional_id"]
    return d | {"_institution_id": p["institution_id"], "_student_id": s["id"]}


def sign_and_store(conn, *, issuer_did: str, issuer_name: str, vc_type: str, subject: dict, student_id: int,
                   valid_until: datetime | None, enrolment_id: int | None = None, consent_id: int | None = None,
                   idempotency_key: str | None = None, request_hash: str | None = None) -> dict:
    alloc = conn.execute("SELECT * FROM allocate_status_index(%s)", (issuer_did,)).fetchone()
    cred_id = f"urn:uuid:{uuid.uuid4()}"
    vc = {"@context": VC_CONTEXT, "id": cred_id, "type": ["VerifiableCredential", vc_type],
          "issuer": {"id": issuer_did, "name": issuer_name}, "validFrom": iso(now_utc()),
          "credentialSubject": subject, "credentialStatus": _status_entries(alloc["list_id"], alloc["idx"])}
    if valid_until:
        vc["validUntil"] = iso(valid_until)
    signed = crypto.eddsa_jcs_2022_sign(vc, _proof_options(f"{issuer_did}#key-1"), crypto.signing_key(issuer_did))
    conn.execute("INSERT INTO credentials (id, type, enrolment_id, consent_id, subject_student_id, issuer_did, status_list_id, "
                 "status_index, vc_enc, vc_hash, idempotency_key, request_hash) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                 (cred_id, vc_type, enrolment_id, consent_id, student_id, issuer_did, alloc["list_id"], alloc["idx"],
                  crypto.encrypt("credentials", "vc", cred_id, json.dumps(signed)), vc_hash(signed), idempotency_key, request_hash))
    return signed


def vc_hash(vc: dict) -> str:
    return crypto.sha256_hex(crypto.jcs(vc))


def issue(conn, user: dict, enrolment_id: int, vc_type: str, idempotency_key: str | None = None) -> tuple[dict, bool]:
    """Returns (credential, replayed). A repeated Idempotency-Key for the same enrolment + type returns the original."""
    req_hash = crypto.sha256_hex(f"{enrolment_id}|{vc_type}".encode())
    if idempotency_key:
        prev = conn.execute("SELECT * FROM credentials WHERE idempotency_key=%s", (idempotency_key,)).fetchone()  # RLS: own issuer
        if prev is not None:
            if prev["request_hash"] != req_hash:
                raise CredentialError(422, "Idempotency-Key was already used for a different credential request")
            return stored_credential(conn, prev), True
    e = conn.execute("SELECT * FROM enrolments WHERE id=%s", (enrolment_id,)).fetchone()  # RLS: own / affiliated only
    if e is None:
        raise CredentialError(404, "Enrolment not found")
    if e["status"] not in ("active", "completed"):
        raise CredentialError(409, f"Enrolment is {e['status']}; credentials are issued only for active or completed enrolments")
    d = subject_details(conn, e)
    inst = conn.execute("SELECT status FROM institutions WHERE id=%s", (d["_institution_id"],)).fetchone()
    if vc_type == "EnrolmentCredential":
        if user["role"] != "institution_admin":
            raise CredentialError(403, "Only the institution issues enrolment credentials")
        if inst["status"] != "approved":
            raise CredentialError(409, "Institution is not approved this year")
        issuer = _issuer(conn, conn.execute("SELECT did FROM issuer_registry WHERE institution_id=%s", (d["_institution_id"],)).fetchone()["did"])
        subject = {k: v for k, v in d.items() if not k.startswith("_")}
        subject["seatType"] = "SUPERNUMERARY" if e["is_supernumerary"] else "WITHIN_INTAKE"
        valid_until = year_end(e["academic_year"])
    elif vc_type == "DegreeCredential":
        if user["role"] != "university_registrar":
            raise CredentialError(403, "Only the degree-awarding university issues degree credentials")
        if e["status"] != "completed":
            raise CredentialError(409, "A degree is awarded only for a completed enrolment (the institution marks it completed first)")
        issuer = _issuer(conn, user["issuer_did"])
        # Req 10: APAAR ID and student ID are both carried (and printed on the certificate)
        subject = {k: v for k, v in d.items() if not k.startswith("_") and k not in ("status",)}
        subject |= {"degree": d["programme"], "awardedOn": date.today().isoformat()}
        valid_until = None  # degrees don't expire; revocation is via the status list
    else:
        raise CredentialError(422, "Unknown credential type")
    return sign_and_store(conn, issuer_did=issuer["did"], issuer_name=issuer["name"], vc_type=vc_type, subject=subject,
                          student_id=d["_student_id"], valid_until=valid_until, enrolment_id=enrolment_id,
                          idempotency_key=idempotency_key, request_hash=req_hash), False


def stored_credential(conn, row: dict) -> dict:
    return json.loads(crypto.decrypt("credentials", "vc", row["id"], row["vc_enc"]))


def credential_status(conn, row: dict) -> dict:
    lists = {r["purpose"]: r["bits"] for r in conn.execute("SELECT purpose, bits FROM status_lists WHERE issuer_did=%s", (row["issuer_did"],))}
    return {p: bit_is_set(lists[p], row["status_index"]) for p in ("revocation", "suspension")}


# ---------- verification (PRD §11.6) ----------
def verify(conn, vc: dict, at: datetime | None = None) -> dict:
    at = at or now_utc()
    checks = {"well_formed": False, "issuer_trusted": False, "signature_valid": False,
              "within_validity": False, "not_revoked": False, "not_suspended": False}
    out = {"result": "MALFORMED", "checks": checks, "issuer_name": None, "subject": None}
    try:
        issuer_did = vc["issuer"]["id"] if isinstance(vc["issuer"], dict) else vc["issuer"]
        vm_id = vc["proof"]["verificationMethod"]
        valid_from = parse_iso(vc["validFrom"])
        valid_until = parse_iso(vc["validUntil"]) if vc.get("validUntil") else None
        entries = vc.get("credentialStatus") or []
        entries = entries if isinstance(entries, list) else [entries]
        refs = [(e["statusPurpose"], e["statusListCredential"], int(e["statusListIndex"])) for e in entries]
        if not all(url.startswith(f"{PUBLIC_BASE_URL}/status/") for _, url, _ in refs) or not isinstance(vc["credentialSubject"], dict):
            return out
        # only student credentials, signed for assertion (not status lists, registry snapshots, ...)
        if not set(vc["type"]) & STUDENT_CREDENTIAL_TYPES or vc["proof"].get("proofPurpose") != "assertionMethod":
            return out
    except (KeyError, TypeError, ValueError, AttributeError):
        return out
    checks["well_formed"] = True

    # 1-2. issuer must be in the AICTE registry, the key must be its active key, and it must have been
    #      trusted when the credential was issued (closed institutions keep their earlier credentials valid)
    reg = conn.execute("SELECT * FROM issuer_registry WHERE did=%s", (issuer_did,)).fetchone()
    key = next((k for k in (reg["public_keys_json"] if reg else []) if k["id"] == vm_id and k["status"] == "active"), None)
    if reg is None or key is None or not vm_id.startswith(issuer_did + "#"):
        out["result"] = "UNTRUSTED_ISSUER"
        return out
    checks["issuer_trusted"] = (reg["status"] == "active" and reg["valid_from"] <= valid_from
                                and (reg["valid_until"] is None or valid_from <= reg["valid_until"]))
    # 3. signature
    checks["signature_valid"] = crypto.eddsa_jcs_2022_verify(vc, crypto.public_from_multikey(key["publicKeyMultibase"]))
    # 4. validity period
    checks["within_validity"] = valid_from <= at and (valid_until is None or at <= valid_until)
    # 5. status lists (read live; the same lists are served signed at /status/{id} for offline caching)
    checks["not_revoked"] = checks["not_suspended"] = True
    for purpose, url, index in refs:
        sl = conn.execute("SELECT bits FROM status_lists WHERE id=%s AND issuer_did=%s AND purpose=%s",
                          (url.rsplit("/", 1)[1], issuer_did, purpose)).fetchone()
        if sl is None or index >= len(sl["bits"]) * 8:
            checks["well_formed"] = False
            out["result"] = "MALFORMED"
            return out
        if bit_is_set(sl["bits"], index):
            checks["not_revoked" if purpose == "revocation" else "not_suspended"] = False

    if not checks["issuer_trusted"]:
        out["result"] = "UNTRUSTED_ISSUER"
    elif not checks["signature_valid"]:
        out["result"] = "TAMPERED"
    elif not checks["not_revoked"]:
        out["result"] = "REVOKED"
    elif not checks["not_suspended"]:
        out["result"] = "SUSPENDED"
    elif not checks["within_validity"]:
        out["result"] = "EXPIRED"
    else:
        out["result"] = "VALID"
    if checks["signature_valid"]:  # never show unsigned data next to a registered issuer's name
        out["subject"], out["issuer_name"] = vc["credentialSubject"], reg["name"]
    return out


# ---------- printed-certificate QR (PRD §11.8): "AV1:" + Base45(zlib(VC JSON)) ----------
B45 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:"  # RFC 9285: the QR alphanumeric charset
QR_PREFIX = "AV1:"


def b45encode(data: bytes) -> str:
    out = []
    for i in range(0, len(data) - 1, 2):
        n = data[i] * 256 + data[i + 1]
        n, c = divmod(n, 45)
        e, d = divmod(n, 45)
        out += [B45[c], B45[d], B45[e]]
    if len(data) % 2:
        d, c = divmod(data[-1], 45)
        out += [B45[c], B45[d]]
    return "".join(out)


def b45decode(s: str) -> bytes:
    vals = [B45.index(ch) for ch in s]  # ValueError on characters outside the alphabet
    if len(vals) % 3 == 1:
        raise ValueError("invalid Base45 length")
    out = bytearray()
    for i in range(0, len(vals), 3):
        chunk = vals[i:i + 3]
        n = sum(v * 45 ** k for k, v in enumerate(chunk))
        if len(chunk) == 3:
            if n > 0xFFFF:
                raise ValueError("invalid Base45 triplet")
            out += n.to_bytes(2, "big")
        else:
            if n > 0xFF:
                raise ValueError("invalid Base45 pair")
            out.append(n)
    return bytes(out)


def qr_payload(vc: dict) -> str:
    # separators without spaces keep the QR small; JCS canonicalisation makes the proof independent of formatting
    return QR_PREFIX + b45encode(zlib.compress(json.dumps(vc, separators=(",", ":"), ensure_ascii=False).encode(), 9))


def from_qr_payload(payload: str) -> dict:
    if not payload.startswith(QR_PREFIX):
        raise ValueError("not an AV1 credential QR")
    raw = zlib.decompressobj().decompress(b45decode(payload[len(QR_PREFIX):]), 64 * 1024)  # cap inflated size
    return json.loads(raw)


def qr_svg(payload: str) -> str:
    import qrcode
    import qrcode.image.svg
    img = qrcode.make(payload, image_factory=qrcode.image.svg.SvgPathImage, error_correction=qrcode.constants.ERROR_CORRECT_M,
                      box_size=4, border=2)
    return img.to_string(encoding="unicode")


def forged_credential() -> dict:
    """DEMO: a well-formed credential signed by an issuer that is NOT in the AICTE registry (expected: UNTRUSTED_ISSUER)."""
    did = "did:web:fake-university.example"
    vc = {"@context": VC_CONTEXT, "id": f"urn:uuid:{uuid.uuid4()}", "type": ["VerifiableCredential", "DegreeCredential"],
          "issuer": {"id": did, "name": "Global Open University (unregistered)"}, "validFrom": iso(now_utc()),
          "credentialSubject": {"name": "Demo Holder", "degree": "B.Tech Computer Science", "apaarId": "999999999999",
                                "studentId": "GOU/2026/0001"}}
    return crypto.eddsa_jcs_2022_sign(vc, _proof_options(f"{did}#key-1"), crypto.signing_key(did))
