-- Row-level security (CLAUDE.md rule; PRD §6). Loaded after schema.sql by the admin role.
-- The app connects as app_user (NOSUPERUSER NOBYPASSRLS, not owner). db.app_connect() sets
-- app.role / app.institution_id / app.user_id per connection. Unset settings = no rows.
-- Cross-institution facts are reachable only through the SECURITY DEFINER functions below,
-- each of which checks the caller's role and institution and returns the minimum needed.

-- ---------- helpers ----------
CREATE OR REPLACE FUNCTION app_role() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('app.role', true), '') $$;
CREATE OR REPLACE FUNCTION app_inst() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('app.institution_id', true), '') $$;
CREATE OR REPLACE FUNCTION app_is_regulator() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT app_role() IN ('aicte_officer', 'auditor') $$;
CREATE OR REPLACE FUNCTION app_owns_programme(pid text) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT app_role() = 'institution_admin' AND EXISTS (SELECT 1 FROM programmes p WHERE p.id = pid AND p.institution_id = app_inst()) $$;
CREATE OR REPLACE FUNCTION app_student() RETURNS bigint LANGUAGE sql STABLE AS
$$ SELECT CASE WHEN app_role() = 'student' THEN nullif(current_setting('app.student_id', true), '')::bigint END $$;
CREATE OR REPLACE FUNCTION app_registrar_did() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT CASE WHEN app_role() = 'university_registrar' THEN nullif(current_setting('app.issuer_did', true), '') END $$;
-- issuer DIDs the caller may sign for: its own institution's DID, or the registrar's university DID
CREATE OR REPLACE FUNCTION app_may_issue_for(p_did text) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT (app_role() = 'institution_admin' AND EXISTS (SELECT 1 FROM issuer_registry r WHERE r.did = p_did AND r.institution_id = app_inst()))
       OR (app_registrar_did() IS NOT NULL AND p_did = app_registrar_did()) $$;
CREATE OR REPLACE FUNCTION app_registrar_covers(pid text) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT app_registrar_did() IS NOT NULL AND EXISTS (SELECT 1 FROM programmes p JOIN affiliations a ON a.institution_id = p.institution_id
                                                      WHERE p.id = pid AND a.university_did = app_registrar_did()) $$;

-- ---------- privileges ----------
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_user;
GRANT USAGE ON SCHEMA public TO app_user;
-- users is NOT granted: password hashes are reachable only through login_lookup()
GRANT SELECT ON institutions, programmes, approved_intake, seat_categories, academic_years, intake_history,
  issuer_registry, affiliations, status_lists TO app_user;   -- registry + status lists: public, written only by admin/definer fns
GRANT SELECT, INSERT, UPDATE ON upload_batches, validation_issues, enrolments, students, programme_category_counters,
  duplicate_cases, anomaly_flags, consents TO app_user;
GRANT SELECT, INSERT ON audit_logs, ledger_checkpoints, credentials TO app_user;
GRANT SELECT ON ledger_entries TO app_user;            -- writes only via ledger_append()
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- ---------- policies ----------
-- upload_batches
ALTER TABLE upload_batches ENABLE ROW LEVEL SECURITY; ALTER TABLE upload_batches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON upload_batches; DROP POLICY IF EXISTS ins ON upload_batches; DROP POLICY IF EXISTS upd ON upload_batches;
CREATE POLICY sel ON upload_batches FOR SELECT USING (app_is_regulator() OR (app_role() = 'institution_admin' AND institution_id = app_inst()));
CREATE POLICY ins ON upload_batches FOR INSERT WITH CHECK (app_role() = 'institution_admin' AND institution_id = app_inst());
CREATE POLICY upd ON upload_batches FOR UPDATE USING (app_role() = 'institution_admin' AND institution_id = app_inst())
  WITH CHECK (institution_id = app_inst());

-- validation_issues (via batch)
ALTER TABLE validation_issues ENABLE ROW LEVEL SECURITY; ALTER TABLE validation_issues FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON validation_issues; DROP POLICY IF EXISTS ins ON validation_issues;
CREATE POLICY sel ON validation_issues FOR SELECT USING (app_is_regulator() OR EXISTS (SELECT 1 FROM upload_batches b WHERE b.id = batch_id));
CREATE POLICY ins ON validation_issues FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM upload_batches b WHERE b.id = batch_id AND b.institution_id = app_inst()));

