-- UPI Tracker: initial schema. PostgreSQL 14+.
-- Money is stored as integer paise. Never NUMERIC/float for amounts.
BEGIN;


CREATE TYPE user_role          AS ENUM ('user', 'support', 'admin');
CREATE TYPE txn_direction      AS ENUM ('debit', 'credit');
CREATE TYPE txn_status         AS ENUM ('confirmed', 'pending', 'failed', 'reversed');
CREATE TYPE txn_kind           AS ENUM ('normal', 'refund', 'reversal', 'self_transfer');
CREATE TYPE txn_channel        AS ENUM ('upi', 'bank_transfer', 'card', 'cash', 'other');
CREATE TYPE payment_app        AS ENUM ('gpay', 'phonepe', 'paytm', 'bhim', 'bank_app', 'unknown');
CREATE TYPE source_kind        AS ENUM ('account_aggregator', 'notification', 'csv', 'pdf', 'manual');
CREATE TYPE consent_status     AS ENUM ('pending', 'active', 'paused', 'revoked', 'expired', 'rejected');
CREATE TYPE sync_status        AS ENUM ('queued', 'running', 'succeeded', 'failed', 'partial');
CREATE TYPE connection_status  AS ENUM ('pending_consent', 'connected', 'disconnected', 'error');

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$ LANGUAGE plpgsql;

-- ───────────── identity ─────────────
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text,
  mobile        text,
  password_hash text,                    -- argon2id; never plaintext
  role          user_role NOT NULL DEFAULT 'user',
  refresh_token_hash text,               -- hash of current refresh token (rotation)
  biometric_enrolled boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CONSTRAINT users_contact_chk CHECK (email IS NOT NULL OR mobile IS NOT NULL)
);
CREATE UNIQUE INDEX users_email_uq  ON users (lower(email))  WHERE email  IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX users_mobile_uq ON users (mobile)        WHERE mobile IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE user_profiles (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name     text,
  avatar_url    text,
  theme         text NOT NULL DEFAULT 'system' CHECK (theme IN ('light','dark','system')),
  timezone      text NOT NULL DEFAULT 'Asia/Kolkata',
  currency      char(3) NOT NULL DEFAULT 'INR',
  ai_consent    boolean NOT NULL DEFAULT false, -- explicit opt-in before any data leaves for an AI provider
  notify_budget boolean NOT NULL DEFAULT true,
  notify_sync   boolean NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ───────────── accounts & consent ─────────────
CREATE TABLE financial_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution   text NOT NULL,           -- e.g. "HDFC Bank"
  account_type  text NOT NULL DEFAULT 'savings',
  mask          text,                    -- last 4 only; never the full number
  nickname      text,
  balance_paise bigint,
  balance_source text CHECK (balance_source IN ('bank_reported','estimated')),
  balance_as_of timestamptz,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX financial_accounts_user_idx ON financial_accounts (user_id);

CREATE TABLE account_connections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id    uuid NOT NULL REFERENCES financial_accounts(id) ON DELETE CASCADE,
  provider      text NOT NULL,           -- 'sandbox' | '<licensed AA partner>'
  is_sandbox    boolean NOT NULL DEFAULT true,
  status        connection_status NOT NULL DEFAULT 'pending_consent',
  provider_ref  text,                    -- provider's handle; opaque
  last_synced_at timestamptz,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_connections_user_idx ON account_connections (user_id);
CREATE INDEX account_connections_account_idx ON account_connections (account_id);

CREATE TABLE consent_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id    uuid REFERENCES financial_accounts(id) ON DELETE CASCADE, -- NULL = all accounts
  connection_id uuid REFERENCES account_connections(id) ON DELETE SET NULL,
  source        source_kind NOT NULL,
  purpose       text NOT NULL,
  status        consent_status NOT NULL DEFAULT 'pending',
  provider_consent_id text,
  data_from     timestamptz,
  data_to       timestamptz,
  granted_at    timestamptz,
  expires_at    timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consent_records_user_idx ON consent_records (user_id, status);
CREATE INDEX consent_records_account_idx ON consent_records (account_id);

CREATE TABLE data_sync_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES account_connections(id) ON DELETE CASCADE,
  source        source_kind NOT NULL,
  status        sync_status NOT NULL DEFAULT 'queued',
  started_at    timestamptz,
  finished_at   timestamptz,
  fetched_count int NOT NULL DEFAULT 0,
  saved_count   int NOT NULL DEFAULT 0,
  duplicate_count int NOT NULL DEFAULT 0,
  rejected_count  int NOT NULL DEFAULT 0,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX data_sync_jobs_user_idx ON data_sync_jobs (user_id, created_at DESC);

-- ───────────── reference data ─────────────
CREATE TABLE transaction_categories (
  id            text PRIMARY KEY,        -- stable slug, matches @upi/core CATEGORIES
  user_id       uuid REFERENCES users(id) ON DELETE CASCADE, -- NULL = system category
  label         text NOT NULL,
  icon          text NOT NULL,
  color         text NOT NULL,
  is_income     boolean NOT NULL DEFAULT false
);

CREATE TABLE merchants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  category_id   text REFERENCES transaction_categories(id),
  user_confirmed boolean NOT NULL DEFAULT false, -- user taught us this mapping
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
CREATE INDEX merchants_category_idx ON merchants (category_id);

-- ───────────── transactions ─────────────
CREATE TABLE transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id    uuid NOT NULL REFERENCES financial_accounts(id) ON DELETE CASCADE,
  merchant_id   uuid REFERENCES merchants(id) ON DELETE SET NULL,
  category_id   text NOT NULL REFERENCES transaction_categories(id),
  direction     txn_direction NOT NULL,
  amount_paise  bigint NOT NULL CHECK (amount_paise > 0),
  currency      char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  occurred_at   timestamptz NOT NULL,
  day_key       date NOT NULL,           -- IST calendar day; drives all daily/monthly maths
  status        txn_status NOT NULL DEFAULT 'confirmed',
  kind          txn_kind NOT NULL DEFAULT 'normal',
  channel       txn_channel NOT NULL DEFAULT 'other',
  payment_app   payment_app NOT NULL DEFAULT 'unknown',
  merchant_name text NOT NULL,
  narration     text NOT NULL,
  reference     text,                    -- UPI RRN / UTR / bank ref
  needs_review  boolean NOT NULL DEFAULT false,
  linked_transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  fingerprint   text NOT NULL,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Duplicate prevention at the database level (engine also dedupes in code).
  CONSTRAINT transactions_fingerprint_uq UNIQUE (user_id, fingerprint)
);
-- Same bank reference on the same account/amount/direction can exist only once.
CREATE UNIQUE INDEX transactions_reference_uq
  ON transactions (user_id, account_id, reference, amount_paise, direction)
  WHERE reference IS NOT NULL;
