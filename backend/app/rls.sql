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
CREATE OR REPLACE FUNCTION app_scope() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('app.scope', true), '') $$;
CREATE OR REPLACE FUNCTION app_registrar_did() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT CASE WHEN app_role() = 'university_registrar' THEN nullif(current_setting('app.issuer_did', true), '') END $$;
CREATE OR REPLACE FUNCTION app_may_issue_for(p_did text) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT (app_role() = 'institution_admin' AND EXISTS (SELECT 1 FROM issuer_registry r WHERE r.did = p_did AND r.institution_id = app_inst()))
       OR (app_registrar_did() IS NOT NULL AND p_did = app_registrar_did()) $$;
CREATE OR REPLACE FUNCTION app_registrar_covers(pid text) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT app_registrar_did() IS NOT NULL AND EXISTS (SELECT 1 FROM programmes p JOIN affiliations a ON a.institution_id = p.institution_id
                                                      WHERE p.id = pid AND a.university_did = app_registrar_did()) $$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT ON institutions, programmes, approved_intake, seat_categories, academic_years, intake_history,
  issuer_registry, affiliations, status_lists TO app_user;
GRANT SELECT, INSERT, UPDATE ON upload_batches, validation_issues, enrolments, students, programme_category_counters,
  duplicate_cases, anomaly_flags, consents TO app_user;
GRANT SELECT, INSERT, UPDATE ON webhook_endpoints TO app_user;
GRANT SELECT ON passkeys TO app_user;
GRANT SELECT, INSERT ON flag_reviews TO app_user;
GRANT UPDATE (sign_count, last_used_at) ON passkeys TO app_user;
GRANT SELECT, UPDATE ON webhook_deliveries TO app_user;
GRANT SELECT, INSERT ON audit_logs, ledger_checkpoints, credentials, batch_features TO app_user;
GRANT SELECT ON ledger_entries TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

ALTER TABLE upload_batches ENABLE ROW LEVEL SECURITY; ALTER TABLE upload_batches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON upload_batches; DROP POLICY IF EXISTS ins ON upload_batches; DROP POLICY IF EXISTS upd ON upload_batches;
CREATE POLICY sel ON upload_batches FOR SELECT USING (app_is_regulator() OR (app_role() = 'institution_admin' AND institution_id = app_inst()));
CREATE POLICY ins ON upload_batches FOR INSERT WITH CHECK (app_role() = 'institution_admin' AND institution_id = app_inst());
CREATE POLICY upd ON upload_batches FOR UPDATE USING (app_role() = 'institution_admin' AND institution_id = app_inst())
  WITH CHECK (institution_id = app_inst());

ALTER TABLE validation_issues ENABLE ROW LEVEL SECURITY; ALTER TABLE validation_issues FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON validation_issues; DROP POLICY IF EXISTS ins ON validation_issues;
CREATE POLICY sel ON validation_issues FOR SELECT USING (app_is_regulator() OR EXISTS (SELECT 1 FROM upload_batches b WHERE b.id = batch_id));
CREATE POLICY ins ON validation_issues FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM upload_batches b WHERE b.id = batch_id AND b.institution_id = app_inst()));

ALTER TABLE enrolments ENABLE ROW LEVEL SECURITY; ALTER TABLE enrolments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON enrolments; DROP POLICY IF EXISTS ins ON enrolments; DROP POLICY IF EXISTS upd ON enrolments;
CREATE POLICY sel ON enrolments FOR SELECT USING (app_is_regulator() OR app_owns_programme(programme_id)
  OR student_id = app_student()
  OR app_registrar_covers(programme_id));
CREATE POLICY ins ON enrolments FOR INSERT WITH CHECK (app_owns_programme(programme_id));
CREATE POLICY upd ON enrolments FOR UPDATE USING (app_owns_programme(programme_id)) WITH CHECK (app_owns_programme(programme_id));

ALTER TABLE batch_features ENABLE ROW LEVEL SECURITY; ALTER TABLE batch_features FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON batch_features; DROP POLICY IF EXISTS ins ON batch_features;
CREATE POLICY sel ON batch_features FOR SELECT USING (app_is_regulator() OR app_owns_programme(programme_id));
CREATE POLICY ins ON batch_features FOR INSERT WITH CHECK (app_owns_programme(programme_id)
  AND EXISTS (SELECT 1 FROM upload_batches b WHERE b.id = batch_id AND b.institution_id = app_inst()));

