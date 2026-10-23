"""Consent service (PRD §13, Req 8) and consent-scoped VerificationCredentials (D5, Req 5).

A verifier requests specific fields for a purpose; the student (or the guardian, if the student is
under 18) approves with a passkey assertion bound to that request (P1; MOCK OTP only in DEMO_MODE); the platform
signs the consent artifact and mints a short-lived
VerificationCredential holding only the approved fields, issued by the student's institution.
Revoking the consent revokes that credential through the status list.
"""
from datetime import datetime, timezone

import psycopg

from . import credentials, crypto, passkeys
from .credentials import CredentialError
from .mocks import MOCK_OTP

CONSENT_SIGNER = "aicte-consent"
# request field -> credentialSubject claim (data minimisation: nothing else is ever included)
FIELD_CLAIMS = {"name": "name", "programme": "programme", "institution": "institution", "academic_year": "academicYear",
                "status": "status", "apaar_id": "apaarId", "student_id": "studentId"}


def consent_out(r: dict, credential_id: str | None = None, role: str = "student") -> dict:
    """Never includes student_id, so a verifier can't tell matched from unmatched requests."""
    return {"id": r["id"], "requester": r["requester_name"], "purpose": r["purpose"], "fields": r["scope_fields"],
            "status": effective_status(r),
            # "guardian" would tell a verifier the student is under 18 — an age fact outside the approved scope
            "granted_by": r["granted_by"] if role != "verifier" else None,
            "requested_at": r["requested_at"], "expires_at": r["expires_at"], "credential_id": credential_id}


def effective_status(r: dict) -> str:
    if r["status"] in ("pending", "granted") and r["expires_at"] <= datetime.now(timezone.utc):
        return "expired"
    return r["status"]


def request(conn, user: dict, apaar_id: str, purpose: str, fields: list[str], valid_days: int, request_id: str) -> dict:
    """Same response whether or not the APAAR is registered (no existence oracle). Matching, rate limiting
    (20/hour per verifier) and the audit row all happen inside request_consent()."""
    try:
        return conn.execute("SELECT * FROM request_consent(%s, %s, %s, %s, %s, %s)",
                            (crypto.apaar_bi(apaar_id), purpose, list(fields), valid_days, user["name"], request_id)).fetchone()
    except psycopg.Error as e:  # custom SQLSTATE RL429 arrives as a generic DatabaseError
        conn.rollback()
        if e.sqlstate == "RL429":
            raise CredentialError(429, "Too many consent requests; try again later") from None
        if e.sqlstate == "P0001":  # RAISE EXCEPTION in request_consent: invalid input
            raise CredentialError(422, "Invalid consent request") from None
        raise


def verifier_requests(conn) -> list[dict]:
    return conn.execute("SELECT * FROM my_consent_requests()").fetchall()


def _visible_pending(conn, consent_id: int) -> dict:
    k = conn.execute("SELECT * FROM consents WHERE id=%s", (consent_id,)).fetchone()  # RLS: own inbox (student or guardian)
    if k is None:
        raise CredentialError(404, "Consent request not found")
    if effective_status(k) != "pending":
        raise CredentialError(409, f"Consent request is {effective_status(k)}")
    return k


def _required_kind(conn, user: dict, k: dict) -> str:
    need = "guardian" if passkeys.is_minor(conn, k["student_id"]) else "student"
    if user["role"] != need:
        raise CredentialError(403, "Student is under 18: the guardian approves with the guardian's passkey" if need == "guardian"
                              else "The student is 18 or over and approves with their own passkey")
    return need


def approve_options(conn, user: dict, consent_id: int) -> dict:
    """WebAuthn options whose challenge commits to this request's terms (P1)."""
    k = _visible_pending(conn, consent_id)
    _required_kind(conn, user, k)
    return passkeys.consent_options(conn, k)


def _own_pending(conn, user: dict, consent_id: int) -> dict:
    # RLS: the student's own only; row lock so two concurrent approvals can't both mint a credential
    k = conn.execute("SELECT * FROM consents WHERE id=%s FOR UPDATE", (consent_id,)).fetchone()
    if k is None:
        raise CredentialError(404, "Consent request not found")
    if effective_status(k) != "pending":
        raise CredentialError(409, f"Consent request is {effective_status(k)}")
    return k


