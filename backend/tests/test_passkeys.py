"""P1: passkey consent. DEMO_MODE off; a software authenticator stands in for the browser + device."""
from datetime import date, timedelta

import pytest

from app import auth, passkeys
from conftest import login
from softauthn import ORIGIN, SoftAuthenticator
from test_api import upload

ADULT = "328865551724"      # Asha Joshi, DOB 2006-11-05 (19 in 2026)
ADULT_2 = "277145114059"    # DOB 2007-09-16
TEEN = "692210657021"       # DOB 2008-05-31: 17 on 2026-05-01, 18 on 2026-05-31
REASON = "Student verified in person at the admissions office"


@pytest.fixture
def pk(client, monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "false")
    monkeypatch.setenv("WEBAUTHN_RP_ID", "localhost")
    monkeypatch.setenv("WEBAUTHN_ORIGINS", ORIGIN)
    monkeypatch.setenv("PASSKEY_FIRST_COOLDOWN_HOURS", "0")  # most tests approve right after activation; cooldown tests set it
    upload(client, "inst-a", "A1.csv")
    return client


def enrolment(client, apaar):
    return client.get("/v1/enrolments", params={"apaar": apaar}, headers=login(client, "inst-a")).json()[0]["id"]


def issue(client, apaar, kind="student", key=None, reason=REASON, user="inst-a"):
    h = login(client, user) | ({"Idempotency-Key": key} if key else {})
    return client.post(f"/v1/enrolments/{enrolment(client, apaar)}/activation-code", json={"kind": kind, "reason": reason}, headers=h)


def activate(client, apaar, code):
    return client.post("/v1/auth/activate", json={"apaar_id": apaar, "code": code})


def setup(client, apaar, kind="student"):
    """Institution issues a code; the student (or guardian) activates and registers a passkey. Returns the authenticator."""
    code = issue(client, apaar, kind).json()["code"]
    s = activate(client, apaar, code)
    assert s.status_code == 200, s.text
    h = {"Authorization": f"Bearer {s.json()['setup_token']}"}
    a = SoftAuthenticator()
    opts = client.post("/v1/passkeys/register/options", headers=h).json()
    r = client.post("/v1/passkeys/register/verify", json={"credential": a.register(opts)}, headers=h)
    assert r.status_code == 201, r.text
    return a


def sign_in(client, a, **kw):
    opts = client.post("/v1/auth/passkey/options").json()
    return client.post("/v1/auth/passkey/verify", json={"credential": a.assertion(opts, **kw)})


def session(client, a):
    r = sign_in(client, a)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def request_consent(client, apaar, fields=("name", "programme")):
    r = client.post("/v1/consents/requests", json={"apaar_id": apaar, "purpose": "Pre-employment check", "fields": list(fields)},
                    headers=login(client, "employer"))
    assert r.status_code == 201
    return r.json()["id"]


def approve(client, h, cid, a, opts_for=None, **kw):
    opts = client.post(f"/v1/consents/{opts_for or cid}/approve/options", headers=h)
    assert opts.status_code == 200, opts.text
    return client.post(f"/v1/consents/{cid}/approve", json={"credential": a.assertion(opts.json(), **kw)}, headers=h)


def test_knowing_the_dob_no_longer_gets_you_in(pk, dbconn):
    r = pk.post("/v1/auth/student-login", json={"apaar_id": ADULT, "dob": "2006-11-05"})
    assert r.status_code == 403
    assert pk.get("/v1/auth/config").json()["demo_mode"] is False
    a = setup(pk, ADULT)
    h = session(pk, a)
    cid = request_consent(pk, ADULT)
    r = pk.post(f"/v1/consents/{cid}/approve", json={"otp": "123456"}, headers=h)   # the old MOCK body
    assert r.status_code == 400 and "passkey" in r.json()["title"]


