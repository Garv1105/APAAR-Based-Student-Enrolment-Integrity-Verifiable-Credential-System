CREATE TABLE IF NOT EXISTS institutions (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  state         text NOT NULL,
  status        text NOT NULL CHECK (status IN ('approved','closed','progressive_closure'))
);

CREATE TABLE IF NOT EXISTS academic_years (
  code          text PRIMARY KEY,
  window_start  date NOT NULL,
  window_end    date NOT NULL,
  deadline      timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS programmes (
  id             text PRIMARY KEY,
  institution_id text NOT NULL REFERENCES institutions(id),
  code           text NOT NULL,
  name           text NOT NULL,
  level          text NOT NULL,
  duration_years int  NOT NULL,
  UNIQUE (institution_id, code)
);

CREATE TABLE IF NOT EXISTS approved_intake (
  programme_id    text NOT NULL REFERENCES programmes(id),
  academic_year   text NOT NULL REFERENCES academic_years(code),
  approved_intake int  NOT NULL CHECK (approved_intake >= 0),
  source_eoa_ref  text NOT NULL,
  PRIMARY KEY (programme_id, academic_year)
);

CREATE TABLE IF NOT EXISTS intake_history (
  programme_id  text NOT NULL REFERENCES programmes(id),
  academic_year text NOT NULL,
  approved      int  NOT NULL,
  filled        int  NOT NULL,
  foreign_filled int,
  PRIMARY KEY (programme_id, academic_year)
);

CREATE TABLE IF NOT EXISTS seat_categories (
  code          text PRIMARY KEY,
  scope         text NOT NULL CHECK (scope IN ('within_intake','supernumerary')),
  cap_rule_json jsonb NOT NULL,
  handbook_ref  text NOT NULL
);

CREATE TABLE IF NOT EXISTS programme_category_counters (
  programme_id  text NOT NULL REFERENCES programmes(id),
  academic_year text NOT NULL,
  category_code text NOT NULL,
  filled        int  NOT NULL DEFAULT 0,
  cap           int  NOT NULL,
  PRIMARY KEY (programme_id, academic_year, category_code)
);

CREATE TABLE IF NOT EXISTS users (
  id             text PRIMARY KEY,
  role           text NOT NULL CHECK (role IN ('institution_admin','aicte_officer','auditor','verifier','student','university_registrar')),
  institution_id text REFERENCES institutions(id),
  student_id     bigint,
  issuer_did     text,
  display_name   text NOT NULL,
  password_hash  text
);

CREATE TABLE IF NOT EXISTS students (
  id                bigserial PRIMARY KEY,
  apaar_enc         bytea,
  apaar_bi          text UNIQUE,
  apaar_masked      text,
  apaar_status      text NOT NULL CHECK (apaar_status IN ('VERIFIED','REFUSED','NOT_GENERATED','PENDING','MISMATCH')),
  provisional_id    text UNIQUE,
  name_enc          bytea NOT NULL,
  dob_enc           bytea NOT NULL,
  guardian_name_enc bytea,
  bi_dob_bucket     int,
  bi_name_phon      text[],
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (apaar_bi IS NOT NULL OR provisional_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS upload_batches (
  id              bigserial PRIMARY KEY,
  institution_id  text NOT NULL REFERENCES institutions(id),
  channel         text NOT NULL CHECK (channel IN ('portal_csv','api_json')),
  status          text NOT NULL CHECK (status IN ('processing','completed','failed')),
  row_counts_json jsonb NOT NULL DEFAULT '{}',
  idempotency_key text,
  request_hash    text NOT NULL,
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS enrolments (
  id                 bigserial PRIMARY KEY,
  student_id         bigint NOT NULL REFERENCES students(id),
  programme_id       text   NOT NULL REFERENCES programmes(id),
  academic_year      text   NOT NULL REFERENCES academic_years(code),
  institution_student_id text NOT NULL,
  status             text   NOT NULL CHECK (status IN ('active','withdrawn','migrated','completed')),
  seat_category_code text   NOT NULL REFERENCES seat_categories(code),
  is_supernumerary   boolean NOT NULL,
  is_lateral_entry   boolean NOT NULL,
  year_of_study      int    NOT NULL,
  is_nri boolean NOT NULL, is_oci boolean NOT NULL, is_fn boolean NOT NULL, is_ciwg boolean NOT NULL,
  admission_date     date   NOT NULL,
  ended_on           date,
  batch_id           bigint NOT NULL REFERENCES upload_batches(id)
);
CREATE INDEX IF NOT EXISTS enrolments_dup_idx ON enrolments (student_id, academic_year, status);
CREATE INDEX IF NOT EXISTS enrolments_programme_idx ON enrolments (programme_id, academic_year, status);
CREATE INDEX IF NOT EXISTS upload_batches_inst_idx ON upload_batches (institution_id);

CREATE TABLE IF NOT EXISTS validation_issues (
  id        bigserial PRIMARY KEY,
  batch_id  bigint NOT NULL REFERENCES upload_batches(id),
  row_no    int    NOT NULL,
  code      text   NOT NULL,
  severity  text   NOT NULL CHECK (severity IN ('error','warning','flag')),
  field     text,
  params    jsonb  NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS validation_issues_batch_idx ON validation_issues (batch_id);

CREATE TABLE IF NOT EXISTS batch_features (
  batch_id          bigint NOT NULL REFERENCES upload_batches(id),
  programme_id      text   NOT NULL REFERENCES programmes(id),
  rows              int    NOT NULL,
  max_dob_cluster   int    NOT NULL,
  longest_apaar_run int    NOT NULL,
  minutes_before_deadline double precision NOT NULL,
  PRIMARY KEY (batch_id, programme_id)
);
CREATE INDEX IF NOT EXISTS batch_features_programme_idx ON batch_features (programme_id);

CREATE TABLE IF NOT EXISTS duplicate_cases (
  id            bigserial PRIMARY KEY,
  student_id    bigint NOT NULL REFERENCES students(id),
  enrolment_ids bigint[] NOT NULL,
  status        text NOT NULL CHECK (status IN ('flagged','confirmed_duplicate','false_positive','under_investigation')),
  resolution_note text,
  resolved_by   text,
  resolved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE duplicate_cases ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'exact' CHECK (kind IN ('exact','fuzzy'));
CREATE INDEX IF NOT EXISTS students_dob_bucket_idx ON students (bi_dob_bucket);

CREATE TABLE IF NOT EXISTS anomaly_flags (
  id             bigserial PRIMARY KEY,
  institution_id text NOT NULL REFERENCES institutions(id),
  programme_id   text REFERENCES programmes(id),
  type           text NOT NULL,
  score          double precision NOT NULL,
  evidence_json  jsonb NOT NULL,
  status         text NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS issuer_registry (
  did            text PRIMARY KEY,
  kind           text NOT NULL CHECK (kind IN ('institution','university')),
  institution_id text REFERENCES institutions(id),
  name           text NOT NULL,
  public_keys_json jsonb NOT NULL,
  status         text NOT NULL CHECK (status IN ('active','suspended','revoked')),
  valid_from     timestamptz NOT NULL,
  valid_until    timestamptz
);

CREATE TABLE IF NOT EXISTS affiliations (
  university_did text NOT NULL REFERENCES issuer_registry(did),
  institution_id text NOT NULL REFERENCES institutions(id),
  PRIMARY KEY (university_did, institution_id)
);

CREATE TABLE IF NOT EXISTS status_lists (
  id            text PRIMARY KEY,
  issuer_did    text NOT NULL REFERENCES issuer_registry(did),
  purpose       text NOT NULL CHECK (purpose IN ('revocation','suspension')),
  bits          bytea NOT NULL,
  version       int   NOT NULL DEFAULT 1,
  UNIQUE (issuer_did, purpose)
);

CREATE TABLE IF NOT EXISTS consents (
  id            bigserial PRIMARY KEY,
  student_id    bigint REFERENCES students(id),
  requester_id  text   NOT NULL REFERENCES users(id),
  requester_name text  NOT NULL,
  purpose       text   NOT NULL,
  scope_fields  text[] NOT NULL,
  status        text   NOT NULL CHECK (status IN ('pending','granted','denied','revoked')),
  granted_by    text CHECK (granted_by IN ('student','guardian')),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  granted_at    timestamptz,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  artifact_sig  text
);

CREATE TABLE IF NOT EXISTS credentials (
  id             text PRIMARY KEY,
  type           text NOT NULL CHECK (type IN ('EnrolmentCredential','DegreeCredential','VerificationCredential')),
  enrolment_id   bigint REFERENCES enrolments(id),
  consent_id     bigint REFERENCES consents(id),
  subject_student_id bigint NOT NULL REFERENCES students(id),
  issuer_did     text NOT NULL REFERENCES issuer_registry(did),
  status_list_id text NOT NULL REFERENCES status_lists(id),
  status_index   int  NOT NULL,
  issued_at      timestamptz NOT NULL DEFAULT now(),
  vc_enc         bytea NOT NULL,
  vc_hash        text NOT NULL,
  idempotency_key text,
  request_hash   text,
  UNIQUE (status_list_id, status_index),
  UNIQUE (issuer_did, idempotency_key),
  UNIQUE (consent_id)
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  seq            bigserial PRIMARY KEY,
  institution_id text NOT NULL,
  event_type     text NOT NULL,
  entity_id      bigint NOT NULL,
  payload_hash   text NOT NULL,
  prev_hash      text NOT NULL,
  entry_hash     text NOT NULL,
  ts             text NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_checkpoints (
  id           bigserial PRIMARY KEY,
  upto_seq     bigint NOT NULL,
  root_hash    text   NOT NULL,
  aicte_sig    text   NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         bigserial PRIMARY KEY,
  actor      text NOT NULL,
  role       text NOT NULL,
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text,
  student_id bigint,
  reason     text,
  request_id text,
  ts         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_student_idx ON audit_logs (student_id);

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id              bigserial PRIMARY KEY,
  institution_id  text NOT NULL REFERENCES institutions(id),
  url             text NOT NULL,
  events          text[] NOT NULL,
  secret_enc      bytea NOT NULL,
  secret_fp       text NOT NULL,
  prev_secret_enc bytea,
  prev_expires_at timestamptz,
  active          boolean NOT NULL DEFAULT true,
  idempotency_key text,
  request_hash    text,
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id               bigserial PRIMARY KEY,
  endpoint_id      bigint NOT NULL REFERENCES webhook_endpoints(id),
  event_id         uuid NOT NULL,
  event_type       text NOT NULL,
  payload          jsonb NOT NULL,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed','cancelled')),
  attempts         int NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  last_status_code int,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  delivered_at     timestamptz
);
CREATE INDEX IF NOT EXISTS webhook_deliveries_due_idx ON webhook_deliveries (next_attempt_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS activation_codes (
  id             bigserial PRIMARY KEY,
  student_id     bigint NOT NULL REFERENCES students(id),
  kind           text NOT NULL CHECK (kind IN ('student','guardian')),
  code_hash      text NOT NULL UNIQUE,
  institution_id text NOT NULL REFERENCES institutions(id),
  issued_by      text NOT NULL,
  reissue        boolean NOT NULL,
  idempotency_key text,
  request_hash   text,
  expires_at     timestamptz NOT NULL,
  used_at        timestamptz,
  registered_at  timestamptz,
  voided_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS passkeys (
  id            bigserial PRIMARY KEY,
  student_id    bigint NOT NULL REFERENCES students(id),
  kind          text NOT NULL CHECK (kind IN ('student','guardian')),
  credential_id bytea NOT NULL UNIQUE,
  public_key    bytea NOT NULL,
  sign_count    bigint NOT NULL,
  transports    text[],
  approve_after timestamptz NOT NULL DEFAULT now(),
  activation_code_id bigint REFERENCES activation_codes(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  challenge   bytea PRIMARY KEY,
  purpose     text NOT NULL CHECK (purpose IN ('register','login','consent')),
  student_id  bigint,
  kind        text,
  consent_id  bigint,
  terms_hash  text,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);

CREATE TABLE IF NOT EXISTS flag_reviews (
  id                bigserial PRIMARY KEY,
  flag_key          text NOT NULL,
  rule              text NOT NULL,
  institution_id    text NOT NULL,
  academic_year     text NOT NULL,
  decision          text NOT NULL CHECK (decision IN ('confirmed','dismissed','needs_info')),
  reason            text NOT NULL CHECK (length(reason) >= 10),
  evidence_snapshot jsonb NOT NULL,
  reviewer          text NOT NULL,
  idempotency_key   text,
  request_hash      text,
  reviewed_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reviewer, idempotency_key)
);
CREATE INDEX IF NOT EXISTS flag_reviews_key_idx ON flag_reviews (flag_key);

CREATE TABLE IF NOT EXISTS account_codes (
  id              bigserial PRIMARY KEY,
  user_id         text NOT NULL REFERENCES users(id),
  code_hash       text NOT NULL UNIQUE,
  issued_by       text NOT NULL,
  reason          text NOT NULL,
  idempotency_key text,
  request_hash    text NOT NULL,
  expires_at      timestamptz NOT NULL,
  used_at         timestamptz,
  voided_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issued_by, idempotency_key)
);

CREATE TABLE IF NOT EXISTS access_requests (
  id                bigserial PRIMARY KEY,
  organisation      text NOT NULL,
  contact_name_enc  bytea NOT NULL,
  contact_email_enc bytea NOT NULL,
  purpose           text NOT NULL,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by        text,
  decision_reason   text,
  decided_at        timestamptz,
  user_id           text REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);
