"""D1 Seat Ledger: hash-chained enrolment events + AICTE-signed head checkpoints (PRD §19 D1).
Not a blockchain: append-only hashes, one signer.

entry_hash   = SHA256(prev_hash | seq | institution_id | event_type | entity_id | payload_hash | ts)
payload_hash = SHA256(JCS(enrolment state after the event))
verify() checks the chain, the latest checkpoint signature, and that every enrolment row
matches the payload of its latest ledger event (catches silent edits, inserts and deletes).
"""
from datetime import datetime, timezone

from . import crypto

GENESIS = "0" * 64
SIGNER = "aicte-ledger"


def enrolment_state(e: dict) -> dict:
    return {"enrolment_id": e["id"], "student_id": e["student_id"], "programme_id": e["programme_id"],
            "academic_year": e["academic_year"], "status": e["status"], "seat_category_code": e["seat_category_code"],
            "year_of_study": e["year_of_study"], "ended_on": e["ended_on"].isoformat() if e["ended_on"] else None}


def _state_hash(e: dict) -> str:
    return crypto.sha256_hex(crypto.jcs(enrolment_state(e)))


def _entry_hash(prev, seq, inst, event, entity, payload_hash, ts):
    return crypto.sha256_hex(f"{prev}|{seq}|{inst}|{event}|{entity}|{payload_hash}|{ts}".encode())


def append(conn, institution_id: str, event_type: str, enrolment: dict) -> None:
    # ponytail: one global advisory lock serialises ledger writes; shard per institution if throughput matters
    conn.execute("SELECT pg_advisory_xact_lock(42)")
    last = conn.execute("SELECT seq, entry_hash FROM ledger_entries ORDER BY seq DESC LIMIT 1").fetchone()
    seq = (last["seq"] + 1) if last else 1
    prev = last["entry_hash"] if last else GENESIS
    ts = datetime.now(timezone.utc).isoformat()
    ph = _state_hash(enrolment)
    conn.execute("INSERT INTO ledger_entries (seq, institution_id, event_type, entity_id, payload_hash, prev_hash, entry_hash, ts) "
                 "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                 (seq, institution_id, event_type, enrolment["id"], ph, prev,
                  _entry_hash(prev, seq, institution_id, event_type, enrolment["id"], ph, ts), ts))


def checkpoint(conn) -> dict | None:
    last = conn.execute("SELECT seq, entry_hash FROM ledger_entries ORDER BY seq DESC LIMIT 1").fetchone()
    if not last:
        return None
    sig = crypto.signing_key(SIGNER).sign(f"{last['seq']}|{last['entry_hash']}".encode())
    return conn.execute("INSERT INTO ledger_checkpoints (upto_seq, root_hash, aicte_sig) VALUES (%s,%s,%s) RETURNING *",
                        (last["seq"], last["entry_hash"], crypto.multibase_b58(sig))).fetchone()


def verify(conn) -> dict:
    problems, prev, latest = [], GENESIS, {}
    rows = conn.execute("SELECT * FROM ledger_entries ORDER BY seq").fetchall()
    for i, r in enumerate(rows, start=1):
        ts = r["ts"].astimezone(timezone.utc).isoformat()
        if r["seq"] != i:
            problems.append(f"gap or reorder at seq {r['seq']}")
        if r["prev_hash"] != prev or r["entry_hash"] != _entry_hash(prev, r["seq"], r["institution_id"], r["event_type"],
                                                                     r["entity_id"], r["payload_hash"], ts):
            problems.append(f"hash mismatch at seq {r['seq']}")
        prev = r["entry_hash"]
        latest[r["entity_id"]] = r["payload_hash"]

    checkpoint_ok = True
    cp = conn.execute("SELECT * FROM ledger_checkpoints ORDER BY id DESC LIMIT 1").fetchone()
    if cp:
        try:
            crypto.signing_key(SIGNER).public_key().verify(crypto.from_multibase_b58(cp["aicte_sig"]),
                                                           f"{cp['upto_seq']}|{cp['root_hash']}".encode())
        except Exception:
            checkpoint_ok = False
            problems.append("checkpoint signature invalid")
        if not (0 < cp["upto_seq"] <= len(rows) and rows[cp["upto_seq"] - 1]["entry_hash"] == cp["root_hash"]):
            checkpoint_ok = False
            problems.append(f"checkpoint {cp['id']} no longer matches the chain")

    live = {e["id"]: _state_hash(e) for e in conn.execute("SELECT * FROM enrolments").fetchall()}
    for eid in latest.keys() - live.keys():
        problems.append(f"enrolment {eid} was deleted outside the ledger")
    for eid, h in live.items():
        if latest.get(eid) != h:
            problems.append(f"enrolment {eid} differs from its last ledger event")
    return {"ok": not problems, "entries": len(rows), "checkpoint_ok": checkpoint_ok, "problems": problems[:20]}
