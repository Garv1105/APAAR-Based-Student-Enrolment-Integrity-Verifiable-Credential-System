import hmac
import threading
import time
from collections import deque
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
    u = conn.execute("SELECT * FROM login_lookup(%s)", (user_id,)).fetchone()
    if not u or not u["password_hash"]:
        PasswordHasher().hash(password)
        return None
    try:
        PasswordHasher().verify(u["password_hash"], password)
    except VerifyMismatchError:
        return None
    return issue_token(u["id"], u["role"], u["display_name"], institution_id=u["institution_id"],
                       student_id=u["student_id"], issuer_did=u["issuer_did"])


def issue_token(sub: str, role: str, display_name: str, *, institution_id=None, student_id=None, issuer_did=None,
                scope: str | None = None, reissue: bool = False, code_id: int | None = None, ttl: timedelta = TOKEN_TTL) -> dict:
    now = datetime.now(timezone.utc)
    claims = {"sub": sub, "role": role, "inst": institution_id, "stu": student_id, "idid": issuer_did, "name": display_name,
              "iat": now, "exp": now + ttl}
    if scope:
        claims |= {"scp": scope, "rei": bool(reissue), "cid": code_id}
    return {"access_token": jwt.encode(claims, crypto.secret("k_jwt"), algorithm="HS256"),
            "role": role, "institution_id": institution_id, "display_name": display_name}


LOGIN_MAX_FAILURES, LOGIN_WINDOW, LOGIN_MAX_KEYS = 5, 15 * 60, 100_000
SETUP_TTL = timedelta(minutes=15)
SETUP_EXPIRED = ("Your passkey setup session has expired. The activation code was already used, so ask your institution "
                 "for a new code.")
_failures: dict[str, deque] = {}
_failures_lock = threading.Lock()
_DUMMY_DOB = None


class LoginThrottled(Exception):
    pass


def _reserve_attempt(key: str, now: float, max_n: int = LOGIN_MAX_FAILURES, window: float = LOGIN_WINDOW) -> None:
    with _failures_lock:
        q = _failures.get(key)
        if q is not None:
            while q and q[0] < now - window:
                q.popleft()
            if len(q) >= max_n:
                raise LoginThrottled()
        else:
            if len(_failures) >= LOGIN_MAX_KEYS:
                _failures.pop(next(iter(_failures)))
            q = _failures[key] = deque()
        q.append(now)


def student_login(conn, apaar_id: str, dob: str) -> dict | None:
    global _DUMMY_DOB
    if not (apaar_id.isdigit() and len(apaar_id) == 12):
        return None
    key = crypto.apaar_bi(apaar_id)
    _reserve_attempt(key, time.monotonic())
    row = conn.execute("SELECT * FROM student_login_lookup(%s)", (key,)).fetchone()
    if row is None:
        _DUMMY_DOB = _DUMMY_DOB or crypto.encrypt("students", "dob", 0, "0000-00-00")
        stored = crypto.decrypt("students", "dob", 0, _DUMMY_DOB)
    else:
        stored = crypto.decrypt("students", "dob", row["id"], row["dob_enc"])
    if row is None or not hmac.compare_digest(stored.encode(), dob.strip().encode()):
        return None
    with _failures_lock:
        _failures.pop(key, None)
    return issue_token(f"student:{row['id']}", "student", f"Student ({crypto.mask_apaar(apaar_id)})", student_id=row["id"])


def throttle(key: str, max_n: int, window: float) -> None:
    _reserve_attempt(key, time.monotonic(), max_n, window)


def clear_throttle(key: str) -> None:
    with _failures_lock:
        _failures.pop(key, None)


def current_user(cred: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    if cred is None:
        raise HTTPException(401, "Missing bearer token")
    try:
        c = jwt.decode(cred.credentials, crypto.secret("k_jwt"), algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        try:
            c = jwt.decode(cred.credentials, crypto.secret("k_jwt"), algorithms=["HS256"], options={"verify_exp": False})
        except jwt.PyJWTError:
            raise HTTPException(401, "Invalid or expired token")
        raise HTTPException(401, SETUP_EXPIRED if c.get("scp") == "passkey_setup" else "Invalid or expired token")
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    return {"id": c["sub"], "role": c["role"], "institution_id": c["inst"], "student_id": c["stu"], "issuer_did": c.get("idid"),
            "name": c.get("name") or c["sub"], "scope": c.get("scp"), "reissue": bool(c.get("rei")), "code_id": c.get("cid")}


def optional_user(cred: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict | None:
    try:
        return current_user(cred)
    except HTTPException:
        return None


def require(*roles: str):
    def dep(user: dict = Depends(current_user)) -> dict:
        if user["scope"]:
            raise HTTPException(403, "This session can only register a passkey")
        if user["role"] not in roles:
            raise HTTPException(403, f"Role '{user['role']}' cannot do this")
        return user
    return dep


def require_setup(user: dict = Depends(current_user)) -> dict:
    if user["scope"] != "passkey_setup":
        raise HTTPException(403, "Passkey registration needs a setup session from an activation code")
    return user


def audit(conn, user: dict, action: str, entity: str, entity_id=None, *, student_id=None, reason=None, request: Request | None = None):
    conn.execute("INSERT INTO audit_logs (actor, role, action, entity, entity_id, student_id, reason, request_id) "
                 "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                 (user["id"], user["role"], action, entity, None if entity_id is None else str(entity_id), student_id, reason,
                  request.state.request_id if request is not None else None))