ALTER TABLE programme_category_counters ENABLE ROW LEVEL SECURITY; ALTER TABLE programme_category_counters FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON programme_category_counters; DROP POLICY IF EXISTS upd ON programme_category_counters;
CREATE POLICY sel ON programme_category_counters FOR SELECT USING (app_is_regulator() OR app_owns_programme(programme_id));
CREATE POLICY upd ON programme_category_counters FOR UPDATE USING (app_owns_programme(programme_id)) WITH CHECK (app_owns_programme(programme_id));

ALTER TABLE students ENABLE ROW LEVEL SECURITY; ALTER TABLE students FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON students; DROP POLICY IF EXISTS ins ON students;
CREATE POLICY sel ON students FOR SELECT USING (app_is_regulator() OR id = app_student()
  OR EXISTS (SELECT 1 FROM enrolments e WHERE e.student_id = students.id));
CREATE POLICY ins ON students FOR INSERT WITH CHECK (app_role() = 'institution_admin');

ALTER TABLE duplicate_cases ENABLE ROW LEVEL SECURITY; ALTER TABLE duplicate_cases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON duplicate_cases; DROP POLICY IF EXISTS upd ON duplicate_cases;
CREATE POLICY sel ON duplicate_cases FOR SELECT USING (app_is_regulator() OR EXISTS (SELECT 1 FROM enrolments e WHERE e.id = ANY(enrolment_ids)));
CREATE POLICY upd ON duplicate_cases FOR UPDATE USING (app_role() = 'aicte_officer') WITH CHECK (app_role() = 'aicte_officer');

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
  OR EXISTS (SELECT 1 FROM webhook_endpoints w WHERE w.id = endpoint_id));
CREATE POLICY upd ON webhook_deliveries FOR UPDATE USING (app_role() = 'webhook_dispatcher'
  OR (app_role() = 'institution_admin' AND EXISTS (SELECT 1 FROM webhook_endpoints w WHERE w.id = endpoint_id)));

ALTER TABLE passkeys ENABLE ROW LEVEL SECURITY; ALTER TABLE passkeys FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON passkeys; DROP POLICY IF EXISTS ins ON passkeys; DROP POLICY IF EXISTS upd ON passkeys;
CREATE POLICY sel ON passkeys FOR SELECT USING (student_id = app_student() AND kind = app_role());
CREATE POLICY upd ON passkeys FOR UPDATE USING (student_id = app_student() AND kind = app_role() AND app_scope() = '')
  WITH CHECK (student_id = app_student() AND kind = app_role());
ALTER TABLE activation_codes ENABLE ROW LEVEL SECURITY; ALTER TABLE activation_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE webauthn_challenges ENABLE ROW LEVEL SECURITY; ALTER TABLE webauthn_challenges FORCE ROW LEVEL SECURITY;

ALTER TABLE flag_reviews ENABLE ROW LEVEL SECURITY; ALTER TABLE flag_reviews FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON flag_reviews; DROP POLICY IF EXISTS ins ON flag_reviews;
CREATE POLICY sel ON flag_reviews FOR SELECT USING (app_is_regulator());
CREATE POLICY ins ON flag_reviews FOR INSERT WITH CHECK (app_role() = 'aicte_officer' AND reviewer = current_setting('app.user_id', true));

ALTER TABLE anomaly_flags ENABLE ROW LEVEL SECURITY; ALTER TABLE anomaly_flags FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON anomaly_flags; DROP POLICY IF EXISTS ins ON anomaly_flags;
CREATE POLICY sel ON anomaly_flags FOR SELECT USING (app_is_regulator() OR (app_role() = 'institution_admin' AND institution_id = app_inst()));
CREATE POLICY ins ON anomaly_flags FOR INSERT WITH CHECK (app_role() = 'institution_admin' AND institution_id = app_inst());

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY; ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON audit_logs; DROP POLICY IF EXISTS ins ON audit_logs;
CREATE POLICY sel ON audit_logs FOR SELECT USING (app_is_regulator() OR student_id = app_student());
CREATE POLICY ins ON audit_logs FOR INSERT WITH CHECK (app_role() <> '' AND actor = current_setting('app.user_id', true));

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY; ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON ledger_entries;
CREATE POLICY sel ON ledger_entries FOR SELECT USING (app_is_regulator());