-- enrolments
ALTER TABLE enrolments ENABLE ROW LEVEL SECURITY; ALTER TABLE enrolments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON enrolments; DROP POLICY IF EXISTS ins ON enrolments; DROP POLICY IF EXISTS upd ON enrolments;
CREATE POLICY sel ON enrolments FOR SELECT USING (app_is_regulator() OR app_owns_programme(programme_id)
  OR student_id = app_student()                -- a student sees their own enrolments
  OR app_registrar_covers(programme_id));      -- a university registrar sees its affiliated institutions' enrolments
CREATE POLICY ins ON enrolments FOR INSERT WITH CHECK (app_owns_programme(programme_id));
CREATE POLICY upd ON enrolments FOR UPDATE USING (app_owns_programme(programme_id)) WITH CHECK (app_owns_programme(programme_id));

-- programme_category_counters
ALTER TABLE programme_category_counters ENABLE ROW LEVEL SECURITY; ALTER TABLE programme_category_counters FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON programme_category_counters; DROP POLICY IF EXISTS upd ON programme_category_counters;
CREATE POLICY sel ON programme_category_counters FOR SELECT USING (app_is_regulator() OR app_owns_programme(programme_id));
CREATE POLICY upd ON programme_category_counters FOR UPDATE USING (app_owns_programme(programme_id)) WITH CHECK (app_owns_programme(programme_id));

-- students: shared person rows; an institution sees a student only through its own enrolment
ALTER TABLE students ENABLE ROW LEVEL SECURITY; ALTER TABLE students FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON students; DROP POLICY IF EXISTS ins ON students;
CREATE POLICY sel ON students FOR SELECT USING (app_is_regulator() OR id = app_student()
  OR EXISTS (SELECT 1 FROM enrolments e WHERE e.student_id = students.id));  -- enrolments RLS decides (own / affiliated)
CREATE POLICY ins ON students FOR INSERT WITH CHECK (app_role() = 'institution_admin');

-- duplicate_cases: visible to an institution only if one of its own enrolments is in the case
ALTER TABLE duplicate_cases ENABLE ROW LEVEL SECURITY; ALTER TABLE duplicate_cases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON duplicate_cases; DROP POLICY IF EXISTS upd ON duplicate_cases;
CREATE POLICY sel ON duplicate_cases FOR SELECT USING (app_is_regulator() OR EXISTS (SELECT 1 FROM enrolments e WHERE e.id = ANY(enrolment_ids)));
CREATE POLICY upd ON duplicate_cases FOR UPDATE USING (app_role() = 'aicte_officer') WITH CHECK (app_role() = 'aicte_officer');

-- anomaly_flags (incl. E501)
ALTER TABLE anomaly_flags ENABLE ROW LEVEL SECURITY; ALTER TABLE anomaly_flags FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON anomaly_flags; DROP POLICY IF EXISTS ins ON anomaly_flags;
CREATE POLICY sel ON anomaly_flags FOR SELECT USING (app_is_regulator() OR (app_role() = 'institution_admin' AND institution_id = app_inst()));
CREATE POLICY ins ON anomaly_flags FOR INSERT WITH CHECK (app_role() = 'institution_admin' AND institution_id = app_inst());

-- audit_logs: anyone authenticated may append as themselves; regulators read all; a student reads entries about them (D6)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY; ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON audit_logs; DROP POLICY IF EXISTS ins ON audit_logs;
CREATE POLICY sel ON audit_logs FOR SELECT USING (app_is_regulator() OR student_id = app_student());
CREATE POLICY ins ON audit_logs FOR INSERT WITH CHECK (app_role() <> '' AND actor = current_setting('app.user_id', true));

-- ledger_entries: read by regulators only (payload hashes could otherwise be brute-forced into an oracle)
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY; ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON ledger_entries;
CREATE POLICY sel ON ledger_entries FOR SELECT USING (app_is_regulator());

-- ledger_checkpoints: public read (signed, no PII); only AICTE inserts; no UPDATE grant at all
ALTER TABLE ledger_checkpoints ENABLE ROW LEVEL SECURITY; ALTER TABLE ledger_checkpoints FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON ledger_checkpoints; DROP POLICY IF EXISTS ins ON ledger_checkpoints;
CREATE POLICY sel ON ledger_checkpoints FOR SELECT USING (true);
CREATE POLICY ins ON ledger_checkpoints FOR INSERT WITH CHECK (app_role() = 'aicte_officer');