def test_passkey_flow_end_to_end(pk, dbconn):
    a = setup(pk, ADULT)
    h = session(pk, a)
    cid = request_consent(pk, ADULT)
    r = approve(pk, h, cid, a)
    assert r.status_code == 200, r.text
    assert dbconn.execute("SELECT granted_by FROM consents WHERE id=%s", (cid,)).fetchone()["granted_by"] == "student"
    vc = pk.get(f"/v1/consents/{cid}/credential", headers=login(pk, "employer")).json()
    assert pk.post("/v1/verify", json={"credential": vc}, headers=login(pk, "employer")).json()["result"] == "VALID"
    actions = [e["action"] for e in pk.get("/v1/students/me/access-log", headers=h).json()]
    assert {"activation_code.issue", "passkey.register", "passkey.sign_in", "consent.grant"} <= set(actions)


def test_replay_and_sign_counter(pk):
    a = setup(pk, ADULT)
    h = session(pk, a)
    cid = request_consent(pk, ADULT)
    opts = pk.post(f"/v1/consents/{cid}/approve/options", headers=h).json()
    cred = a.assertion(opts)
    assert pk.post(f"/v1/consents/{cid}/approve", json={"credential": cred}, headers=h).status_code == 200
    cid2 = request_consent(pk, ADULT)
    assert pk.post(f"/v1/consents/{cid2}/approve", json={"credential": cred}, headers=h).status_code == 400  # replayed
    # equal or lower non-zero sign count = cloned authenticator
    assert approve(pk, h, cid2, a, count=a.count).status_code == 401
    assert approve(pk, h, cid2, a, count=1).status_code == 401
    assert approve(pk, h, cid2, a).status_code == 200


def test_synced_passkey_with_zero_counter_is_accepted(pk):
    code = issue(pk, ADULT).json()["code"]
    h = {"Authorization": f"Bearer {activate(pk, ADULT, code).json()['setup_token']}"}
    a = SoftAuthenticator(step=0)  # synced passkeys report 0 every time
    opts = pk.post("/v1/passkeys/register/options", headers=h).json()
    assert pk.post("/v1/passkeys/register/verify", json={"credential": a.register(opts)}, headers=h).status_code == 201
    hs = session(pk, a)
    assert sign_in(pk, a).status_code == 200      # 0 -> 0 again
    assert approve(pk, hs, request_consent(pk, ADULT), a).status_code == 200


def test_assertion_is_bound_to_one_request_its_terms_and_its_owner(pk, dbconn):
    a = setup(pk, ADULT)
    h = session(pk, a)
    req_a, req_b = request_consent(pk, ADULT), request_consent(pk, ADULT, ("name",))
    assert approve(pk, h, req_b, a, opts_for=req_a).status_code == 403            # options for A, approving B
    opts = pk.post(f"/v1/consents/{req_a}/approve/options", headers=h).json()
    dbconn.execute("UPDATE consents SET scope_fields = ARRAY['name','programme','apaar_id'] WHERE id=%s", (req_a,))
    dbconn.commit()
    r = pk.post(f"/v1/consents/{req_a}/approve", json={"credential": a.assertion(opts)}, headers=h)
    assert r.status_code == 403                                                  # terms changed after the challenge
    other = setup(pk, ADULT_2)                                                   # another student's passkey
    opts = pk.post(f"/v1/consents/{req_b}/approve/options", headers=h).json()
    assert pk.post(f"/v1/consents/{req_b}/approve", json={"credential": other.assertion(opts)}, headers=h).status_code == 403


def test_user_verification_is_required(pk):
    a = setup(pk, ADULT)
    assert sign_in(pk, a, uv=False).status_code == 401
    h = session(pk, a)
    assert approve(pk, h, request_consent(pk, ADULT), a, uv=False).status_code == 401
    code = issue(pk, ADULT_2).json()["code"]
    hs = {"Authorization": f"Bearer {activate(pk, ADULT_2, code).json()['setup_token']}"}
    opts = pk.post("/v1/passkeys/register/options", headers=hs).json()
    r = pk.post("/v1/passkeys/register/verify", json={"credential": SoftAuthenticator().register(opts, uv=False)}, headers=hs)
    assert r.status_code == 400 and "ask your institution for a new code" in r.json()["title"]


