import json
import os
from datetime import date, datetime, timedelta, timezone

import psycopg
from fastapi import HTTPException
from webauthn import (generate_authentication_options, generate_registration_options, options_to_json,
                      verify_authentication_response, verify_registration_response)
from webauthn.helpers import base64url_to_bytes
from webauthn.helpers.structs import (AuthenticatorSelectionCriteria, PublicKeyCredentialDescriptor, ResidentKeyRequirement,
                                      UserVerificationRequirement)

from . import auth, crypto, db

COOLDOWN = timedelta(hours=24)
ADULT_AGE = 18
RP_NAME = "APAAR Student Data Platform (prototype)"
REGISTER_FAILED = ("Passkey registration failed. Your activation code has already been used: try again within the setup "
                   "session, or ask your institution for a new code.")
today = date.today


def demo_mode() -> bool:
    return (db._env("DEMO_MODE") or "").lower() == "true"


def first_cooldown_hours() -> int:
    raw = db._env("PASSKEY_FIRST_COOLDOWN_HOURS")
    try:
        return max(0, int(raw)) if raw not in (None, "") else 24
    except ValueError:
        return 24


def rp_id() -> str:
    return db._env("WEBAUTHN_RP_ID") or "localhost"


def origins() -> list[str]:
    return [o.strip() for o in (db._env("WEBAUTHN_ORIGINS") or "http://localhost:5173").split(",") if o.strip()]


def _json(opts) -> dict:
    return json.loads(options_to_json(opts))


def _client_challenge(credential: dict) -> bytes:
    try:
        client_data = json.loads(base64url_to_bytes(credential["response"]["clientDataJSON"]))
        return base64url_to_bytes(client_data["challenge"])
    except Exception:
        raise HTTPException(400, "Malformed passkey response") from None


def _credential_id(credential: dict) -> bytes:
    try:
        return base64url_to_bytes(credential["rawId"])
    except Exception:
        raise HTTPException(400, "Malformed passkey response") from None


def age_on(dob: date, on: date) -> int:
    return on.year - dob.year - ((on.month, on.day) < (dob.month, dob.day))


def is_minor(conn, student_id: int) -> bool:
    s = conn.execute("SELECT id, dob_enc FROM students WHERE id=%s", (student_id,)).fetchone()
    if s is None:
        raise HTTPException(404, "Student not found")
    return age_on(date.fromisoformat(crypto.decrypt("students", "dob", s["id"], s["dob_enc"])), today()) < ADULT_AGE


def _label(conn, user: dict) -> str:
    s = conn.execute("SELECT apaar_masked FROM students WHERE id=%s", (user["student_id"],)).fetchone()
    who = f"student {s['apaar_masked']}" if s and s["apaar_masked"] else "student"
    return f"Guardian of {who}" if user["role"] == "guardian" else who.capitalize()


def issue_code(conn, user: dict, enrolment_id: int, kind: str, reason: str, idem_key: str | None, request_hash: str) -> dict:
    e = conn.execute("SELECT student_id FROM enrolments WHERE id=%s", (enrolment_id,)).fetchone()
    if e is None:
        raise HTTPException(404, "Enrolment not found")
    if kind == "guardian" and not is_minor(conn, e["student_id"]):
        raise HTTPException(422, "Guardian codes are only for students under 18")
    code = crypto.activation_code()
    try:
        r = conn.execute("SELECT * FROM issue_activation_code(%s, %s, %s, %s, %s)",
                         (enrolment_id, kind, crypto.activation_code_hash(code), idem_key, request_hash)).fetchone()
    except psycopg.Error as err:
        conn.rollback()
        if err.sqlstate == "P0002":
            raise HTTPException(404, "Enrolment not found (or not active)") from None
        if err.sqlstate == "P0004":
            raise HTTPException(409, "Activation codes can't be issued for this record while it is under AICTE review") from None
        if err.sqlstate == "P0003":
            raise HTTPException(422, "Idempotency-Key was already used with a different request body") from None
        raise
    if r["replay"]:
        return {"status": "already_issued", "code": None, "kind": kind, "expires_at": r["expires_at"], "revoked_passkeys": 0,
                "reissue": r["reissue"], "cooldown_hours": max(24 if r["reissue"] else 0, first_cooldown_hours()),
                "detail": "Code already issued; issue a new one if lost."}
    auth.audit(conn, user, "activation_code.issue", "activation_code", r["code_id"], student_id=r["student_id"],
               reason=f"{kind} code: {reason}" + (f" (revoked {r['revoked']} passkey(s))" if r["revoked"] else "")
               + (" [reissue: 24 h consent cooldown]" if r["reissue"] else ""))
    conn.commit()
    return {"status": "issued", "code": code, "kind": kind, "expires_at": r["expires_at"], "revoked_passkeys": r["revoked"],
            "reissue": r["reissue"], "cooldown_hours": max(24 if r["reissue"] else 0, first_cooldown_hours()), "detail": None}