-- trust registry and status lists: public read (SELECT-only grant; writes by admin seed / definer fns)
ALTER TABLE status_lists ENABLE ROW LEVEL SECURITY; ALTER TABLE status_lists FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON status_lists;
CREATE POLICY sel ON status_lists FOR SELECT USING (true);
ALTER TABLE issuer_registry ENABLE ROW LEVEL SECURITY; ALTER TABLE issuer_registry FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON issuer_registry;
CREATE POLICY sel ON issuer_registry FOR SELECT USING (true);

-- credentials: the issuer (institution / registrar), the subject student and regulators can read.
-- Insert: an issuer for its own DID; a student only for a VerificationCredential about themselves,
-- issued by an institution where they hold an active enrolment (minted when they approve consent).
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY; ALTER TABLE credentials FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON credentials; DROP POLICY IF EXISTS ins ON credentials;
CREATE POLICY sel ON credentials FOR SELECT USING (app_is_regulator() OR subject_student_id = app_student() OR app_may_issue_for(issuer_did));
CREATE POLICY ins ON credentials FOR INSERT WITH CHECK (
  (app_may_issue_for(issuer_did) AND type <> 'VerificationCredential')
  OR (type = 'VerificationCredential' AND subject_student_id = app_student() AND EXISTS (
        SELECT 1 FROM enrolments e JOIN programmes p ON p.id = e.programme_id JOIN issuer_registry r ON r.institution_id = p.institution_id
        WHERE e.student_id = app_student() AND e.status = 'active' AND r.did = issuer_did)));

-- consents: verifier sees/creates its own requests; the student sees and answers requests about them
ALTER TABLE consents ENABLE ROW LEVEL SECURITY; ALTER TABLE consents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON consents; DROP POLICY IF EXISTS ins ON consents; DROP POLICY IF EXISTS upd ON consents;
CREATE POLICY sel ON consents FOR SELECT USING (app_is_regulator() OR student_id = app_student()
  OR (app_role() = 'verifier' AND requester_id = current_setting('app.user_id', true)));
CREATE POLICY ins ON consents FOR INSERT WITH CHECK (app_role() = 'verifier' AND requester_id = current_setting('app.user_id', true) AND status = 'pending');
CREATE POLICY upd ON consents FOR UPDATE USING (student_id = app_student()) WITH CHECK (student_id = app_student());

-- ---------- SECURITY DEFINER functions (the only cross-institution paths) ----------
DROP FUNCTION IF EXISTS login_lookup(text);
CREATE FUNCTION login_lookup(p_id text)
RETURNS TABLE (id text, role text, institution_id text, student_id bigint, issuer_did text, display_name text, password_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id, role, institution_id, student_id, issuer_did, display_name, password_hash FROM users WHERE id = p_id
$$;

-- MOCK student sign-in (APAAR + fixed OTP) and verifier consent requests need "which student has this APAAR".
-- Returns only the internal id; callable by anonymous (login) and verifier connections only.
CREATE OR REPLACE FUNCTION student_id_for_login(p_bi text) RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app_role() NOT IN ('', 'verifier') THEN RAISE EXCEPTION 'student_id_for_login: not allowed'; END IF;
  RETURN (SELECT id FROM students WHERE apaar_bi = p_bi);
END $$;

-- Random unused index (herd privacy) on the issuer's revocation list. The same index is used on its suspension list.
CREATE OR REPLACE FUNCTION allocate_status_index(p_issuer text) RETURNS TABLE (list_id text, idx int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_list text; v_size int; v_idx int; tries int := 0; b bytea;
BEGIN
  IF NOT (app_may_issue_for(p_issuer) OR (app_student() IS NOT NULL AND EXISTS (
        SELECT 1 FROM enrolments e JOIN programmes p ON p.id = e.programme_id JOIN issuer_registry r ON r.institution_id = p.institution_id
        WHERE e.student_id = app_student() AND e.status = 'active' AND r.did = p_issuer))) THEN
    RAISE EXCEPTION 'allocate_status_index: not allowed';
  END IF;
  SELECT id, length(bits) * 8 INTO v_list, v_size FROM status_lists WHERE issuer_did = p_issuer AND purpose = 'revocation';
  IF v_list IS NULL THEN RAISE EXCEPTION 'allocate_status_index: issuer has no status list'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_list, 0));
  LOOP
    -- CSPRNG: gen_random_uuid() uses the server's strong random source; 24 random bits mod a power-of-two size is unbiased
    b := uuid_send(gen_random_uuid());
    v_idx := ((get_byte(b, 0) << 16) | (get_byte(b, 1) << 8) | get_byte(b, 2)) % v_size;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM credentials c WHERE c.status_list_id = v_list AND c.status_index = v_idx);
    tries := tries + 1;
    IF tries > 1000 THEN RAISE EXCEPTION 'allocate_status_index: list full'; END IF;
  END LOOP;
  RETURN QUERY SELECT v_list, v_idx;