def test_activation_codes_are_single_use_expire_and_are_throttled(pk, dbconn):
    code = issue(pk, ADULT).json()["code"]
    assert activate(pk, ADULT, code.lower().replace("-", " ")).status_code == 200   # forgiving format
    burned = activate(pk, ADULT, code)
    unknown = activate(pk, "999999999999", code)
    assert burned.status_code == unknown.status_code == 401 and burned.json() == unknown.json()
    code2 = issue(pk, ADULT_2).json()["code"]
    dbconn.execute("UPDATE activation_codes SET expires_at = now() - interval '1 second' WHERE used_at IS NULL")
    dbconn.commit()
    assert activate(pk, ADULT_2, code2).status_code == 401                          # expired
    auth._failures.clear()
    for _ in range(5):
        assert activate(pk, ADULT_2, "AAAA-AAAA-AA").status_code == 401
    assert activate(pk, ADULT_2, "AAAA-AAAA-AA").status_code == 429


def test_setup_session_can_only_register_and_explains_expiry(pk):
    code = issue(pk, ADULT).json()["code"]
    h = {"Authorization": f"Bearer {activate(pk, ADULT, code).json()['setup_token']}"}
    assert pk.get("/v1/students/me", headers=h).status_code == 403
    assert pk.get("/v1/consents", headers=h).status_code == 403
    assert pk.post("/v1/consents/1/approve/options", headers=h).status_code == 403
    expired = auth.issue_token("student:1", "student", "x", student_id=1, scope="passkey_setup", ttl=timedelta(seconds=-1))
    r = pk.post("/v1/passkeys/register/options", headers={"Authorization": f"Bearer {expired['access_token']}"})
    assert r.status_code == 401 and "ask your institution for a new code" in r.json()["title"]
    normal = session(pk, setup(pk, ADULT_2))
    assert pk.post("/v1/passkeys/register/options", headers=normal).status_code == 403  # full sessions can't add keys


def test_reissue_revokes_old_keys_and_new_key_waits_24h(pk, dbconn):
    old = setup(pk, ADULT)
    r = issue(pk, ADULT, reason="Student reported phone stolen, ID checked")
    assert r.json()["revoked_passkeys"] == 1 and r.json()["reissue"] and r.json()["cooldown_hours"] == 24
    assert sign_in(pk, old).status_code == 401                                   # lost device is dead
    s = activate(pk, ADULT, r.json()["code"]).json()
    assert s["reissue"] is True
    hs = {"Authorization": f"Bearer {s['setup_token']}"}
    new = SoftAuthenticator()
    opts = pk.post("/v1/passkeys/register/options", headers=hs).json()
    assert pk.post("/v1/passkeys/register/verify", json={"credential": new.register(opts)}, headers=hs).status_code == 201
    h = session(pk, new)                                                         # sign-in works during the cooldown
    me = pk.get("/v1/students/me", headers=h).json()
    assert me["passkey_cooldown_until"] is not None
    cid = request_consent(pk, ADULT)
    r = approve(pk, h, cid, new)
    assert r.status_code == 403 and "unlocks at" in r.json()["title"]
    dbconn.execute("UPDATE passkeys SET approve_after = now() - interval '1 second' WHERE revoked_at IS NULL")
    dbconn.commit()
    assert pk.get("/v1/students/me", headers=h).json()["passkey_cooldown_until"] is None
    assert approve(pk, h, cid, new).status_code == 200
    log = pk.get("/v1/students/me/access-log", headers=h).json()
    assert any(e["action"] == "activation_code.issue" and "phone stolen" in e["reason"] and "revoked 1" in e["reason"] for e in log)
    # two codes in a row can't dodge the cooldown: any code after the first is a reissue
    assert issue(pk, ADULT_2).json()["reissue"] is False
    assert issue(pk, ADULT_2).json()["reissue"] is True
    counts = {c["id"]: c["activation_reissues"] for c in pk.get("/v1/dashboard/aicte", headers=login(pk, "aicte")).json()["upload_compliance"]}
    assert counts["1-0000000001"] == 2


