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
$$ SELECT CASE WHEN app_role() IN ('student', 'guardian') THEN nullif(current_setting('app.student_id', true), '')::bigint END $$;
-- a guardian (P1) acts for a minor and sees what the student sees
CREATE OR REPLACE FUNCTION app_scope() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('app.scope', true), '') $$;
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
GRANT SELECT, INSERT, UPDATE ON webhook_endpoints TO app_user;
GRANT SELECT ON passkeys TO app_user;
GRANT UPDATE (sign_count, last_used_at) ON passkeys TO app_user;  -- insert/revoke only via register_passkey / revoke_own_passkey
-- activation_codes and webauthn_challenges: no grants, functions only
GRANT SELECT, UPDATE ON webhook_deliveries TO app_user;   -- inserts only via enqueue_event() / enqueue_case_event()
GRANT SELECT, INSERT ON audit_logs, ledger_checkpoints, credentials, batch_features TO app_user;
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

-- batch_features (F1 aggregates): own institution and regulators
ALTER TABLE batch_features ENABLE ROW LEVEL SECURITY; ALTER TABLE batch_features FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON batch_features; DROP POLICY IF EXISTS ins ON batch_features;
CREATE POLICY sel ON batch_features FOR SELECT USING (app_is_regulator() OR app_owns_programme(programme_id));
CREATE POLICY ins ON batch_features FOR INSERT WITH CHECK (app_owns_programme(programme_id)
  AND EXISTS (SELECT 1 FROM upload_batches b WHERE b.id = batch_id AND b.institution_id = app_inst()));

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

-- webhooks (Req 7): an institution manages its own endpoints and sees its own deliveries; regulators read deliveries.
-- The in-process dispatcher connects with app.role='webhook_dispatcher' (no user row can hold that role: users.role CHECK).
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY; ALTER TABLE webhook_endpoints FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON webhook_endpoints; DROP POLICY IF EXISTS ins ON webhook_endpoints; DROP POLICY IF EXISTS upd ON webhook_endpoints;
CREATE POLICY sel ON webhook_endpoints FOR SELECT USING ((app_role() = 'institution_admin' AND institution_id = app_inst())
  OR app_role() = 'webhook_dispatcher');
CREATE POLICY ins ON webhook_endpoints FOR INSERT WITH CHECK (app_role() = 'institution_admin' AND institution_id = app_inst());
CREATE POLICY upd ON webhook_endpoints FOR UPDATE USING (app_role() = 'institution_admin' AND institution_id = app_inst())
  WITH CHECK (institution_id = app_inst());

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY; ALTER TABLE webhook_deliveries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON webhook_deliveries; DROP POLICY IF EXISTS upd ON webhook_deliveries;
CREATE POLICY sel ON webhook_deliveries FOR SELECT USING (app_is_regulator() OR app_role() = 'webhook_dispatcher'
  OR EXISTS (SELECT 1 FROM webhook_endpoints w WHERE w.id = endpoint_id));   -- endpoints RLS decides (own institution)
CREATE POLICY upd ON webhook_deliveries FOR UPDATE USING (app_role() = 'webhook_dispatcher'
  OR (app_role() = 'institution_admin' AND EXISTS (SELECT 1 FROM webhook_endpoints w WHERE w.id = endpoint_id)));


-- passkeys (P1): the owner (student, or the guardian for guardian keys) sees its own keys and may update the sign
-- counter. New keys only via register_passkey() (one per redeemed code, cooldown set there); revocation via revoke_own_passkey().
ALTER TABLE passkeys ENABLE ROW LEVEL SECURITY; ALTER TABLE passkeys FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON passkeys; DROP POLICY IF EXISTS ins ON passkeys; DROP POLICY IF EXISTS upd ON passkeys;
CREATE POLICY sel ON passkeys FOR SELECT USING (student_id = app_student() AND kind = app_role());
CREATE POLICY upd ON passkeys FOR UPDATE USING (student_id = app_student() AND kind = app_role() AND app_scope() = '')
  WITH CHECK (student_id = app_student() AND kind = app_role());