def activate(conn, apaar_id: str, code: str, client_ip: str = "unknown") -> dict:
    auth.throttle("actip:" + client_ip, 20, 15 * 60)
    apaar = apaar_id.replace(" ", "").replace("-", "")
    fail = HTTPException(401, "APAAR ID and activation code don't match, or the code has expired or was already used")
    if not (apaar.isdigit() and len(apaar) == 12):
        raise fail
    key = "act:" + crypto.apaar_bi(apaar)
    auth.throttle(key, 5, 15 * 60)
    r = conn.execute("SELECT * FROM redeem_activation_code(%s, %s)", (crypto.apaar_bi(apaar), crypto.activation_code_hash(code))).fetchone()
    conn.commit()
    if r is None:
        raise fail
    auth.clear_throttle(key)
    label = f"{'Guardian of student' if r['kind'] == 'guardian' else 'Student'} {crypto.mask_apaar(apaar)}"
    tok = auth.issue_token(f"{r['kind']}:{r['student_id']}", r["kind"], label, student_id=r["student_id"], scope="passkey_setup",
                           reissue=r["reissue"], code_id=r["code_id"], ttl=auth.SETUP_TTL)
    return {"setup_token": tok["access_token"], "kind": r["kind"], "reissue": r["reissue"],
            "expires_in": int(auth.SETUP_TTL.total_seconds())}


def register_options(conn, user: dict) -> dict:
    existing = conn.execute("SELECT credential_id FROM passkeys WHERE revoked_at IS NULL").fetchall()
    ch = crypto.random_challenge()
    conn.execute("SELECT store_challenge(%s, 'register', NULL, NULL)", (ch,))
    conn.commit()
    label = _label(conn, user)
    return _json(generate_registration_options(
        rp_id=rp_id(), rp_name=RP_NAME, user_name=label, user_display_name=label, user_id=os.urandom(16), challenge=ch,
        authenticator_selection=AuthenticatorSelectionCriteria(resident_key=ResidentKeyRequirement.REQUIRED,
                                                               user_verification=UserVerificationRequirement.REQUIRED),
        exclude_credentials=[PublicKeyCredentialDescriptor(id=bytes(r["credential_id"])) for r in existing]))


def register_verify(conn, user: dict, credential: dict) -> dict:
    ch = _client_challenge(credential)
    if conn.execute("SELECT * FROM take_challenge(%s, 'register')", (ch,)).fetchone() is None:
        conn.commit()
        raise HTTPException(400, REGISTER_FAILED)
    conn.commit()
    try:
        v = verify_registration_response(credential=credential, expected_challenge=ch, expected_rp_id=rp_id(),
                                         expected_origin=origins(), require_user_verification=True)
    except Exception:
        raise HTTPException(400, REGISTER_FAILED) from None
    transports = credential.get("response", {}).get("transports")
    try:
        k = conn.execute("SELECT * FROM register_passkey(%s, %s, %s, %s, %s)",
                         (v.credential_id, v.credential_public_key, v.sign_count,
                          [str(t) for t in transports] if isinstance(transports, list) else None, first_cooldown_hours())).fetchone()
    except psycopg.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(409, "This passkey is already registered") from None
    except psycopg.Error as err:
        conn.rollback()
        if err.sqlstate == "P0005":
            raise HTTPException(409, "This activation code already registered a passkey; ask your institution for a new code") from None
        raise
    auth.audit(conn, user, "passkey.register", "passkey", k["id"], student_id=user["student_id"],
               reason=f"{user['role']} passkey" + (" from a reissued code" if user["reissue"] else "")
               + (f"; consent approval from {k['approve_after'].isoformat(timespec='minutes')}"
                  if k["approve_after"] > datetime.now(timezone.utc) else ""))
    conn.commit()
    return passkey_out(k)


def passkey_out(k: dict) -> dict:
    return {"id": k["id"], "kind": k["kind"], "created_at": k["created_at"], "last_used_at": k["last_used_at"],
            "approve_after": k["approve_after"], "revoked": k["revoked_at"] is not None}


def login_options(conn, client_ip: str) -> dict:
    auth.throttle("ip:" + client_ip, 30, 60)
    ch = crypto.random_challenge()
    conn.execute("SELECT store_challenge(%s, 'login', NULL, NULL)", (ch,))
    conn.commit()
    return _json(generate_authentication_options(rp_id=rp_id(), challenge=ch, user_verification=UserVerificationRequirement.REQUIRED))