def test_code_is_shown_once_and_never_stored(pk, dbconn):
    first = issue(pk, ADULT, key="code-1").json()
    assert first["status"] == "issued" and first["code"]
    replay = issue(pk, ADULT, key="code-1")
    assert replay.status_code == 200 and replay.json()["status"] == "already_issued" and replay.json()["code"] is None
    assert "issue a new one if lost" in replay.json()["detail"]
    assert issue(pk, ADULT, key="code-1", reason="A different reason entirely").status_code == 422
    plain = first["code"].replace("-", "")
    for table in ("activation_codes", "audit_logs", "webauthn_challenges"):
        for row in dbconn.execute(f"SELECT * FROM {table}"):
            text = str(row)
            assert first["code"] not in text and plain not in text, table
    assert issue(pk, ADULT, reason="short").status_code == 422                     # reason required (min 10 chars)
    assert issue(pk, ADULT, user="inst-b").status_code == 404                     # not B's student


def test_minor_needs_the_guardian_until_18(pk, monkeypatch, dbconn):
    monkeypatch.setattr(passkeys, "today", lambda: date(2026, 5, 1))             # TEEN is 17
    assert issue(pk, ADULT, kind="guardian").status_code == 422                   # adults have no guardian code
    student = setup(pk, TEEN)
    guardian = setup(pk, TEEN, kind="guardian")
    hs, hg = session(pk, student), session(pk, guardian)
    assert pk.get("/v1/students/me", headers=hg).json()["viewer"] == "guardian"
    cid = request_consent(pk, TEEN)
    assert pk.post(f"/v1/consents/{cid}/approve/options", headers=hs).status_code == 403   # minor's own key: no
    assert approve(pk, hg, cid, guardian).status_code == 200
    assert dbconn.execute("SELECT granted_by FROM consents WHERE id=%s", (cid,)).fetchone()["granted_by"] == "guardian"
    monkeypatch.setattr(passkeys, "today", lambda: date(2026, 5, 31))            # 18th birthday
    cid2 = request_consent(pk, TEEN)
    assert pk.post(f"/v1/consents/{cid2}/approve/options", headers=hg).status_code == 403  # guardian no longer
    assert approve(pk, hs, cid2, student).status_code == 200


# ---------- security-review fixes ----------
def test_another_institution_cannot_take_over_a_student(pk):
    """H1: B uploads A's student (E203 doesn't block the row) but can't issue them an activation code."""
    a = setup(pk, ADULT)
    upload(pk, "inst-b", "B1.csv")                          # contains APAAR 590573056992, also active at A
    hb = login(pk, "inst-b")
    eid = pk.get("/v1/enrolments", params={"apaar": "590573056992"}, headers=hb).json()[0]["id"]
    r = pk.post(f"/v1/enrolments/{eid}/activation-code", json={"kind": "student", "reason": REASON}, headers=hb)
    assert r.status_code == 409 and "under AICTE review" in r.json()["title"]
    assert "1-0000000001" not in r.text and "Demo Institute" not in r.text
    assert sign_in(pk, a).status_code == 200                # A's student is untouched


def test_guardian_access_ends_at_18(pk, monkeypatch):
    """M3: after the 18th birthday the guardian can't sign in, and an existing guardian session is refused."""
    monkeypatch.setattr(passkeys, "today", lambda: date(2026, 5, 1))
    guardian = setup(pk, TEEN, kind="guardian")
    hg = session(pk, guardian)
    assert pk.get("/v1/students/me", headers=hg).status_code == 200
    monkeypatch.setattr(passkeys, "today", lambda: date(2026, 5, 31))
    assert pk.get("/v1/students/me", headers=hg).status_code == 403
    assert pk.get("/v1/credentials", headers=hg).status_code == 403
    assert sign_in(pk, guardian).status_code == 401