def approve(conn, user: dict, consent_id: int, body: dict) -> tuple[dict, dict]:
    """Passkey assertion bound to this request (P1). The MOCK OTP path exists only with DEMO_MODE=true."""
    k0 = _visible_pending(conn, consent_id)
    if body.get("credential") is not None:
        granted_by = _required_kind(conn, user, k0)
        passkeys.verify_consent_assertion(conn, user, k0, body["credential"])
        authentication = f"webauthn-passkey ({granted_by})"
    elif passkeys.demo_mode():
        if user["role"] != "student" or body.get("otp") != MOCK_OTP:
            raise CredentialError(401, "Invalid OTP")
        minor = passkeys.is_minor(conn, k0["student_id"])
        if minor and (body.get("approved_by") != "guardian" or body.get("guardian_otp") != MOCK_OTP):
            raise CredentialError(403, "Student is under 18: a guardian must approve (approved_by=guardian with the guardian's OTP)")
        granted_by = "guardian" if minor else "student"
        # ponytail: DEMO_MODE only; the guardian is self-asserted here (the passkey path has a real guardian key)
        authentication = "MOCK-OTP (DEMO_MODE)" + ("; guardian self-asserted (MOCK)" if minor else "")
    else:
        raise CredentialError(400, "Approve with your passkey (OTP approval exists only in DEMO_MODE)")
    k = _own_pending(conn, user, consent_id)
    if crypto.consent_terms_hash(passkeys.consent_terms(k)) != crypto.consent_terms_hash(passkeys.consent_terms(k0)):
        raise CredentialError(409, "The consent request changed during approval; start again")
    e = conn.execute("SELECT * FROM enrolments WHERE student_id=%s AND status='active' ORDER BY id DESC LIMIT 1",
                     (k["student_id"],)).fetchone()
    if e is None:
        raise CredentialError(409, "No active enrolment to verify")

    granted_at = datetime.now(timezone.utc).replace(microsecond=0)
    artifact = {"consentId": k["id"], "requester": k["requester_id"], "purpose": k["purpose"], "fields": k["scope_fields"],
                "grantedBy": granted_by, "grantedAt": credentials.iso(granted_at), "expiresAt": credentials.iso(k["expires_at"]),
                "authentication": authentication}
    sig = crypto.multibase_b58(crypto.signing_key(CONSENT_SIGNER).sign(crypto.jcs(artifact)))
    k = conn.execute("UPDATE consents SET status='granted', granted_at=%s, granted_by=%s, artifact_sig=%s WHERE id=%s RETURNING *",
                     (granted_at, granted_by, sig, k["id"])).fetchone()

    d = credentials.subject_details(conn, e)
    claims = {}
    for f in k["scope_fields"]:
        if f == "apaar_id" and "apaarId" not in d:   # student without APAAR: the provisional ID stands in
            claims["provisionalId"] = d["provisionalId"]
        else:
            claims[FIELD_CLAIMS[f]] = d[FIELD_CLAIMS[f]]
    claims["consent"] = {"id": k["id"], "purpose": k["purpose"], "verifier": k["requester_name"]}
    reg = conn.execute("SELECT did FROM issuer_registry WHERE institution_id=%s", (d["_institution_id"],)).fetchone()
    if reg is None:
        raise CredentialError(409, "The student's institution is not in the AICTE trust registry (MOCK)")
    issuer = credentials._issuer(conn, reg["did"])  # closed / suspended institutions can't issue new credentials
    vc = credentials.sign_and_store(conn, issuer_did=issuer["did"], issuer_name=issuer["name"], vc_type="VerificationCredential",
                                    subject=claims, student_id=k["student_id"], valid_until=k["expires_at"],
                                    enrolment_id=e["id"], consent_id=k["id"])
    return k, vc


def deny(conn, user: dict, consent_id: int) -> dict:
    k = _own_pending(conn, user, consent_id)
    return conn.execute("UPDATE consents SET status='denied' WHERE id=%s RETURNING *", (k["id"],)).fetchone()


def revoke(conn, user: dict, consent_id: int) -> dict:
    k = conn.execute("SELECT * FROM consents WHERE id=%s", (consent_id,)).fetchone()
    if k is None:
        raise CredentialError(404, "Consent not found")
    if k["status"] != "granted":
        raise CredentialError(409, f"Consent is {k['status']}")
    for c in conn.execute("SELECT id FROM credentials WHERE consent_id=%s", (k["id"],)).fetchall():
        conn.execute("SELECT set_credential_status(%s, 'revocation', true)", (c["id"],))
    return conn.execute("UPDATE consents SET status='revoked', revoked_at=now() WHERE id=%s RETURNING *", (k["id"],)).fetchone()


def verifier_credential(conn, consent_id: int) -> dict:
    """The VerificationCredential for a consent the caller requested. Refuses missing, pending/denied,
    revoked and expired consents (each with its own status code)."""
    r = conn.execute("SELECT * FROM consent_credential(%s)", (consent_id,)).fetchone()
    if r is None:
        raise CredentialError(404, "Consent request not found")
    if r["consent_status"] == "revoked":
        raise CredentialError(403, "The student revoked this consent")
    if r["consent_status"] != "granted":
        raise CredentialError(409, f"Consent is {r['consent_status']}")
    if r["expires_at"] <= datetime.now(timezone.utc):
        raise CredentialError(410, "Consent has expired")
    return {"id": r["credential_id"], "vc": credentials.stored_credential(conn, {"id": r["credential_id"], "vc_enc": r["vc_enc"]})}