ALTER TABLE ledger_checkpoints ENABLE ROW LEVEL SECURITY; ALTER TABLE ledger_checkpoints FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON ledger_checkpoints; DROP POLICY IF EXISTS ins ON ledger_checkpoints;
CREATE POLICY sel ON ledger_checkpoints FOR SELECT USING (true);
CREATE POLICY ins ON ledger_checkpoints FOR INSERT WITH CHECK (app_role() = 'aicte_officer');

ALTER TABLE status_lists ENABLE ROW LEVEL SECURITY; ALTER TABLE status_lists FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON status_lists;
CREATE POLICY sel ON status_lists FOR SELECT USING (true);
ALTER TABLE issuer_registry ENABLE ROW LEVEL SECURITY; ALTER TABLE issuer_registry FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON issuer_registry;
CREATE POLICY sel ON issuer_registry FOR SELECT USING (true);

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

ALTER TABLE consents ENABLE ROW LEVEL SECURITY; ALTER TABLE consents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON consents; DROP POLICY IF EXISTS ins ON consents; DROP POLICY IF EXISTS upd ON consents;
CREATE POLICY sel ON consents FOR SELECT USING (app_is_regulator() OR student_id = app_student());
CREATE POLICY upd ON consents FOR UPDATE USING (student_id = app_student()) WITH CHECK (student_id = app_student());

