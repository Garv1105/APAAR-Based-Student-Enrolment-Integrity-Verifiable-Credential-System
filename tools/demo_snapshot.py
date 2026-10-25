"""Save and restore the LOCAL demo database, so a demo can be re-recorded without reloading the 300-college world.

    cd backend
    ..\\.venv\\Scripts\\python.exe ..\\tools\\demo_snapshot.py save       # once, when the data is how each take should start
    ..\\.venv\\Scripts\\python.exe ..\\tools\\demo_snapshot.py restore    # before every re-take (a few seconds)
    ..\\.venv\\Scripts\\python.exe ..\\tools\\demo_snapshot.py status

The snapshot is a full Postgres copy (CREATE DATABASE ... TEMPLATE), so the seat ledger, counters, duplicate cases, audit
rows and passkey activation codes all go back exactly; the ledger still verifies. Refuses any non-local database server.
The running API needs no restart (it opens a connection per request); open browser tabs should sign in again.
"""
import argparse
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from psycopg import errors, sql  # noqa: E402

from app import db  # noqa: E402

SNAP = db.DB_NAME + "_demo_snapshot"


def admin():
    host = urlparse(db.database_url()).hostname or "localhost"
    if host not in ("localhost", "127.0.0.1", "::1"):
        sys.exit(f"Refusing: database server {host} is not local. This tool only resets the laptop's demo database.")
    return db.connect("postgres", autocommit=True)


def exists(c, name: str) -> bool:
    return bool(c.execute("SELECT 1 FROM pg_database WHERE datname = %s", (name,)).fetchone())


def copy(c, src: str, dst: str) -> None:
    """dst := copy of src. A template must have no other sessions: kick them (the API reconnects per request) and retry."""
    if exists(c, dst):
        c.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(dst)))
    for attempt in range(10):
        c.execute("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s AND pid <> pg_backend_pid()", (src,))
        try:
            c.execute(sql.SQL("CREATE DATABASE {} TEMPLATE {}").format(sql.Identifier(dst), sql.Identifier(src)))
            return
        except errors.ObjectInUse:
            time.sleep(0.3)
    sys.exit(f"Could not copy {src}: something keeps reconnecting to it. Stop the API and try again.")


def summary(c, name: str) -> str:
    with db.connect(name) as d:
        one = lambda q: d.execute(q).fetchone()["n"]  # noqa: E731
        return (f"{one('SELECT count(*) n FROM institutions')} colleges, {one('SELECT count(*) n FROM upload_batches')} uploads, "
                f"{one('SELECT count(*) n FROM enrolments')} enrolments, {one('SELECT count(*) n FROM duplicate_cases')} duplicate cases")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("action", choices=["save", "restore", "status"])
    a = ap.parse_args()
    with admin() as c:
        if a.action == "save":
            copy(c, db.DB_NAME, SNAP)
            print(f"Saved {db.DB_NAME} -> {SNAP}: {summary(c, SNAP)}")
        elif a.action == "restore":
            if not exists(c, SNAP):
                sys.exit("No snapshot yet. Run 'save' first.")
            t = time.perf_counter()
            c.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(db.DB_NAME)))
            copy(c, SNAP, db.DB_NAME)
            print(f"Restored {db.DB_NAME} in {time.perf_counter() - t:.1f} s: {summary(c, db.DB_NAME)}")
        else:
            for n in (db.DB_NAME, SNAP):
                print(f"{n}: {summary(c, n) if exists(c, n) else 'missing'}")


if __name__ == "__main__":
    main()