ALTER TABLE activation_codes ENABLE ROW LEVEL SECURITY; ALTER TABLE activation_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE webauthn_challenges ENABLE ROW LEVEL SECURITY; ALTER TABLE webauthn_challenges FORCE ROW LEVEL SECURITY;

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
-- VerificationCredentials are the student's (D5): the issuing institution can't see them (they reveal which
-- employer the student shares data with) — only the student, regulators and the consent requester (definer fn).
-- Insert: an issuer for its own DID; a student only for the single VerificationCredential of a consent they
-- granted, issued by an institution where they hold an active enrolment.
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY; ALTER TABLE credentials FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON credentials; DROP POLICY IF EXISTS ins ON credentials;
CREATE POLICY sel ON credentials FOR SELECT USING (app_is_regulator() OR subject_student_id = app_student()
  OR (app_may_issue_for(issuer_did) AND type <> 'VerificationCredential'));
CREATE POLICY ins ON credentials FOR INSERT WITH CHECK (
  (app_may_issue_for(issuer_did) AND type <> 'VerificationCredential')
  OR (type = 'VerificationCredential' AND subject_student_id = app_student()
      AND EXISTS (SELECT 1 FROM consents k WHERE k.id = consent_id AND k.student_id = app_student() AND k.status = 'granted')
      AND EXISTS (SELECT 1 FROM enrolments e JOIN programmes p ON p.id = e.programme_id JOIN issuer_registry r ON r.institution_id = p.institution_id
                  WHERE e.student_id = app_student() AND e.status = 'active' AND r.did = issuer_did)));

-- consents: the student sees and answers requests about them; regulators read. Verifiers have NO direct
-- access: they create and list requests only through request_consent() / my_consent_requests(), which never
-- return student_id — so a verifier can't tell whether an APAAR matched a registered student.
ALTER TABLE consents ENABLE ROW LEVEL SECURITY; ALTER TABLE consents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON consents; DROP POLICY IF EXISTS ins ON consents; DROP POLICY IF EXISTS upd ON consents;
CREATE POLICY sel ON consents FOR SELECT USING (app_is_regulator() OR student_id = app_student());
CREATE POLICY upd ON consents FOR UPDATE USING (student_id = app_student()) WITH CHECK (student_id = app_student());

