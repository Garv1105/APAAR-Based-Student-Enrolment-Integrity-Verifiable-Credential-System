import json
import os
import sys
from pathlib import Path

from argon2 import PasswordHasher
from psycopg.types.json import Jsonb

from . import credentials, db
from .validation import caps_for

SEED = Path(__file__).resolve().parent.parent / "data/seed/registry.json"
DEMO_PASSWORD = "demo"


def world_seed_dir() -> Path | None:
    d = os.environ.get("WORLD_DIR")
    return Path(d) / "seed" if d else None


def load_registry() -> dict:
    s = json.loads(SEED.read_text())
    if (d := world_seed_dir()) is None:
        return s
    w = json.loads((d / "registry.json").read_text())
    for k, v in w.items():
        if isinstance(v, list):
            s[k] = s.get(k, []) + [x for x in v if x not in s.get(k, [])]
    s["trust_registry"]["institutions"] += w.get("trust_registry", {}).get("institutions", [])
    return s


def reset(conn) -> None:
    tables = [r["tablename"] for r in conn.execute("select tablename from pg_tables where schemaname='public'")]
    conn.execute("TRUNCATE " + ", ".join(f'"{t}"' for t in tables) + " RESTART IDENTITY CASCADE")


def seed(conn, s: dict | None = None) -> None:
    s = s or load_registry()
    for y in s["academic_years"]:
        conn.execute("INSERT INTO academic_years VALUES (%s,%s,%s,%s)", (y["code"], y["window_start"], y["window_end"], y["deadline"]))
    for i in s["institutions"]:
        conn.execute("INSERT INTO institutions VALUES (%s,%s,%s,%s)", (i["id"], i["name"], i["state"], i["status"]))
    for p in s["programmes"]:
        conn.execute("INSERT INTO programmes VALUES (%s,%s,%s,%s,%s,%s)",
                     (f"{p['institution_id']}:{p['code']}", p["institution_id"], p["code"], p["name"], p["level"], p["duration_years"]))
    cats = {}
    for c in s["seat_categories"]:
        cats[c["code"]] = c
        conn.execute("INSERT INTO seat_categories VALUES (%s,%s,%s,%s)", (c["code"], c["scope"], Jsonb(c["cap_rule_json"]), c["handbook_ref"]))
    for a in s["approved_intake"]:
        conn.execute("INSERT INTO approved_intake VALUES (%s,%s,%s,%s)", (a["programme"], a["academic_year"], a["approved_intake"], a["source_eoa_ref"]))
        for key, cap in caps_for(a["approved_intake"], cats).items():
            conn.execute("INSERT INTO programme_category_counters VALUES (%s,%s,%s,0,%s)", (a["programme"], a["academic_year"], key, cap))
    for h in s["intake_history"]:
        conn.execute("INSERT INTO intake_history VALUES (%s,%s,%s,%s,%s)",
                     (h["programme"], h["academic_year"], h["approved"], h["filled"], h.get("foreign_filled")))
    credentials.seed_trust_registry(conn, s["trust_registry"])
    pw = PasswordHasher().hash(DEMO_PASSWORD)
    for u in s["users"]:
        conn.execute("INSERT INTO users (id, role, institution_id, issuer_did, display_name, password_hash) VALUES (%s,%s,%s,%s,%s,%s)",
                     (u["id"], u["role"], u.get("institution_id"), u.get("issuer_did"), u["display_name"], pw))


def main(name: str = db.DB_NAME) -> None:
    db.create_database(name)
    if "--reset" in sys.argv:
        with db.connect(name) as conn:
            conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public")
    db.load_schema(name)
    with db.connect(name) as conn:
        if "--reset" in sys.argv or not conn.execute("select 1 from institutions limit 1").fetchone():
            reset(conn)
            seed(conn)
            print(f"seeded {name}")
        else:
            print(f"{name} already seeded (use --reset)")


if __name__ == "__main__":
    main()