CREATE INDEX transactions_user_idx      ON transactions (user_id);
CREATE INDEX transactions_date_idx      ON transactions (user_id, day_key DESC, occurred_at DESC);
CREATE INDEX transactions_type_idx      ON transactions (user_id, direction);
CREATE INDEX transactions_reference_idx ON transactions (reference) WHERE reference IS NOT NULL;
CREATE INDEX transactions_account_idx   ON transactions (account_id);
CREATE INDEX transactions_category_idx  ON transactions (user_id, category_id);
CREATE INDEX transactions_review_idx    ON transactions (user_id) WHERE needs_review;

-- One row per raw record that produced/merged into a transaction. Originals are never mutated.
CREATE TABLE transaction_sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint   text NOT NULL,           -- fingerprint of THIS raw record
  source        source_kind NOT NULL,
  sync_job_id   uuid REFERENCES data_sync_jobs(id) ON DELETE SET NULL,
  source_record_id text,
  payload       jsonb NOT NULL,          -- verbatim original; encrypt at rest (RDS + KMS)
  received_at   timestamptz NOT NULL DEFAULT now()
);
-- Re-importing any raw record (even one merged into another transaction) is a no-op.
CREATE UNIQUE INDEX transaction_sources_fp_uq ON transaction_sources (user_id, fingerprint);
CREATE INDEX transaction_sources_txn_idx ON transaction_sources (transaction_id);
CREATE UNIQUE INDEX transaction_sources_record_uq
  ON transaction_sources (transaction_id, source, source_record_id) WHERE source_record_id IS NOT NULL;

