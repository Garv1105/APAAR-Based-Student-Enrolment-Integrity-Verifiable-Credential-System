"""Postgres connection. DATABASE_URL comes from the environment or backend/.env."""
import os
import re
from pathlib import Path
from urllib.parse import quote

import psycopg
from psycopg.rows import dict_row

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url and ENV_FILE.exists():
        m = re.search(r"^DATABASE_URL=(.+)$", ENV_FILE.read_text(), re.M)
        url = m and m.group(1).strip()
    if not url:
        raise RuntimeError("DATABASE_URL not set (env or backend/.env)")
    # Tolerate unencoded '@' ':' etc. in the password: host part starts after the LAST '@'.
    m = re.fullmatch(r"(postgres(?:ql)?://)([^:]+):(.*)@([^@]+)", url)
    if m and "%" not in m.group(3):
        url = f"{m.group(1)}{m.group(2)}:{quote(m.group(3), safe='')}@{m.group(4)}"
    return url


DB_NAME = os.environ.get("APAAR_DB", "apaar")  # app database; the .env URL may point at 'postgres'


def connect(dbname: str = DB_NAME, autocommit: bool = False) -> psycopg.Connection:
    return psycopg.connect(database_url(), dbname=dbname, row_factory=dict_row, connect_timeout=5, autocommit=autocommit)


def create_database(name: str = DB_NAME) -> bool:
    with connect("postgres", autocommit=True) as c:
        if c.execute("select 1 from pg_database where datname = %s", (name,)).fetchone():
            return False
        c.execute(f'CREATE DATABASE "{name}"')
        return True


def load_schema(name: str = DB_NAME) -> None:
    with connect(name) as c:
        c.execute((Path(__file__).parent / "schema.sql").read_text())