DROP FUNCTION IF EXISTS login_lookup(text);
CREATE FUNCTION login_lookup(p_id text)
RETURNS TABLE (id text, role text, institution_id text, student_id bigint, issuer_did text, display_name text, password_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id, role, institution_id, student_id, issuer_did, display_name, password_hash FROM users WHERE id = p_id
$$;

DROP FUNCTION IF EXISTS student_id_for_login(text);
CREATE OR REPLACE FUNCTION student_login_lookup(p_bi text) RETURNS TABLE (id bigint, dob_enc bytea)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app_role() <> '' THEN RAISE EXCEPTION 'student_login_lookup: not allowed'; END IF;
  RETURN QUERY SELECT s.id, s.dob_enc FROM students s WHERE s.apaar_bi = p_bi;
END $$;

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

CREATE OR REPLACE FUNCTION own_correction_count() RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app_role() <> 'institution_admin' THEN RAISE EXCEPTION 'own_correction_count: not allowed'; END IF;
  RETURN (SELECT count(*) FROM ledger_entries WHERE institution_id = app_inst() AND event_type = 'enrolment.updated');
END $$;

CREATE OR REPLACE FUNCTION my_consent_requests()
RETURNS TABLE (id bigint, requester_name text, purpose text, scope_fields text[], status text, granted_by text,
               requested_at timestamptz, expires_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app_role() <> 'verifier' THEN RAISE EXCEPTION 'my_consent_requests: not allowed'; END IF;
  RETURN QUERY SELECT c.id, c.requester_name, c.purpose, c.scope_fields, c.status, c.granted_by, c.requested_at, c.expires_at
                 FROM consents c WHERE c.requester_id = current_setting('app.user_id', true) ORDER BY c.requested_at DESC LIMIT 200;
END $$;

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
    b := uuid_send(gen_random_uuid());
    v_idx := ((get_byte(b, 0) << 16) | (get_byte(b, 1) << 8) | get_byte(b, 2)) % v_size;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM credentials c WHERE c.status_list_id = v_list AND c.status_index = v_idx);
    tries := tries + 1;
    IF tries > 1000 THEN RAISE EXCEPTION 'allocate_status_index: list full'; END IF;
  END LOOP;
  RETURN QUERY SELECT v_list, v_idx;
END $$;

CREATE OR REPLACE FUNCTION set_credential_status(p_cred text, p_purpose text, p_value boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c record; v_list text;
BEGIN
  IF p_purpose NOT IN ('revocation', 'suspension') OR p_value IS NULL THEN RAISE EXCEPTION 'set_credential_status: bad purpose'; END IF;
  IF p_purpose = 'revocation' AND NOT p_value THEN RAISE EXCEPTION 'set_credential_status: revocation is permanent'; END IF;
  SELECT * INTO c FROM credentials WHERE id = p_cred;
  IF c.id IS NULL THEN RAISE EXCEPTION 'set_credential_status: no such credential'; END IF;
  IF NOT ((app_may_issue_for(c.issuer_did) AND c.type <> 'VerificationCredential')
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

CREATE OR REPLACE FUNCTION fuzzy_candidates(p_student bigint, p_bucket int, p_phon text[], p_has_apaar boolean, p_year text)
RETURNS TABLE (enrolment_id bigint, student_id bigint, name_enc bytea, dob_enc bytea, guardian_name_enc bytea)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app_role() <> 'institution_admin' THEN RAISE EXCEPTION 'fuzzy_candidates: not allowed'; END IF;
  IF p_year <> (SELECT max(code) FROM academic_years) THEN RAISE EXCEPTION 'fuzzy_candidates: not the open year'; END IF;
  IF NOT EXISTS (SELECT 1 FROM enrolments e JOIN programmes p ON p.id = e.programme_id
                 WHERE e.student_id = p_student AND e.academic_year = p_year AND e.status = 'active' AND p.institution_id = app_inst()) THEN
    RAISE EXCEPTION 'fuzzy_candidates: caller has no active enrolment for this student';
  END IF;
  RETURN QUERY SELECT e.id, s.id, s.name_enc, s.dob_enc, s.guardian_name_enc
    FROM students s JOIN enrolments e ON e.student_id = s.id JOIN programmes p ON p.id = e.programme_id
    WHERE s.bi_dob_bucket = p_bucket AND s.bi_name_phon && p_phon AND s.id <> p_student
      AND (NOT p_has_apaar OR s.apaar_bi IS NULL)
      AND e.academic_year = p_year AND e.status = 'active' AND p.institution_id <> app_inst()
    ORDER BY e.id LIMIT 50;
END $$;

CREATE OR REPLACE FUNCTION open_fuzzy_case(p_enrolment bigint, p_others bigint[]) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_student bigint; v_year text; cid bigint;
BEGIN
  IF app_role() <> 'institution_admin' THEN RAISE EXCEPTION 'open_fuzzy_case: not allowed'; END IF;
  SELECT e.student_id, e.academic_year INTO v_student, v_year FROM enrolments e JOIN programmes p ON p.id = e.programme_id
   WHERE e.id = p_enrolment AND e.status = 'active' AND p.institution_id = app_inst();
  IF v_student IS NULL THEN RAISE EXCEPTION 'open_fuzzy_case: not an active enrolment of the caller'; END IF;
  IF coalesce(array_length(p_others, 1), 0) = 0 OR EXISTS (
       SELECT 1 FROM unnest(p_others) o LEFT JOIN enrolments e ON e.id = o LEFT JOIN programmes p ON p.id = e.programme_id
       WHERE e.id IS NULL OR e.status <> 'active' OR e.academic_year <> v_year OR p.institution_id = app_inst()) THEN
    RAISE EXCEPTION 'open_fuzzy_case: other enrolments must be active at other institutions';
  END IF;
  INSERT INTO duplicate_cases (student_id, enrolment_ids, status, kind)
  VALUES (v_student, (SELECT array_agg(x ORDER BY x) FROM unnest(p_others || p_enrolment) x), 'flagged', 'fuzzy') RETURNING id INTO cid;
  RETURN cid;
END $$;

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
  PERFORM pg_advisory_xact_lock(42);
  SELECT seq, entry_hash INTO last FROM ledger_entries ORDER BY seq DESC LIMIT 1;
  v_seq := coalesce(last.seq, 0) + 1;
  v_prev := coalesce(last.entry_hash, repeat('0', 64));
  v_ts := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  INSERT INTO ledger_entries (seq, institution_id, event_type, entity_id, payload_hash, prev_hash, entry_hash, ts)
  VALUES (v_seq, p_inst, p_event, p_entity, p_payload_hash, v_prev,
          encode(sha256(convert_to(concat_ws('|', v_prev, v_seq, p_inst, p_event, p_entity, p_payload_hash, v_ts), 'UTF8')), 'hex'),
          v_ts);
END $$;

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

CREATE OR REPLACE FUNCTION consent_credential(p_consent bigint)
RETURNS TABLE (credential_id text, vc_enc bytea, consent_status text, expires_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app_role() <> 'verifier' THEN RAISE EXCEPTION 'consent_credential: not allowed'; END IF;
  RETURN QUERY SELECT c.id, c.vc_enc, k.status, k.expires_at
    FROM consents k LEFT JOIN credentials c ON c.consent_id = k.id
   WHERE k.id = p_consent AND k.requester_id = current_setting('app.user_id', true);
END $$;

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
  IF (EXISTS (SELECT 1 FROM enrolments o JOIN programmes op ON op.id = o.programme_id
               WHERE o.student_id = e.student_id AND o.status = 'active' AND op.institution_id <> app_inst())
      AND NOT EXISTS (SELECT 1 FROM duplicate_cases d WHERE d.student_id = e.student_id AND d.status = 'false_positive'))
     OR EXISTS (SELECT 1 FROM duplicate_cases d WHERE d.student_id = e.student_id AND d.status IN ('flagged', 'under_investigation')) THEN
    RAISE EXCEPTION 'issue_activation_code: record under review' USING ERRCODE = 'P0004';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('activation:' || e.student_id || ':' || p_kind, 0));
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

CREATE OR REPLACE FUNCTION redeem_activation_code(p_bi text, p_code_hash text)
RETURNS TABLE (code_id bigint, student_id bigint, kind text, reissue boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app_role() <> '' THEN RAISE EXCEPTION 'redeem_activation_code: not allowed'; END IF;
  RETURN QUERY UPDATE activation_codes a SET used_at = now()
    FROM students s
   WHERE s.id = a.student_id AND s.apaar_bi = p_bi AND a.code_hash = p_code_hash
     AND a.used_at IS NULL AND a.voided_at IS NULL AND a.expires_at > now()
     AND EXISTS (SELECT 1 FROM enrolments e JOIN programmes p ON p.id = e.programme_id
                  WHERE e.student_id = a.student_id AND e.status = 'active' AND p.institution_id = a.institution_id)
  RETURNING a.id, a.student_id, a.kind, a.reissue;
END $$;

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

CREATE OR REPLACE FUNCTION passkey_for_login(p_credential bytea)
RETURNS TABLE (id bigint, student_id bigint, kind text, public_key bytea, sign_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app_role() <> '' THEN RAISE EXCEPTION 'passkey_for_login: not allowed'; END IF;
  RETURN QUERY SELECT k.id, k.student_id, k.kind, k.public_key, k.sign_count FROM passkeys k
   WHERE k.credential_id = p_credential AND k.revoked_at IS NULL;
END $$;

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
            now() + make_interval(hours => GREATEST(CASE WHEN c.reissue THEN 24 ELSE 0 END, GREATEST(p_first_cooldown_hours, 0))), c.id)
    RETURNING *;
END $$;

CREATE OR REPLACE FUNCTION revoke_own_passkey(p_id bigint) RETURNS SETOF passkeys
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app_scope() <> '' OR app_student() IS NULL THEN RAISE EXCEPTION 'revoke_own_passkey: not allowed'; END IF;
  RETURN QUERY UPDATE passkeys k SET revoked_at = coalesce(k.revoked_at, now())
   WHERE k.id = p_id AND k.student_id = app_student() AND k.kind = app_role() RETURNING *;
END $$;

CREATE OR REPLACE FUNCTION activation_reissue_counts() RETURNS TABLE (institution_id text, reissues bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_is_regulator() THEN RAISE EXCEPTION 'activation_reissue_counts: not allowed'; END IF;
  RETURN QUERY SELECT a.institution_id, count(*) FROM activation_codes a WHERE a.reissue GROUP BY a.institution_id;
END $$;

CREATE OR REPLACE FUNCTION shared_student_edges(p_year text)
RETURNS TABLE (inst_a text, inst_b text, active_shared bigint, historical_shared bigint, carousel bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT app_is_regulator() THEN
    RAISE EXCEPTION 'shared_student_edges: regulators only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH win AS (SELECT y.code FROM academic_years y WHERE y.code <= p_year ORDER BY y.code DESC LIMIT 3),
  multi AS (SELECT en.student_id FROM enrolments en WHERE en.academic_year IN (SELECT code FROM win)
             GROUP BY en.student_id HAVING count(*) > 1),
  e AS (SELECT en.id, en.student_id, p.institution_id AS inst, en.status, en.academic_year, en.admission_date
          FROM enrolments en JOIN multi m ON m.student_id = en.student_id JOIN programmes p ON p.id = en.programme_id
          JOIN students s ON s.id = en.student_id
         WHERE s.apaar_bi IS NOT NULL AND en.academic_year IN (SELECT code FROM win)),
  pairs AS (SELECT x.student_id, x.inst AS a, y.inst AS b,
                   bool_or(x.status = 'active' AND y.status = 'active' AND x.academic_year = p_year AND y.academic_year = p_year) AS both_active
              FROM e x JOIN e y ON y.student_id = x.student_id AND x.inst < y.inst
             GROUP BY 1, 2, 3),
  seq AS (SELECT e.student_id, e.inst, lag(e.inst) OVER w AS prev, lag(e.inst, 2) OVER w AS prev2
            FROM e WINDOW w AS (PARTITION BY e.student_id ORDER BY e.admission_date, e.id)),
  car AS (SELECT DISTINCT q.student_id, least(q.inst, q.prev) AS a, greatest(q.inst, q.prev) AS b
            FROM seq q WHERE q.prev2 = q.inst AND q.prev <> q.inst)
  SELECT pr.a, pr.b, count(*) FILTER (WHERE pr.both_active), count(*) FILTER (WHERE NOT pr.both_active),
         (SELECT count(*) FROM car c WHERE c.a = pr.a AND c.b = pr.b)
    FROM pairs pr GROUP BY pr.a, pr.b ORDER BY pr.a, pr.b;
END $$;

REVOKE ALL ON FUNCTION login_lookup(text), active_enrolment_owners(text[], text), student_id_by_bi(text),
  open_duplicate_case(bigint, text), fuzzy_candidates(bigint, int, text[], boolean, text), open_fuzzy_case(bigint, bigint[]),
  ledger_append(text, text, bigint, text), student_login_lookup(text),
  allocate_status_index(text), set_credential_status(text, text, boolean), log_verification(text, text, text, text),
  consent_credential(bigint), revoke_enrolment_credentials(bigint),
  request_consent(text, text, text[], int, text, text), my_consent_requests(), own_correction_count(), apply_case_resolution(bigint, bigint),
  enqueue_event(text, jsonb, text), enqueue_case_event(bigint, text, jsonb),
  issue_activation_code(bigint, text, text, text, text), redeem_activation_code(text, text),
  store_challenge(bytea, text, bigint, text), take_challenge(bytea, text), passkey_for_login(bytea),
  activation_reissue_counts(), register_passkey(bytea, bytea, bigint, text[], int), revoke_own_passkey(bigint),
  shared_student_edges(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION login_lookup(text), active_enrolment_owners(text[], text), student_id_by_bi(text),
  open_duplicate_case(bigint, text), fuzzy_candidates(bigint, int, text[], boolean, text), open_fuzzy_case(bigint, bigint[]),
  ledger_append(text, text, bigint, text), student_login_lookup(text),
  allocate_status_index(text), set_credential_status(text, text, boolean), log_verification(text, text, text, text),
  consent_credential(bigint), revoke_enrolment_credentials(bigint),
  request_consent(text, text, text[], int, text, text), my_consent_requests(), own_correction_count(), apply_case_resolution(bigint, bigint),
  enqueue_event(text, jsonb, text), enqueue_case_event(bigint, text, jsonb),
  issue_activation_code(bigint, text, text, text, text), redeem_activation_code(text, text),
  store_challenge(bytea, text, bigint, text), take_challenge(bytea, text), passkey_for_login(bytea),
  activation_reissue_counts(), register_passkey(bytea, bytea, bigint, text[], int), revoke_own_passkey(bigint),
  shared_student_edges(text) TO app_user;

GRANT SELECT ON access_requests TO app_user;
ALTER TABLE account_codes ENABLE ROW LEVEL SECURITY; ALTER TABLE account_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY; ALTER TABLE access_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON access_requests;
CREATE POLICY sel ON access_requests FOR SELECT USING (app_is_regulator());

CREATE OR REPLACE FUNCTION public_stats(p_year text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH rep AS (SELECT DISTINCT b.institution_id FROM upload_batches b JOIN institutions i ON i.id = b.institution_id
               WHERE b.status = 'completed' AND i.status = 'approved'),
  stu AS (SELECT p.institution_id, count(*) n FROM enrolments e JOIN programmes p ON p.id = e.programme_id
           WHERE e.academic_year = p_year AND e.status = 'active' GROUP BY 1),
  st AS (SELECT i.state, count(*) FILTER (WHERE i.status = 'approved') institutions, count(rep.institution_id) reporting,
                coalesce(sum(stu.n), 0)::bigint students
           FROM institutions i LEFT JOIN rep ON rep.institution_id = i.id LEFT JOIN stu ON stu.institution_id = i.id
          GROUP BY i.state)
  SELECT jsonb_build_object(
    'institutions_approved', (SELECT count(*) FROM institutions i WHERE i.status = 'approved'),
    'institutions_reporting', (SELECT count(*) FROM rep),
    'students_recorded', (SELECT coalesce(sum(n), 0) FROM stu),
    'credentials_issued', (SELECT count(*) FROM credentials),
    'states', coalesce((SELECT jsonb_agg(to_jsonb(st) ORDER BY st.state) FROM st), '[]'::jsonb))
$$;

CREATE OR REPLACE FUNCTION public_account_search(p_q text, p_state text, p_kind text, p_limit int)
RETURNS TABLE (id text, name text, state text, kind text, login_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT x.* FROM (
    SELECT DISTINCT ON (i.id) i.id, i.name, i.state, 'institution'::text AS kind, u.id AS login_id
      FROM institutions i JOIN users u ON u.institution_id = i.id AND u.role = 'institution_admin'
     WHERE p_kind = 'institution' AND (p_state IS NULL OR i.state = p_state)
       AND (p_q IS NULL OR i.name ILIKE '%' || p_q || '%' OR i.id ILIKE p_q || '%')
     ORDER BY i.id, u.id) x
  UNION ALL
  SELECT r.did, r.name, NULL, 'university'::text, u.id
    FROM issuer_registry r JOIN users u ON u.issuer_did = r.did AND u.role = 'university_registrar'
   WHERE p_kind = 'university' AND r.kind = 'university' AND p_state IS NULL AND (p_q IS NULL OR r.name ILIKE '%' || p_q || '%')
  ORDER BY 2 LIMIT least(greatest(p_limit, 1), 20)
$$;

CREATE OR REPLACE FUNCTION issue_account_code(p_user text, p_code_hash text, p_reason text, p_idem text, p_req_hash text)
RETURNS TABLE (code_id bigint, user_id text, display_name text, replay boolean, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u record; prev record; cid bigint; exp timestamptz;
BEGIN
  IF app_role() <> 'aicte_officer' THEN RAISE EXCEPTION 'issue_account_code: not allowed' USING ERRCODE = 'P0002'; END IF;
  SELECT x.id, x.display_name INTO u FROM users x
   WHERE x.id = p_user AND x.role IN ('institution_admin', 'university_registrar', 'verifier');
  IF u.id IS NULL THEN RAISE EXCEPTION 'issue_account_code: no such account' USING ERRCODE = 'P0002'; END IF;
  IF p_idem IS NOT NULL THEN
    SELECT a.* INTO prev FROM account_codes a WHERE a.issued_by = current_setting('app.user_id', true) AND a.idempotency_key = p_idem;
    IF prev.id IS NOT NULL THEN
      IF prev.request_hash <> p_req_hash THEN RAISE EXCEPTION 'idempotency key reused' USING ERRCODE = 'P0003'; END IF;
      RETURN QUERY SELECT prev.id, u.id, u.display_name, true, prev.expires_at;
      RETURN;
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('account:' || u.id, 0));
  UPDATE account_codes a SET voided_at = now() WHERE a.user_id = u.id AND a.used_at IS NULL AND a.voided_at IS NULL;
  exp := now() + interval '7 days';
  INSERT INTO account_codes (user_id, code_hash, issued_by, reason, idempotency_key, request_hash, expires_at)
  VALUES (u.id, p_code_hash, current_setting('app.user_id', true), p_reason, p_idem, p_req_hash, exp) RETURNING id INTO cid;
  RETURN QUERY SELECT cid, u.id, u.display_name, false, exp;
END $$;

CREATE OR REPLACE FUNCTION redeem_account_code(p_user text, p_code_hash text, p_password_hash text, p_request_id text)
RETURNS TABLE (user_id text, role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE cid bigint; r text;
BEGIN
  IF app_role() <> '' THEN RAISE EXCEPTION 'redeem_account_code: not allowed'; END IF;
  UPDATE account_codes a SET used_at = now()
   WHERE a.user_id = p_user AND a.code_hash = p_code_hash AND a.used_at IS NULL AND a.voided_at IS NULL AND a.expires_at > now()
  RETURNING a.id INTO cid;
  IF cid IS NULL THEN RETURN; END IF;
  UPDATE users x SET password_hash = p_password_hash WHERE x.id = p_user RETURNING x.role INTO r;
  INSERT INTO audit_logs (actor, role, action, entity, entity_id, request_id)
  VALUES (p_user, r, 'account.activate', 'account_code', cid::text, p_request_id);
  RETURN QUERY SELECT p_user, r;
END $$;

CREATE OR REPLACE FUNCTION create_access_request(p_id bigint, p_org text, p_name_enc bytea, p_email_enc bytea, p_purpose text,
                                                 p_request_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app_role() <> '' OR p_id <> currval('access_requests_id_seq') THEN RAISE EXCEPTION 'create_access_request: not allowed'; END IF;
  INSERT INTO access_requests (id, organisation, contact_name_enc, contact_email_enc, purpose)
  VALUES (p_id, p_org, p_name_enc, p_email_enc, p_purpose);
  INSERT INTO audit_logs (actor, role, action, entity, entity_id, request_id)
  VALUES ('anonymous', 'public', 'access_request.create', 'access_request', p_id::text, p_request_id);
END $$;

CREATE OR REPLACE FUNCTION decide_access_request(p_id bigint, p_decision text, p_reason text, p_new_user text)
RETURNS SETOF access_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record;
BEGIN
  IF app_role() <> 'aicte_officer' OR p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'decide_access_request: not allowed' USING ERRCODE = 'P0002';
  END IF;
  SELECT a.* INTO r FROM access_requests a WHERE a.id = p_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'decide_access_request: not found' USING ERRCODE = 'P0002'; END IF;
  IF r.status <> 'pending' THEN RETURN QUERY SELECT a.* FROM access_requests a WHERE a.id = p_id; RETURN; END IF;
  IF p_decision = 'approved' THEN
    INSERT INTO users (id, role, display_name) VALUES (p_new_user, 'verifier', r.organisation);
  END IF;
  RETURN QUERY UPDATE access_requests a SET status = p_decision, decided_by = current_setting('app.user_id', true),
      decision_reason = p_reason, decided_at = now(), user_id = CASE WHEN p_decision = 'approved' THEN p_new_user END
    WHERE a.id = p_id RETURNING a.*;
END $$;

REVOKE ALL ON FUNCTION public_stats(text), public_account_search(text, text, text, int),
  issue_account_code(text, text, text, text, text), redeem_account_code(text, text, text, text),
  create_access_request(bigint, text, bytea, bytea, text, text), decide_access_request(bigint, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_stats(text), public_account_search(text, text, text, int),
  issue_account_code(text, text, text, text, text), redeem_account_code(text, text, text, text),
  create_access_request(bigint, text, bytea, bytea, text, text), decide_access_request(bigint, text, text, text) TO app_user;