-- ───────────── budgets & goals ─────────────
CREATE TABLE budgets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month         date,                    -- first of month; NULL = recurring default
  monthly_limit_paise bigint NOT NULL CHECK (monthly_limit_paise > 0),
  daily_limit_paise   bigint CHECK (daily_limit_paise > 0),
  alert_at_pct  int NOT NULL DEFAULT 80 CHECK (alert_at_pct BETWEEN 1 AND 100),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (user_id, month)
);

CREATE TABLE budget_categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id     uuid NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  category_id   text NOT NULL REFERENCES transaction_categories(id),
  limit_paise   bigint NOT NULL CHECK (limit_paise > 0),
  UNIQUE (budget_id, category_id)
);
CREATE INDEX budget_categories_category_idx ON budget_categories (category_id);

CREATE TABLE savings_goals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  target_paise  bigint NOT NULL CHECK (target_paise > 0),
  saved_paise   bigint NOT NULL DEFAULT 0 CHECK (saved_paise >= 0),
  target_date   date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX savings_goals_user_idx ON savings_goals (user_id);

-- ───────────── pre-aggregated summaries (maintained by the pipeline, steps 13-14) ─────────────
CREATE TABLE daily_summaries (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key       date NOT NULL,
  income_paise  bigint NOT NULL DEFAULT 0,
  expense_paise bigint NOT NULL DEFAULT 0,       -- net of refunds
  gross_expense_paise bigint NOT NULL DEFAULT 0,
  refund_paise  bigint NOT NULL DEFAULT 0,
  pending_debit_paise bigint NOT NULL DEFAULT 0,
  txn_count     int NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day_key)
);

CREATE TABLE monthly_summaries (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month         date NOT NULL,
  income_paise  bigint NOT NULL DEFAULT 0,
  expense_paise bigint NOT NULL DEFAULT 0,
  refund_paise  bigint NOT NULL DEFAULT 0,
  by_category   jsonb NOT NULL DEFAULT '{}',
  txn_count     int NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, month)
);

-- ───────────── ops ─────────────
CREATE TABLE notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          text NOT NULL,           -- budget_alert | sync_failed | consent_expiring | review_needed
  title         text NOT NULL,
  body          text NOT NULL,
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

CREATE TABLE audit_logs (
  id            bigserial PRIMARY KEY,
  user_id       uuid,                    -- no FK: logs survive account deletion (anonymised)
  actor_role    user_role,
  action        text NOT NULL,           -- e.g. consent.revoke, data.export, account.delete
  entity        text,
  entity_id     text,
  ip            inet,
  meta          jsonb NOT NULL DEFAULT '{}',  -- never contains amounts, narrations or secrets
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_user_idx ON audit_logs (user_id, created_at DESC);
CREATE INDEX audit_logs_action_idx ON audit_logs (action);

-- updated_at triggers
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['users','user_profiles','financial_accounts','account_connections','transactions','budgets','savings_goals']
  LOOP EXECUTE format('CREATE TRIGGER %I_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t); END LOOP;
END $$;

-- Seed system categories (mirrors packages/core/src/categorize.ts)
INSERT INTO transaction_categories (id, label, icon, color, is_income) VALUES
 ('food','Food & Dining','restaurant','#F59F00',false),
 ('groceries','Groceries','basket','#40C057',false),
 ('transport','Transport','car','#339AF0',false),
 ('shopping','Shopping','bag','#CC5DE8',false),
 ('bills','Bills & Utilities','flash','#20C997',false),
 ('entertainment','Entertainment','film','#FF6B6B',false),
 ('health','Health','medkit','#F06595',false),
 ('travel','Travel','airplane','#5C7CFA',false),
 ('rent','Rent & Housing','home','#868E96',false),
 ('income','Income','cash','#12B886',true),
 ('transfer','Transfers','swap-horizontal','#748FFC',false),
 ('uncategorized','Needs review','help-circle','#ADB5BD',false);

COMMIT;
