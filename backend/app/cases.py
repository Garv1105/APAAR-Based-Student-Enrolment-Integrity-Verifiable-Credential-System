from datetime import datetime, timezone

from . import auth, crypto, webhooks
from .ingest import NOTICE, ApiError

OPEN = ("flagged", "under_investigation")


def _visible_ids(conn, case: dict) -> list[int]:
    return [r["id"] for r in conn.execute("SELECT id FROM enrolments WHERE id = ANY(%s) ORDER BY id", (case["enrolment_ids"],))]


def case_out(conn, case: dict, user: dict) -> dict:
    ids = _visible_ids(conn, case)
    regulator = user["role"] in ("aicte_officer", "auditor")
    batch = None if regulator or not ids else conn.execute("SELECT batch_id FROM enrolments WHERE id=%s", (ids[0],)).fetchone()["batch_id"]
    return {"id": case["id"], "status": case["status"], "created_at": case["created_at"], "enrolment_ids": ids,
            "notice": (f"Case #{case['id']}: " + ("possible duplicate (no APAAR; name, date of birth and guardian match)"
                                                  if case.get("kind") == "fuzzy" else "duplicate enrolment across institutions"))
            if regulator else NOTICE.format(batch=batch, case=case["id"]),
            "resolution_note": case["resolution_note"] if regulator else None, "resolved_at": case["resolved_at"]}


def _get(conn, case_id: int) -> dict:
    case = conn.execute("SELECT * FROM duplicate_cases WHERE id=%s", (case_id,)).fetchone()
    if not case:
        raise ApiError(404, "Case not found")
    return case


def list_cases(conn, user: dict, status: str | None = None) -> list[dict]:
    rows = conn.execute("SELECT * FROM duplicate_cases WHERE (%s::text IS NULL OR status=%s) ORDER BY id DESC LIMIT 500",
                        (status, status)).fetchall()
    return [case_out(conn, c, user) for c in rows]


def resolve(conn, user: dict, case_id: int, body: dict, request=None) -> dict:
    case = _get(conn, case_id)
    if case["status"] not in OPEN:
        raise ApiError(409, f"Case is already {case['status']}")
    if body["status"] == "confirmed_duplicate" and body.get("keep_enrolment_id") not in case["enrolment_ids"]:
        raise ApiError(422, "keep_enrolment_id must be one of the case's enrolments")
    final = body["status"] != "under_investigation"
    conn.execute("UPDATE duplicate_cases SET status=%s, resolution_note=%s, resolved_by=%s, resolved_at=%s WHERE id=%s",
                 (body["status"], body["note"], user["id"] if final else None, datetime.now(timezone.utc) if final else None, case_id))
    n = conn.execute("SELECT apply_case_resolution(%s, %s) n", (case_id, body.get("keep_enrolment_id"))).fetchone()["n"]
    if final:
        webhooks.emit_case(conn, "case.resolved", case_id, status=body["status"])
    if body["status"] == "confirmed_duplicate":
        for c in conn.execute(
                "SELECT c.id, c.enrolment_id, p.institution_id FROM credentials c JOIN enrolments e ON e.id = c.enrolment_id "
                "JOIN programmes p ON p.id = e.programme_id WHERE c.enrolment_id = ANY(%s) AND c.enrolment_id <> %s "
                "AND c.type <> 'VerificationCredential'", (case["enrolment_ids"], body["keep_enrolment_id"])).fetchall():
            webhooks.emit(conn, "credential.revoked", c["institution_id"], credential_id=c["id"], enrolment_id=c["enrolment_id"],
                          reason="confirmed_duplicate")
    auth.audit(conn, user, f"case.{body['status']}", "duplicate_case", case_id, student_id=case["student_id"],
               reason=f"{body['note'][:200]} ({n} credential(s) updated)", request=request)
    conn.commit()
    return case_out(conn, _get(conn, case_id), user)


def unmask(conn, user: dict, case_id: int, reason: str, request=None) -> dict:
    case = _get(conn, case_id)
    def person(sid: int) -> dict:
        s = conn.execute("SELECT * FROM students WHERE id=%s", (sid,)).fetchone()
        return {"name": crypto.decrypt("students", "name", s["id"], s["name_enc"]), "apaar_status": s["apaar_status"],
                "apaar_id": crypto.decrypt("students", "apaar", s["id"], s["apaar_enc"]) if s["apaar_enc"] else None}
    detail = [person(e["student_id"]) | {"enrolment_id": e["id"], "institution_id": e["institution_id"], "institution": e["institution"],
                        "programme_id": e["programme_id"], "institution_student_id": e["institution_student_id"],
                        "status": e["status"], "admission_date": e["admission_date"].isoformat(), "batch_id": e["batch_id"]}
              for e in conn.execute(
                  "SELECT e.*, p.institution_id, i.name institution FROM enrolments e JOIN programmes p ON p.id=e.programme_id "
                  "JOIN institutions i ON i.id=p.institution_id WHERE e.id = ANY(%s) ORDER BY e.id", (case["enrolment_ids"],))]
    auth.audit(conn, user, "case.unmask", "duplicate_case", case_id, student_id=case["student_id"], reason=reason, request=request)
    conn.commit()
    return case_out(conn, case, user) | {"detail": detail}