END $$;

-- Set or clear a credential's bit (W3C: index 0 = left-most bit; PG set_bit numbers bits from the right of each byte).
-- Issuers may suspend/unsuspend and revoke their own credentials; a student may only REVOKE a VerificationCredential
-- about themselves. Revocation is permanent for everyone (never cleared).
CREATE OR REPLACE FUNCTION set_credential_status(p_cred text, p_purpose text, p_value boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c record; v_list text;
BEGIN
  IF p_purpose NOT IN ('revocation', 'suspension') OR p_value IS NULL THEN RAISE EXCEPTION 'set_credential_status: bad purpose'; END IF;
  IF p_purpose = 'revocation' AND NOT p_value THEN RAISE EXCEPTION 'set_credential_status: revocation is permanent'; END IF;
  SELECT * INTO c FROM credentials WHERE id = p_cred;
  IF c.id IS NULL THEN RAISE EXCEPTION 'set_credential_status: no such credential'; END IF;
  IF NOT (app_may_issue_for(c.issuer_did)
          OR (c.type = 'VerificationCredential' AND c.subject_student_id = app_student() AND p_purpose = 'revocation' AND p_value)) THEN
    RAISE EXCEPTION 'set_credential_status: not allowed';
  END IF;
  SELECT id INTO v_list FROM status_lists WHERE issuer_did = c.issuer_did AND purpose = p_purpose;
  IF v_list IS NULL THEN RAISE EXCEPTION 'set_credential_status: issuer has no % list', p_purpose; END IF;
  UPDATE status_lists SET bits = set_bit(bits, (c.status_index / 8) * 8 + 7 - (c.status_index % 8), CASE WHEN p_value THEN 1 ELSE 0 END),
                          version = version + 1
   WHERE id = v_list;
END $$;

CREATE OR REPLACE FUNCTION active_enrolment_owners(p_bis text[], p_year text)
RETURNS TABLE (apaar_bi text, own boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app_role() <> 'institution_admin' THEN RAISE EXCEPTION 'active_enrolment_owners: not allowed'; END IF;
  IF coalesce(array_length(p_bis, 1), 0) > 50000 THEN RAISE EXCEPTION 'active_enrolment_owners: too many ids'; END IF;
  IF p_year <> (SELECT max(code) FROM academic_years) THEN RAISE EXCEPTION 'active_enrolment_owners: not the open year'; END IF;
  -- returns only "own" vs "someone else": never which institution
  RETURN QUERY SELECT s.apaar_bi, bool_or(p.institution_id = app_inst())
    FROM enrolments e JOIN students s ON s.id = e.student_id JOIN programmes p ON p.id = e.programme_id
    WHERE s.apaar_bi = ANY(p_bis) AND e.academic_year = p_year AND e.status = 'active'
    GROUP BY s.apaar_bi, (p.institution_id = app_inst());
END $$;

CREATE OR REPLACE FUNCTION student_id_by_bi(p_bi text) RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app_role() <> 'institution_admin' THEN RAISE EXCEPTION 'student_id_by_bi: not allowed'; END IF;
  RETURN (SELECT id FROM students WHERE apaar_bi = p_bi);
END $$;

CREATE OR REPLACE FUNCTION open_duplicate_case(p_student bigint, p_year text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE ids bigint[]; cid bigint;
BEGIN
  IF app_role() <> 'institution_admin' OR NOT EXISTS (
       SELECT 1 FROM enrolments e JOIN programmes p ON p.id = e.programme_id
       WHERE e.student_id = p_student AND e.academic_year = p_year AND e.status = 'active' AND p.institution_id = app_inst()) THEN
    RAISE EXCEPTION 'open_duplicate_case: caller has no active enrolment for this student';
  END IF;
  SELECT array_agg(id ORDER BY id) INTO ids FROM enrolments WHERE student_id = p_student AND academic_year = p_year AND status = 'active';
  SELECT id INTO cid FROM duplicate_cases WHERE student_id = p_student AND status IN ('flagged', 'under_investigation') FOR UPDATE;
  IF cid IS NULL THEN
    INSERT INTO duplicate_cases (student_id, enrolment_ids, status) VALUES (p_student, ids, 'flagged') RETURNING id INTO cid;
  ELSE
    UPDATE duplicate_cases SET enrolment_ids = ids WHERE id = cid;
  END IF;
  RETURN cid;
END $$;

-- entry_hash = sha256(prev|seq|institution|event|entity|payload_hash|ts) — ledger.verify() recomputes it in Python
CREATE OR REPLACE FUNCTION ledger_append(p_inst text, p_event text, p_entity bigint, p_payload_hash text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE last record; v_seq bigint; v_prev text; v_ts text;
BEGIN
  IF app_role() <> 'institution_admin' OR p_inst <> app_inst() THEN RAISE EXCEPTION 'ledger_append: not allowed'; END IF;
  IF p_payload_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'ledger_append: bad payload hash'; END IF;
  IF p_event NOT IN ('enrolment.created', 'enrolment.updated') THEN RAISE EXCEPTION 'ledger_append: unknown event'; END IF;
  IF NOT EXISTS (SELECT 1 FROM enrolments e JOIN programmes p ON p.id = e.programme_id
                 WHERE e.id = p_entity AND p.institution_id = app_inst()) THEN
    RAISE EXCEPTION 'ledger_append: enrolment is not the caller''s';
  END IF;
  PERFORM pg_advisory_xact_lock(42);  -- ponytail: one global chain lock; shard per institution if throughput matters
  SELECT seq, entry_hash INTO last FROM ledger_entries ORDER BY seq DESC LIMIT 1;
  v_seq := coalesce(last.seq, 0) + 1;
  v_prev := coalesce(last.entry_hash, repeat('0', 64));
  v_ts := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  INSERT INTO ledger_entries (seq, institution_id, event_type, entity_id, payload_hash, prev_hash, entry_hash, ts)
  VALUES (v_seq, p_inst, p_event, p_entity, p_payload_hash, v_prev,
          encode(sha256(convert_to(concat_ws('|', v_prev, v_seq, p_inst, p_event, p_entity, p_payload_hash, v_ts), 'UTF8')), 'hex'),
          v_ts);
END $$;

-- The verifier that requested a consent may fetch the VerificationCredential minted for it (D5).
-- Returns nothing unless the caller is that requester; the app checks status/expiry and audits the fetch.
CREATE OR REPLACE FUNCTION consent_credential(p_consent bigint)
RETURNS TABLE (credential_id text, vc_enc bytea, consent_status text, expires_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app_role() <> 'verifier' THEN RAISE EXCEPTION 'consent_credential: not allowed'; END IF;
  RETURN QUERY SELECT c.id, c.vc_enc, k.status, k.expires_at
    FROM consents k LEFT JOIN credentials c ON c.consent_id = k.id
   WHERE k.id = p_consent AND k.requester_id = current_setting('app.user_id', true);
END $$;

-- Records a verification in the audit log against the credential's subject (so the student sees it, D6)
-- without revealing anything to the verifier. The entry is linked to the student only when the presented
-- document is byte-for-byte the stored credential (same JCS hash), so nobody can plant fake entries by
-- quoting a credential id.
DROP FUNCTION IF EXISTS log_verification(text, text, text);
CREATE OR REPLACE FUNCTION log_verification(p_cred text, p_vc_hash text, p_result text, p_request_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app_role() = '' THEN RAISE EXCEPTION 'log_verification: not allowed'; END IF;
  INSERT INTO audit_logs (actor, role, action, entity, entity_id, student_id, reason, request_id)
  VALUES (current_setting('app.user_id', true), app_role(), 'credential.verify', 'credential', left(p_cred, 100),
          (SELECT subject_student_id FROM credentials WHERE id = p_cred AND vc_hash = p_vc_hash),
          left(p_result, 40), left(p_request_id, 64));
END $$;

REVOKE ALL ON FUNCTION login_lookup(text), active_enrolment_owners(text[], text), student_id_by_bi(text),
  open_duplicate_case(bigint, text), ledger_append(text, text, bigint, text), student_id_for_login(text),
  allocate_status_index(text), set_credential_status(text, text, boolean), log_verification(text, text, text, text),
  consent_credential(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION login_lookup(text), active_enrolment_owners(text[], text), student_id_by_bi(text),
  open_duplicate_case(bigint, text), ledger_append(text, text, bigint, text), student_id_for_login(text),
  allocate_status_index(text), set_credential_status(text, text, boolean), log_verification(text, text, text, text),
  consent_credential(bigint) TO app_user;
