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

-- ---------- privileges ----------
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_user;
GRANT USAGE ON SCHEMA public TO app_user;
-- users is NOT granted: password hashes are reachable only through login_lookup()
GRANT SELECT ON institutions, programmes, approved_intake, seat_categories, academic_years, intake_history TO app_user;
GRANT SELECT, INSERT, UPDATE ON upload_batches, validation_issues, enrolments, students, programme_category_counters,
  duplicate_cases, anomaly_flags, consents, credentials, status_lists, issuer_registry TO app_user;
GRANT SELECT, INSERT ON audit_logs, ledger_checkpoints TO app_user;
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
CREATE POLICY sel ON enrolments FOR SELECT USING (app_is_regulator() OR app_owns_programme(programme_id));
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
CREATE POLICY sel ON students FOR SELECT USING (app_is_regulator() OR EXISTS (SELECT 1 FROM enrolments e WHERE e.student_id = students.id));
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

-- audit_logs: anyone authenticated may append as themselves; only regulators read (students: own, later)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY; ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel ON audit_logs; DROP POLICY IF EXISTS ins ON audit_logs;
CREATE POLICY sel ON audit_logs FOR SELECT USING (app_is_regulator());
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

-- credential/consent tables: RLS on with no policies = deny all, until their features add policies
ALTER TABLE consents ENABLE ROW LEVEL SECURITY; ALTER TABLE consents FORCE ROW LEVEL SECURITY;
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY; ALTER TABLE credentials FORCE ROW LEVEL SECURITY;
ALTER TABLE status_lists ENABLE ROW LEVEL SECURITY; ALTER TABLE status_lists FORCE ROW LEVEL SECURITY;
ALTER TABLE issuer_registry ENABLE ROW LEVEL SECURITY; ALTER TABLE issuer_registry FORCE ROW LEVEL SECURITY;

-- ---------- SECURITY DEFINER functions (the only cross-institution paths) ----------
CREATE OR REPLACE FUNCTION login_lookup(p_id text)
RETURNS TABLE (id text, role text, institution_id text, student_id bigint, display_name text, password_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id, role, institution_id, student_id, display_name, password_hash FROM users WHERE id = p_id
$$;

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

REVOKE ALL ON FUNCTION login_lookup(text), active_enrolment_owners(text[], text), student_id_by_bi(text),
  open_duplicate_case(bigint, text), ledger_append(text, text, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION login_lookup(text), active_enrolment_owners(text[], text), student_id_by_bi(text),
  open_duplicate_case(bigint, text), ledger_append(text, text, bigint, text) TO app_user;
