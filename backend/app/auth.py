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
    u = conn.execute("select * from users where id = %s", (user_id,)).fetchone()
    if not u:
        return None
    try:
        PasswordHasher().verify(u["password_hash"], password)
    except VerifyMismatchError:
        return None
    now = datetime.now(timezone.utc)
    claims = {"sub": u["id"], "role": u["role"], "inst": u["institution_id"], "stu": u["student_id"],
              "iat": now, "exp": now + TOKEN_TTL}
    return {"access_token": jwt.encode(claims, crypto.secret("k_jwt"), algorithm="HS256"),
            "role": u["role"], "institution_id": u["institution_id"], "display_name": u["display_name"]}


def current_user(cred: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    if cred is None:
        raise HTTPException(401, "Missing bearer token")
    try:
        c = jwt.decode(cred.credentials, crypto.secret("k_jwt"), algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    return {"id": c["sub"], "role": c["role"], "institution_id": c["inst"], "student_id": c["stu"]}


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
