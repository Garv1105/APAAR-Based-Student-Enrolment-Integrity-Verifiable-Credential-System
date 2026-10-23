import os
import sys
import tempfile
from pathlib import Path

import pytest

# Tests use a throwaway key file and a separate database so they never touch demo data.
os.environ.setdefault("APAAR_KEY_FILE", str(Path(tempfile.mkdtemp()) / "keys.json"))
os.environ.setdefault("APAAR_DB", "apaar_test")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


@pytest.fixture(scope="session")
def _test_db():
    from app import db
    db.create_database()
    with db.connect() as c:  # schema may have changed: rebuild
        c.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public")
    db.load_schema()


@pytest.fixture
def client(_test_db):
    from fastapi.testclient import TestClient

    from app import auth, db, seed
    from app.main import app
    auth._failures.clear()  # the sign-in throttle is process-wide; start each test clean
    with db.connect() as c:
        seed.reset(c)
        seed.seed(c)
    with TestClient(app) as tc:
        yield tc


@pytest.fixture
def dbconn(_test_db):
    from app import db
    with db.connect() as c:
        yield c


def login(client, user_id):
    r = client.post("/v1/auth/login", json={"user_id": user_id, "password": "demo"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def dob_of(apaar):
    """Date of birth uploaded for an APAAR in the synthetic files (what the MOCK student sign-in checks)."""
    import csv
    syn = Path(__file__).resolve().parent.parent / "data/synthetic"
    return next(r["dob"] for f in sorted(syn.glob("*.csv")) for r in csv.DictReader(open(f, encoding="utf-8"))
                if r["apaar_id"] == apaar)


def student_headers(client, apaar):
    r = client.post("/v1/auth/student-login", json={"apaar_id": apaar, "dob": dob_of(apaar)})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
