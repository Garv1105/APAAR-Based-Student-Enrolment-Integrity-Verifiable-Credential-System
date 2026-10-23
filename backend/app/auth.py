"""JWT auth, role guard, audit log (PRD §6, §13). Identity provider is MOCK (seeded users)."""
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from . import crypto

TOKEN_TTL = timedelta(hours=8)
_bearer = HTTPBearer(auto_error=False)


def login(conn, user_id: str, password: str) -> dict | None:
    u = conn.execute("SELECT * FROM login_lookup(%s)", (user_id,)).fetchone()  # users table itself is not granted
    if not u:
        return None
    try:
        PasswordHasher().verify(u["password_hash"], password)
    except VerifyMismatchError:
        return None
    return issue_token(u["id"], u["role"], u["display_name"], institution_id=u["institution_id"],
                       student_id=u["student_id"], issuer_did=u["issuer_did"])


def issue_token(sub: str, role: str, display_name: str, *, institution_id=None, student_id=None, issuer_did=None) -> dict:
    now = datetime.now(timezone.utc)
    claims = {"sub": sub, "role": role, "inst": institution_id, "stu": student_id, "idid": issuer_did, "name": display_name,
              "iat": now, "exp": now + TOKEN_TTL}
    return {"access_token": jwt.encode(claims, crypto.secret("k_jwt"), algorithm="HS256"),
            "role": role, "institution_id": institution_id, "display_name": display_name}


def student_login(conn, apaar_id: str, otp: str) -> dict | None:
    """MOCK student sign-in: APAAR ID + fixed demo OTP. Production would use APAAR/DigiLocker authentication."""
    from .mocks import MOCK_OTP
    if otp != MOCK_OTP or not (apaar_id.isdigit() and len(apaar_id) == 12):
        return None
    sid = conn.execute("SELECT student_id_for_login(%s) id", (crypto.apaar_bi(apaar_id),)).fetchone()["id"]
    if sid is None:
        return None
    return issue_token(f"student:{sid}", "student", f"Student ({crypto.mask_apaar(apaar_id)})", student_id=sid)


def current_user(cred: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    if cred is None:
        raise HTTPException(401, "Missing bearer token")
    try:
        c = jwt.decode(cred.credentials, crypto.secret("k_jwt"), algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    return {"id": c["sub"], "role": c["role"], "institution_id": c["inst"], "student_id": c["stu"], "issuer_did": c.get("idid"),
            "name": c.get("name") or c["sub"]}


def optional_user(cred: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict | None:
    """Caller identity for the RLS settings; None for anonymous or invalid tokens
    (protected routes still reject those through require())."""
    try:
        return current_user(cred)
    except HTTPException:
        return None


def require(*roles: str):
    def dep(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(403, f"Role '{user['role']}' cannot do this")
        return user
    return dep


def audit(conn, user: dict, action: str, entity: str, entity_id=None, *, student_id=None, reason=None, request: Request | None = None):
    conn.execute("INSERT INTO audit_logs (actor, role, action, entity, entity_id, student_id, reason, request_id) "
                 "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                 (user["id"], user["role"], action, entity, None if entity_id is None else str(entity_id), student_id, reason,
                  request.state.request_id if request is not None else None))
