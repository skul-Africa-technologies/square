ALTER TABLE identity.sessions
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS replaced_by text,
  ADD COLUMN IF NOT EXISTS user_agent_hash text,
  ADD COLUMN IF NOT EXISTS ip_hash text;

UPDATE identity.sessions
SET expires_at = COALESCE(expires_at, created_at + interval '30 days'),
    last_used_at = COALESCE(last_used_at, created_at);

CREATE INDEX IF NOT EXISTS auth_sessions_account_idx
  ON identity.sessions (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_sessions_family_idx
  ON identity.sessions (family_id);
CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_refresh_hash_idx
  ON identity.sessions (refresh_hash);

CREATE TABLE IF NOT EXISTS identity.refresh_token_history (
  token_hash text PRIMARY KEY,
  session_id text NOT NULL REFERENCES identity.sessions(id) ON DELETE CASCADE,
  family_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_refresh_token_family_idx
  ON identity.refresh_token_history (family_id, expires_at);

CREATE TABLE IF NOT EXISTS identity.login_events (
  id text PRIMARY KEY,
  email_hash text NOT NULL,
  ip_hash text NOT NULL,
  kind text NOT NULL,
  succeeded boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_login_events_created_idx
  ON identity.login_events (created_at);
