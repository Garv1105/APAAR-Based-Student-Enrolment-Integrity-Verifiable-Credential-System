"""JWT auth, role guard, audit log (PRD §6, §13). Identity provider is MOCK (seeded users)."""
import hmac
import threading
import time
from collections import defaultdict, deque
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


LOGIN_MAX_FAILURES, LOGIN_WINDOW = 5, 15 * 60
_failures: dict[str, deque] = defaultdict(deque)   # apaar blind index -> failure timestamps
_failures_lock = threading.Lock()


class LoginThrottled(Exception):
    pass


def _throttled(key: str, now: float) -> bool:
    q = _failures[key]
    while q and q[0] < now - LOGIN_WINDOW:
        q.popleft()
    return len(q) >= LOGIN_MAX_FAILURES


def student_login(conn, apaar_id: str, dob: str) -> dict | None:
    """MOCK student sign-in: APAAR ID + date of birth. Production would use APAAR/DigiLocker authentication.
    The same None is returned for an unknown APAAR and a wrong DOB; repeated failures lock the APAAR out.
    ponytail: in-process throttle; use a shared store (Redis / table) if the API runs as several processes."""
    if not (apaar_id.isdigit() and len(apaar_id) == 12):
        return None
    key, now = crypto.apaar_bi(apaar_id), time.monotonic()
    with _failures_lock:
        if _throttled(key, now):
            raise LoginThrottled()
    row = conn.execute("SELECT * FROM student_login_lookup(%s)", (key,)).fetchone()
    stored = crypto.decrypt("students", "dob", row["id"], row["dob_enc"]) if row else "0000-00-00"
    if row is None or not hmac.compare_digest(stored.encode(), dob.strip().encode()):
        with _failures_lock:
            _failures[key].append(now)
        return None
    with _failures_lock:
        _failures.pop(key, None)
    return issue_token(f"student:{row['id']}", "student", f"Student ({crypto.mask_apaar(apaar_id)})", student_id=row["id"])


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