-- ---------- SECURITY DEFINER functions (the only cross-institution paths) ----------
DROP FUNCTION IF EXISTS login_lookup(text);
CREATE FUNCTION login_lookup(p_id text)
RETURNS TABLE (id text, role text, institution_id text, student_id bigint, issuer_did text, display_name text, password_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id, role, institution_id, student_id, issuer_did, display_name, password_hash FROM users WHERE id = p_id
$$;

-- MOCK student sign-in (APAAR + date of birth): returns the id and the encrypted DOB for the app to compare.
-- Anonymous (login) connections only; the app throttles failed attempts.
DROP FUNCTION IF EXISTS student_id_for_login(text);
CREATE OR REPLACE FUNCTION student_login_lookup(p_bi text) RETURNS TABLE (id bigint, dob_enc bytea)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app_role() <> '' THEN RAISE EXCEPTION 'student_login_lookup: not allowed'; END IF;
  RETURN QUERY SELECT s.id, s.dob_enc FROM students s WHERE s.apaar_bi = p_bi;
END $$;

-- Verifier consent request. Always stores the request and returns the same shape, whether or not the APAAR
-- belongs to a registered student (unmatched requests simply stay pending until they expire, exactly like a
-- request the student never answers). Rate-limited per verifier; the audit row is written here, linked to
-- the student only when matched, so the application layer never learns the outcome either.
CREATE OR REPLACE FUNCTION request_consent(p_bi text, p_purpose text, p_fields text[], p_days int, p_requester_name text,
                                           p_request_id text)
RETURNS TABLE (id bigint, requester_name text, purpose text, scope_fields text[], status text, granted_by text,
               requested_at timestamptz, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_student bigint; v_id bigint; v_me text := current_setting('app.user_id', true);
BEGIN
  IF app_role() <> 'verifier' OR coalesce(v_me, '') = '' THEN RAISE EXCEPTION 'request_consent: not allowed'; END IF;
  IF p_days NOT BETWEEN 1 AND 30 OR length(p_purpose) NOT BETWEEN 3 AND 200 OR cardinality(p_fields) = 0
     OR NOT p_fields <@ ARRAY['name','programme','institution','academic_year','status','apaar_id','student_id'] THEN
    RAISE EXCEPTION 'request_consent: invalid request';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('consent-rate:' || v_me, 0));
  IF (SELECT count(*) FROM consents c WHERE c.requester_id = v_me AND c.requested_at > now() - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'request_consent: rate limit' USING ERRCODE = 'RL429';
  END IF;
  SELECT s.id INTO v_student FROM students s WHERE s.apaar_bi = p_bi;
  INSERT INTO consents (student_id, requester_id, requester_name, purpose, scope_fields, status, expires_at)
  VALUES (v_student, v_me, p_requester_name, p_purpose, (SELECT array_agg(DISTINCT f ORDER BY f) FROM unnest(p_fields) f), 'pending',
          date_trunc('second', now()) + make_interval(days => p_days))
  RETURNING consents.id INTO v_id;
  INSERT INTO audit_logs (actor, role, action, entity, entity_id, student_id, reason, request_id)
  VALUES (v_me, 'verifier', 'consent.request', 'consent', v_id::text, v_student, left(p_purpose, 200), left(p_request_id, 64));
  RETURN QUERY SELECT c.id, c.requester_name, c.purpose, c.scope_fields, c.status, c.granted_by, c.requested_at, c.expires_at
                 FROM consents c WHERE c.id = v_id;
END $$;

-- DQS correction churn for the caller's own institution: enrolment updates recorded in the ledger
-- (institutions can't read ledger_entries directly — payload hashes could be brute-forced into an oracle).
CREATE OR REPLACE FUNCTION own_correction_count() RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app_role() <> 'institution_admin' THEN RAISE EXCEPTION 'own_correction_count: not allowed'; END IF;
  RETURN (SELECT count(*) FROM ledger_entries WHERE institution_id = app_inst() AND event_type = 'enrolment.updated');
END $$;

-- The verifier's own requests, without student_id.
CREATE OR REPLACE FUNCTION my_consent_requests()
RETURNS TABLE (id bigint, requester_name text, purpose text, scope_fields text[], status text, granted_by text,
               requested_at timestamptz, expires_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app_role() <> 'verifier' THEN RAISE EXCEPTION 'my_consent_requests: not allowed'; END IF;
  RETURN QUERY SELECT c.id, c.requester_name, c.purpose, c.scope_fields, c.status, c.granted_by, c.requested_at, c.expires_at
                 FROM consents c WHERE c.requester_id = current_setting('app.user_id', true) ORDER BY c.requested_at DESC LIMIT 200;
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
  IF NOT ((app_may_issue_for(c.issuer_did) AND c.type <> 'VerificationCredential')  -- consent-scoped VCs are the student's
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

-- Withdrawal/migration revokes every credential of that enrolment, including the student's consent-scoped
-- VerificationCredentials (which the institution can't otherwise see or change). Caller must own the enrolment.
CREATE OR REPLACE FUNCTION revoke_enrolment_credentials(p_enrolment bigint) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c record; n int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM enrolments e WHERE e.id = p_enrolment AND app_owns_programme(e.programme_id) AND e.status IN ('withdrawn', 'migrated')) THEN
    RAISE EXCEPTION 'revoke_enrolment_credentials: not allowed';
  END IF;
  FOR c IN SELECT * FROM credentials WHERE enrolment_id = p_enrolment AND type IN ('EnrolmentCredential', 'VerificationCredential') LOOP
    UPDATE status_lists SET bits = set_bit(bits, (c.status_index / 8) * 8 + 7 - (c.status_index % 8), 1), version = version + 1
     WHERE issuer_did = c.issuer_did AND purpose = 'revocation';
    n := n + 1;
  END LOOP;
  RETURN n;
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

-- Case resolution side effects on credentials (AICTE officer only). confirmed_duplicate: revoke the credentials of
-- every enrolment in the case except the one the officer keeps. under_investigation: suspend all of them (reversible).
-- false_positive / confirmed: lift the suspension of the enrolments that stand.
CREATE OR REPLACE FUNCTION apply_case_resolution(p_case bigint, p_keep bigint) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE k record; c record; n int := 0; bitpos int;
BEGIN
  IF app_role() <> 'aicte_officer' THEN RAISE EXCEPTION 'apply_case_resolution: not allowed'; END IF;
  SELECT * INTO k FROM duplicate_cases WHERE id = p_case;
  IF k.id IS NULL THEN RAISE EXCEPTION 'apply_case_resolution: no such case'; END IF;
  IF k.status = 'confirmed_duplicate' AND (p_keep IS NULL OR NOT p_keep = ANY(k.enrolment_ids)) THEN
    RAISE EXCEPTION 'apply_case_resolution: keep_enrolment_id must be one of the case enrolments';
  END IF;
  FOR c IN SELECT * FROM credentials WHERE enrolment_id = ANY(k.enrolment_ids) LOOP
    bitpos := (c.status_index / 8) * 8 + 7 - (c.status_index % 8);
    IF k.status = 'confirmed_duplicate' AND c.enrolment_id <> p_keep THEN
      UPDATE status_lists SET bits = set_bit(bits, bitpos, 1), version = version + 1
       WHERE issuer_did = c.issuer_did AND purpose = 'revocation';
    END IF;
    UPDATE status_lists SET bits = set_bit(bits, bitpos, CASE WHEN k.status = 'under_investigation' THEN 1 ELSE 0 END), version = version + 1
     WHERE issuer_did = c.issuer_did AND purpose = 'suspension';
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Webhook events (Req 7). The app builds the payload from an allowlist (ids, counts, codes); these functions only
-- fan it out to the subscribed endpoints, so a caller never sees another institution's endpoints.
-- enqueue_event: an institution for itself, or an AICTE officer for an institution its action affected.
CREATE OR REPLACE FUNCTION enqueue_event(p_type text, p_payload jsonb, p_inst text) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n int;
BEGIN
  IF NOT ((app_role() = 'institution_admin' AND p_inst = app_inst()) OR app_role() = 'aicte_officer') THEN
    RAISE EXCEPTION 'enqueue_event: not allowed';
  END IF;
  INSERT INTO webhook_deliveries (endpoint_id, event_id, event_type, payload)
  SELECT w.id, gen_random_uuid(), p_type, p_payload FROM webhook_endpoints w
   WHERE w.institution_id = p_inst AND w.active AND p_type = ANY(w.events);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- enqueue_case_event: notify every institution with an enrolment in the case (neutral payload built by the app).
-- Caller: an AICTE officer, or an institution that itself has an enrolment in the case.
CREATE OR REPLACE FUNCTION enqueue_case_event(p_case bigint, p_type text, p_payload jsonb) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE k record; insts text[]; n int;
BEGIN
  SELECT * INTO k FROM duplicate_cases WHERE id = p_case;
  IF k.id IS NULL THEN RAISE EXCEPTION 'enqueue_case_event: no such case'; END IF;
  SELECT array_agg(DISTINCT p.institution_id) INTO insts FROM enrolments e JOIN programmes p ON p.id = e.programme_id
   WHERE e.id = ANY(k.enrolment_ids);
  IF NOT (app_role() = 'aicte_officer' OR (app_role() = 'institution_admin' AND app_inst() = ANY(insts))) THEN
    RAISE EXCEPTION 'enqueue_case_event: not allowed';
  END IF;
  INSERT INTO webhook_deliveries (endpoint_id, event_id, event_type, payload)
  SELECT w.id, gen_random_uuid(), p_type, p_payload FROM webhook_endpoints w
   WHERE w.institution_id = ANY(insts) AND w.active AND p_type = ANY(w.events);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ---------- passkeys (P1) ----------
-- Institution issues a one-time activation code for its own active student. Voids that student's unused codes of the
-- kind and revokes that kind's passkeys (lost-device recovery). Any code after the very first one is a REISSUE: a passkey
-- registered from it can't approve consent for 24 h (insider-impersonation cooldown). The plaintext code never reaches
-- the database; an Idempotency-Key replay returns replay=true and no code.
CREATE OR REPLACE FUNCTION issue_activation_code(p_enrolment bigint, p_kind text, p_code_hash text, p_idem text, p_req_hash text)
RETURNS TABLE (code_id bigint, student_id bigint, revoked int, reissue boolean, replay boolean, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE e record; prev record; n int; rei boolean; cid bigint; exp timestamptz;
BEGIN
  SELECT en.* INTO e FROM enrolments en WHERE en.id = p_enrolment;
  IF e.id IS NULL OR app_role() <> 'institution_admin' OR NOT app_owns_programme(e.programme_id) OR e.status <> 'active'
     OR p_kind NOT IN ('student', 'guardian') THEN
    RAISE EXCEPTION 'issue_activation_code: not allowed' USING ERRCODE = 'P0002';
  END IF;
  IF p_idem IS NOT NULL THEN
    SELECT * INTO prev FROM activation_codes a WHERE a.institution_id = app_inst() AND a.idempotency_key = p_idem;
    IF prev.id IS NOT NULL THEN
      IF prev.request_hash <> p_req_hash THEN RAISE EXCEPTION 'idempotency key reused' USING ERRCODE = 'P0003'; END IF;
      RETURN QUERY SELECT prev.id, prev.student_id, 0, prev.reissue, true, prev.expires_at;
      RETURN;
    END IF;
  END IF;
  -- H1: no codes for a person who is active at another institution or in an open duplicate case: an institution
  -- uploading someone else's APAAR must not be able to take over that student's passkey identity.
  -- A case AICTE resolved as a false positive lifts the "active elsewhere" block for that person.
  IF (EXISTS (SELECT 1 FROM enrolments o JOIN programmes op ON op.id = o.programme_id
               WHERE o.student_id = e.student_id AND o.status = 'active' AND op.institution_id <> app_inst())
      AND NOT EXISTS (SELECT 1 FROM duplicate_cases d WHERE d.student_id = e.student_id AND d.status = 'false_positive'))
     OR EXISTS (SELECT 1 FROM duplicate_cases d WHERE d.student_id = e.student_id AND d.status IN ('flagged', 'under_investigation')) THEN
    RAISE EXCEPTION 'issue_activation_code: record under review' USING ERRCODE = 'P0004';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('activation:' || e.student_id || ':' || p_kind, 0));
  -- M1: everything below looks only at THIS institution's codes and the passkeys they created
  rei := EXISTS (SELECT 1 FROM activation_codes a WHERE a.student_id = e.student_id AND a.kind = p_kind AND a.institution_id = app_inst());
  UPDATE activation_codes a SET voided_at = now()
   WHERE a.student_id = e.student_id AND a.kind = p_kind AND a.institution_id = app_inst() AND a.used_at IS NULL AND a.voided_at IS NULL;
  UPDATE passkeys k SET revoked_at = now() FROM activation_codes a
   WHERE a.id = k.activation_code_id AND a.institution_id = app_inst() AND k.student_id = e.student_id AND k.kind = p_kind
     AND k.revoked_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  exp := now() + interval '7 days';
  INSERT INTO activation_codes (student_id, kind, code_hash, institution_id, issued_by, reissue, idempotency_key, request_hash, expires_at)
  VALUES (e.student_id, p_kind, p_code_hash, app_inst(), current_setting('app.user_id', true), rei, p_idem, p_req_hash, exp)
  RETURNING id INTO cid;
  RETURN QUERY SELECT cid, e.student_id, n, rei, false, exp;
END $$;

-- Anonymous: redeem (burn) a code for the student with this APAAR. Nothing comes back for any kind of mismatch.
CREATE OR REPLACE FUNCTION redeem_activation_code(p_bi text, p_code_hash text)
RETURNS TABLE (code_id bigint, student_id bigint, kind text, reissue boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app_role() <> '' THEN RAISE EXCEPTION 'redeem_activation_code: not allowed'; END IF;
  RETURN QUERY UPDATE activation_codes a SET used_at = now()
    FROM students s
   WHERE s.id = a.student_id AND s.apaar_bi = p_bi AND a.code_hash = p_code_hash
     AND a.used_at IS NULL AND a.voided_at IS NULL AND a.expires_at > now()
     AND EXISTS (SELECT 1 FROM enrolments e JOIN programmes p ON p.id = e.programme_id   -- L4: still enrolled there
                  WHERE e.student_id = a.student_id AND e.status = 'active' AND p.institution_id = a.institution_id)
  RETURNING a.id, a.student_id, a.kind, a.reissue;
END $$;

-- Single-use WebAuthn challenges (5 min). Login: anonymous. Register: a passkey-setup session. Consent: the student or
-- guardian whose inbox holds the request; the challenge is stored with the request id and a hash of its terms.
CREATE OR REPLACE FUNCTION store_challenge(p_challenge bytea, p_purpose text, p_consent bigint, p_terms_hash text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT ((p_purpose = 'login' AND app_role() = '')
       OR (p_purpose = 'register' AND app_scope() = 'passkey_setup' AND app_student() IS NOT NULL)
       OR (p_purpose = 'consent' AND app_scope() = '' AND app_student() IS NOT NULL
           AND EXISTS (SELECT 1 FROM consents c WHERE c.id = p_consent AND c.student_id = app_student()))) THEN
    RAISE EXCEPTION 'store_challenge: not allowed';
  END IF;
  DELETE FROM webauthn_challenges w WHERE w.expires_at < now() - interval '1 hour';
  INSERT INTO webauthn_challenges (challenge, purpose, student_id, kind, consent_id, terms_hash, expires_at)
  VALUES (p_challenge, p_purpose, app_student(), CASE WHEN p_purpose = 'login' THEN NULL ELSE app_role() END,
          p_consent, p_terms_hash, now() + interval '5 minutes');
END $$;

CREATE OR REPLACE FUNCTION take_challenge(p_challenge bytea, p_purpose text) RETURNS TABLE (consent_id bigint, terms_hash text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY UPDATE webauthn_challenges w SET used_at = now()
   WHERE w.challenge = p_challenge AND w.purpose = p_purpose AND w.used_at IS NULL AND w.expires_at > now()
     AND w.student_id IS NOT DISTINCT FROM app_student()
     AND w.kind IS NOT DISTINCT FROM (CASE WHEN p_purpose = 'login' THEN NULL ELSE app_role() END)
  RETURNING w.consent_id, w.terms_hash;
END $$;

-- Anonymous passkey sign-in: find an unrevoked key by credential id. The sign count is updated afterwards on a
-- connection opened as the signed-in student/guardian (RLS), so there is no anonymous write path.
CREATE OR REPLACE FUNCTION passkey_for_login(p_credential bytea)
RETURNS TABLE (id bigint, student_id bigint, kind text, public_key bytea, sign_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app_role() <> '' THEN RAISE EXCEPTION 'passkey_for_login: not allowed'; END IF;
  RETURN QUERY SELECT k.id, k.student_id, k.kind, k.public_key, k.sign_count FROM passkeys k
   WHERE k.credential_id = p_credential AND k.revoked_at IS NULL;
END $$;

-- L1/L2: the only way to add a passkey. Bound to the setup session's own redeemed code (app.code_id comes from the
-- signed setup token); one passkey per code; the 24 h cooldown is set here from the code row, not by the caller.
DROP FUNCTION IF EXISTS register_passkey(bytea, bytea, bigint, text[]);
CREATE OR REPLACE FUNCTION register_passkey(p_credential bytea, p_public_key bytea, p_sign_count bigint, p_transports text[],
                                            p_first_cooldown_hours int)
RETURNS SETOF passkeys
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c record;
BEGIN
  IF app_scope() <> 'passkey_setup' OR app_student() IS NULL THEN RAISE EXCEPTION 'register_passkey: not allowed'; END IF;
  SELECT * INTO c FROM activation_codes a WHERE a.id = nullif(current_setting('app.code_id', true), '')::bigint
     AND a.student_id = app_student() AND a.kind = app_role() AND a.used_at IS NOT NULL FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'register_passkey: no redeemed code for this session'; END IF;
  IF c.registered_at IS NOT NULL THEN RAISE EXCEPTION 'register_passkey: code already used' USING ERRCODE = 'P0005'; END IF;
  UPDATE activation_codes SET registered_at = now() WHERE id = c.id;
  RETURN QUERY INSERT INTO passkeys (student_id, kind, credential_id, public_key, sign_count, transports, approve_after, activation_code_id)
    VALUES (c.student_id, c.kind, p_credential, p_public_key, p_sign_count, p_transports,
            -- reissued codes always wait 24 h; every new passkey waits PASSKEY_FIRST_COOLDOWN_HOURS (M2), whichever is longer
            now() + make_interval(hours => GREATEST(CASE WHEN c.reissue THEN 24 ELSE 0 END, GREATEST(p_first_cooldown_hours, 0))), c.id)
    RETURNING *;
END $$;

-- L1: revocation is one-way (no UPDATE grant on revoked_at, so a key can't be un-revoked).
CREATE OR REPLACE FUNCTION revoke_own_passkey(p_id bigint) RETURNS SETOF passkeys
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app_scope() <> '' OR app_student() IS NULL THEN RAISE EXCEPTION 'revoke_own_passkey: not allowed'; END IF;
  RETURN QUERY UPDATE passkeys k SET revoked_at = coalesce(k.revoked_at, now())
   WHERE k.id = p_id AND k.student_id = app_student() AND k.kind = app_role() RETURNING *;
END $$;

-- Regulators: activation-code reissues per institution (insider-impersonation signal on the AICTE dashboard).
CREATE OR REPLACE FUNCTION activation_reissue_counts() RETURNS TABLE (institution_id text, reissues bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_is_regulator() THEN RAISE EXCEPTION 'activation_reissue_counts: not allowed'; END IF;
  RETURN QUERY SELECT a.institution_id, count(*) FROM activation_codes a WHERE a.reissue GROUP BY a.institution_id;
END $$;

REVOKE ALL ON FUNCTION login_lookup(text), active_enrolment_owners(text[], text), student_id_by_bi(text),
  open_duplicate_case(bigint, text), ledger_append(text, text, bigint, text), student_login_lookup(text),
  allocate_status_index(text), set_credential_status(text, text, boolean), log_verification(text, text, text, text),
  consent_credential(bigint), revoke_enrolment_credentials(bigint),
  request_consent(text, text, text[], int, text, text), my_consent_requests(), own_correction_count(), apply_case_resolution(bigint, bigint),
  enqueue_event(text, jsonb, text), enqueue_case_event(bigint, text, jsonb),
  issue_activation_code(bigint, text, text, text, text), redeem_activation_code(text, text),
  store_challenge(bytea, text, bigint, text), take_challenge(bytea, text), passkey_for_login(bytea),
  activation_reissue_counts(), register_passkey(bytea, bytea, bigint, text[], int), revoke_own_passkey(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION login_lookup(text), active_enrolment_owners(text[], text), student_id_by_bi(text),
  open_duplicate_case(bigint, text), ledger_append(text, text, bigint, text), student_login_lookup(text),
  allocate_status_index(text), set_credential_status(text, text, boolean), log_verification(text, text, text, text),
  consent_credential(bigint), revoke_enrolment_credentials(bigint),
  request_consent(text, text, text[], int, text, text), my_consent_requests(), own_correction_count(), apply_case_resolution(bigint, bigint),
  enqueue_event(text, jsonb, text), enqueue_case_event(bigint, text, jsonb),
  issue_activation_code(bigint, text, text, text, text), redeem_activation_code(text, text),
  store_challenge(bytea, text, bigint, text), take_challenge(bytea, text), passkey_for_login(bytea),
  activation_reissue_counts(), register_passkey(bytea, bytea, bigint, text[], int), revoke_own_passkey(bigint) TO app_user;