def login_verify(conn, credential: dict) -> dict:
    fail = HTTPException(401, "Passkey sign-in failed")
    ch = _client_challenge(credential)
    taken = conn.execute("SELECT * FROM take_challenge(%s, 'login')", (ch,)).fetchone()
    conn.commit()
    if taken is None:
        raise fail
    k = conn.execute("SELECT * FROM passkey_for_login(%s)", (_credential_id(credential),)).fetchone()
    if k is None:
        raise fail
    try:
        v = verify_authentication_response(credential=credential, expected_challenge=ch, expected_rp_id=rp_id(),
                                           expected_origin=origins(), credential_public_key=bytes(k["public_key"]),
                                           credential_current_sign_count=k["sign_count"], require_user_verification=True)
    except Exception:
        raise fail from None
    user = {"id": f"{k['kind']}:{k['student_id']}", "role": k["kind"], "student_id": k["student_id"]}
    with db.app_connect(user) as c2:
        if k["kind"] == "guardian" and not is_minor(c2, k["student_id"]):
            raise HTTPException(401, "Guardian access ended: the student is 18 or over and signs in with their own passkey")
        c2.execute("UPDATE passkeys SET sign_count=%s, last_used_at=now() WHERE id=%s", (v.new_sign_count, k["id"]))
        auth.audit(c2, user, "passkey.sign_in", "passkey", k["id"], student_id=k["student_id"])
        c2.commit()
        label = _label(c2, user)
    return auth.issue_token(user["id"], k["kind"], label, student_id=k["student_id"])


def consent_terms(k: dict) -> dict:
    return {"consentId": k["id"], "requester": k["requester_id"], "purpose": k["purpose"], "fields": list(k["scope_fields"]),
            "expiresAt": k["expires_at"].astimezone(timezone.utc).isoformat()}


def consent_options(conn, k: dict) -> dict:
    keys = conn.execute("SELECT credential_id FROM passkeys WHERE revoked_at IS NULL").fetchall()
    if not keys:
        raise HTTPException(409, "No passkey registered. Ask your institution for an activation code.")
    th = crypto.consent_terms_hash(consent_terms(k))
    ch = crypto.consent_challenge(th)
    conn.execute("SELECT store_challenge(%s, 'consent', %s, %s)", (ch, k["id"], th))
    conn.commit()
    return _json(generate_authentication_options(
        rp_id=rp_id(), challenge=ch, user_verification=UserVerificationRequirement.REQUIRED,
        allow_credentials=[PublicKeyCredentialDescriptor(id=bytes(r["credential_id"])) for r in keys]))


def verify_consent_assertion(conn, user: dict, k: dict, credential: dict) -> dict:
    auth.throttle(f"apr:{user['student_id']}", 10, 15 * 60)
    ch = _client_challenge(credential)
    t = conn.execute("SELECT * FROM take_challenge(%s, 'consent')", (ch,)).fetchone()
    conn.commit()
    if t is None:
        raise HTTPException(400, "Passkey challenge is invalid, expired or already used; start the approval again")
    if t["consent_id"] != k["id"] or t["terms_hash"] != crypto.consent_terms_hash(consent_terms(k)):
        raise HTTPException(403, "This passkey approval was made for a different request")
    pk = conn.execute("SELECT * FROM passkeys WHERE credential_id=%s AND revoked_at IS NULL", (_credential_id(credential),)).fetchone()
    if pk is None:
        raise HTTPException(403, "Passkey not recognised for this account")
    if pk["approve_after"] > datetime.now(timezone.utc):
        raise HTTPException(403, f"New passkey from a reissued code: consent approval unlocks at {pk['approve_after'].isoformat()}")
    try:
        v = verify_authentication_response(credential=credential, expected_challenge=ch, expected_rp_id=rp_id(),
                                           expected_origin=origins(), credential_public_key=bytes(pk["public_key"]),
                                           credential_current_sign_count=pk["sign_count"], require_user_verification=True)
    except Exception:
        raise HTTPException(401, "Passkey verification failed") from None
    conn.execute("UPDATE passkeys SET sign_count=%s, last_used_at=now() WHERE id=%s", (v.new_sign_count, pk["id"]))
    return pk


def cooldown_until(conn) -> datetime | None:
    r = conn.execute("SELECT max(approve_after) t FROM passkeys WHERE revoked_at IS NULL AND approve_after > now()").fetchone()
    return r["t"]