def test_one_passkey_per_code_and_no_direct_writes(pk):
    """L1/L2: a setup session registers exactly one passkey; app_user can't insert keys or un-revoke them."""
    import psycopg

    from app import db
    code = issue(pk, ADULT).json()["code"]
    s = activate(pk, ADULT, code).json()
    h = {"Authorization": f"Bearer {s['setup_token']}"}
    for expected in (201, 409):
        opts = pk.post("/v1/passkeys/register/options", headers=h).json()
        r = pk.post("/v1/passkeys/register/verify", json={"credential": SoftAuthenticator().register(opts)}, headers=h)
        assert r.status_code == expected, r.text
    claims = auth.current_user(type("C", (), {"credentials": s["setup_token"]})())
    with db.app_connect(claims) as c:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("INSERT INTO passkeys (student_id, kind, credential_id, public_key, sign_count) VALUES (%s,'student','x','y',0)",
                      (claims["student_id"],))
    with db.app_connect(claims | {"scope": None}) as c:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("UPDATE passkeys SET revoked_at = NULL")


def test_code_dies_with_the_enrolment(pk):
    """L4: a code can't be redeemed once the student has left the institution."""
    code = issue(pk, ADULT).json()["code"]
    eid = enrolment(pk, ADULT)
    assert pk.patch(f"/v1/enrolments/{eid}", json={"status": "withdrawn", "reason": "left"}, headers=login(pk, "inst-a")).status_code == 200
    assert activate(pk, ADULT, code).status_code == 401


# ---------- P1.1 ----------
def test_first_passkey_cooldown_default_24h_and_zero(pk, monkeypatch, tmp_path):
    """M2: every new passkey waits PASSKEY_FIRST_COOLDOWN_HOURS (default 24) before its first consent approval."""
    from app import db
    with monkeypatch.context() as m:                                             # nothing set anywhere -> 24
        m.delenv("PASSKEY_FIRST_COOLDOWN_HOURS")
        m.setattr(db, "ENV_FILE", tmp_path / "no.env")
        assert passkeys.first_cooldown_hours() == 24
    monkeypatch.setenv("PASSKEY_FIRST_COOLDOWN_HOURS", "24")                     # the default, explicitly
    r = issue(pk, ADULT)
    assert r.json()["reissue"] is False and r.json()["cooldown_hours"] == 24
    s = activate(pk, ADULT, r.json()["code"]).json()
    h = {"Authorization": f"Bearer {s['setup_token']}"}
    a = SoftAuthenticator()
    opts = pk.post("/v1/passkeys/register/options", headers=h).json()
    assert pk.post("/v1/passkeys/register/verify", json={"credential": a.register(opts)}, headers=h).status_code == 201
    hs = session(pk, a)
    assert pk.get("/v1/students/me", headers=hs).json()["passkey_cooldown_until"] is not None
    r = approve(pk, hs, request_consent(pk, ADULT), a)
    assert r.status_code == 403 and "unlocks at" in r.json()["title"]
    monkeypatch.setenv("PASSKEY_FIRST_COOLDOWN_HOURS", "0")                      # demo setting
    b = setup(pk, ADULT_2)
    assert approve(pk, session(pk, b), request_consent(pk, ADULT_2), b).status_code == 200
    rei = issue(pk, ADULT_2, reason="Lost phone, reissue for the demo test")     # reissue keeps 24 h even at 0
    assert rei.json()["reissue"] is True and rei.json()["cooldown_hours"] == 24


def test_false_positive_resolution_unblocks_activation_codes(pk, dbconn):
    from app import crypto
    upload(pk, "inst-b", "B1.csv")
    hb = login(pk, "inst-b")
    eid = pk.get("/v1/enrolments", params={"apaar": "590573056992"}, headers=hb).json()[0]["id"]
    body = {"kind": "student", "reason": REASON}
    assert pk.post(f"/v1/enrolments/{eid}/activation-code", json=body, headers=hb).status_code == 409
    case = dbconn.execute("SELECT d.id FROM duplicate_cases d JOIN students s ON s.id = d.student_id WHERE s.apaar_bi=%s",
                          (crypto.apaar_bi("590573056992"),)).fetchone()["id"]
    assert pk.post(f"/v1/cases/{case}/resolve", json={"status": "false_positive", "note": "different people, same APAAR typo"},
                   headers=login(pk, "aicte")).status_code == 200
    r = pk.post(f"/v1/enrolments/{eid}/activation-code", json=body, headers=hb)
    assert r.status_code == 200 and r.json()["code"]
