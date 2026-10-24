"""Postgres connections.

- Admin (owner/superuser) URL: DATABASE_URL from the environment or backend/.env. Used only for
  schema, seed, reset and tests' assertions.
- App connections run as APP_DB_ROLE (non-owner, NOSUPERUSER NOBYPASSRLS) so RLS applies.
  Its password is APP_DB_PASSWORD (generated into backend/.env on first use).
"""
import os
import re
import secrets
from pathlib import Path
from urllib.parse import quote

import psycopg
from psycopg import sql
from psycopg.rows import dict_row

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
DB_NAME = os.environ.get("APAAR_DB", "apaar")  # app database; the .env URL may point at 'postgres'
APP_ROLE = "app_user"


def _env(name: str) -> str | None:
    if os.environ.get(name):
        return os.environ[name]
    if ENV_FILE.exists():
        m = re.search(rf"^{name}=(.+)$", ENV_FILE.read_text(), re.M)
        return m.group(1).strip() if m else None
    return None


def database_url() -> str:
    # A transaction pooler (Neon's DATABASE_URL) would drop the per-connection RLS settings app_connect() makes:
    # always use the direct connection when the platform provides one.
    url = _env("DATABASE_URL_UNPOOLED") or _env("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL not set (env or backend/.env)")
    # Tolerate unencoded '@' ':' etc. in the password: host part starts after the LAST '@'.
    m = re.fullmatch(r"(postgres(?:ql)?://)([^:]+):(.*)@([^@]+)", url)
    if m and "%" not in m.group(3):
        url = f"{m.group(1)}{m.group(2)}:{quote(m.group(3), safe='')}@{m.group(4)}"
    return url


def app_password() -> str:
    pw = _env("APP_DB_PASSWORD")
    if not pw:
        pw = secrets.token_urlsafe(24)
        with open(ENV_FILE, "a", encoding="utf-8") as f:
            f.write(f"\n# generated: password for the non-owner app role '{APP_ROLE}'\nAPP_DB_PASSWORD={pw}\n")
    return pw


def connect(dbname: str = DB_NAME, autocommit: bool = False) -> psycopg.Connection:
    """Admin connection (bypasses RLS). Never use for request handling."""
    return psycopg.connect(database_url(), dbname=dbname, row_factory=dict_row, connect_timeout=5, autocommit=autocommit)


def app_connect(user: dict | None, dbname: str = DB_NAME) -> psycopg.Connection:
    """Request connection as the non-owner app role, with RLS settings for this caller.
    ponytail: settings are session-level because each request gets its own connection;
    switch to SET LOCAL per transaction if a pool is added."""
    conn = psycopg.connect(database_url(), dbname=dbname, user=APP_ROLE, password=app_password(),
                           row_factory=dict_row, connect_timeout=5)
    u = user or {}
    for key, val in (("app.role", u.get("role")), ("app.institution_id", u.get("institution_id")),
                     ("app.user_id", u.get("id")), ("app.student_id", u.get("student_id")),
                     ("app.issuer_did", u.get("issuer_did")), ("app.scope", u.get("scope")), ("app.code_id", u.get("code_id"))):
        conn.execute("SELECT set_config(%s, %s, false)", (key, "" if val is None else str(val)))
    conn.commit()
    return conn


def create_database(name: str = DB_NAME) -> bool:
    with connect("postgres", autocommit=True) as c:
        if c.execute("select 1 from pg_database where datname = %s", (name,)).fetchone():
            return False
        c.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
        return True


def ensure_app_role() -> None:
    with connect("postgres", autocommit=True) as c:
        exists = c.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (APP_ROLE,)).fetchone()
        verb = "ALTER" if exists else "CREATE"
        c.execute(sql.SQL(verb + " ROLE {} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD {}").format(
            sql.Identifier(APP_ROLE), sql.Literal(app_password())))


def load_schema(name: str = DB_NAME) -> None:
    ensure_app_role()
    here = Path(__file__).parent
    with connect(name) as c:
        c.execute((here / "schema.sql").read_text())
        c.execute((here / "rls.sql").read_text())
