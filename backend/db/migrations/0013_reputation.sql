-- Rank & reputation progression: schema, seed, ledger, history, daily caps.
-- Forward-only and idempotent (matches the existing runner). Single owner role,
-- no RLS/roles (see 0012). Ids are text + app-generated UUIDs (repo convention).
-- Thresholds live here (rank_definitions); scoring weights live in backend config.

CREATE SCHEMA IF NOT EXISTS reputation;

-- 1. Rank definitions (key + position + threshold). Seeded; tunable via admin.
CREATE TABLE IF NOT EXISTS reputation.rank_definitions (
  key text PRIMARY KEY,
  position integer NOT NULL UNIQUE CHECK (position BETWEEN 1 AND 13),
  name text NOT NULL,
  min_xp bigint NOT NULL DEFAULT 0 CHECK (min_xp >= 0),
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO reputation.rank_definitions (key, position, name, min_xp) VALUES
  ('nobis',      1,  'Nobis',      0),
  ('node',       2,  'Node',       100),
  ('byte',       3,  'Byte',       300),
  ('pixel',      4,  'Pixel',      700),
  ('pioneer',    5,  'Pioneer',    1400),
  ('sentinel',   6,  'Sentinel',   2500),
  ('validator',  7,  'Validator',  4200),
  ('protocol',   8,  'Protocol',   6500),
  ('nexus',      9,  'Nexus',      10000),
  ('overclock',  10, 'Overclock',  15000),
  ('quantum',    11, 'Quantum',    22000),
  ('sovereign',  12, 'Sovereign',  32000),
  ('infinity',   13, 'Infinity',   50000)
ON CONFLICT (key) DO NOTHING;

-- 2. Per-member progress (one row per member; lazy-created as Nobis on read).
CREATE TABLE IF NOT EXISTS reputation.member_progress (
  user_id text PRIMARY KEY,
  xp_total bigint NOT NULL DEFAULT 0 CHECK (xp_total >= 0),
  rank_key text NOT NULL DEFAULT 'nobis',
  rank_achieved_at timestamptz,
  xp_frozen_until timestamptz,
  rank_seen_key text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Append-only XP ledger. Idempotency key derived from source + source_ref.
CREATE TABLE IF NOT EXISTS reputation.xp_events (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  source text NOT NULL,
  source_ref text NOT NULL DEFAULT '',
  idempotency_key text NOT NULL,
  xp integer NOT NULL CHECK (xp > 0),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS xp_events_user_created_idx
  ON reputation.xp_events (user_id, created_at DESC);

-- Append-only enforcement: block UPDATE/DELETE on the ledger (revocation is an
-- insert into xp_revocations, never a mutation of xp_events).
CREATE OR REPLACE FUNCTION reputation.xp_events_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'xp_events is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS xp_events_no_mutate ON reputation.xp_events;
CREATE TRIGGER xp_events_no_mutate
  BEFORE UPDATE OR DELETE ON reputation.xp_events
  FOR EACH ROW EXECUTE FUNCTION reputation.xp_events_append_only();

-- 4. Audited revocations (compensating markers; never mutate the ledger).
CREATE TABLE IF NOT EXISTS reputation.xp_revocations (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  event_id text NOT NULL REFERENCES reputation.xp_events(id),
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS xp_revocations_user_idx
  ON reputation.xp_revocations (user_id);

-- 5. Rank history (permanent; one row per rank achieved).
CREATE TABLE IF NOT EXISTS reputation.rank_history (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  from_rank_key text,
  to_rank_key text NOT NULL,
  achieved_at timestamptz NOT NULL DEFAULT now(),
  xp_at_time bigint NOT NULL DEFAULT 0,
  UNIQUE (user_id, to_rank_key)
);
CREATE INDEX IF NOT EXISTS rank_history_user_idx
  ON reputation.rank_history (user_id, achieved_at DESC);

-- 6. Daily per-source counters for caps (DB is truth; Redis may mirror).
CREATE TABLE IF NOT EXISTS reputation.xp_daily (
  user_id text NOT NULL,
  day date NOT NULL,
  source text NOT NULL,
  xp_awarded integer NOT NULL DEFAULT 0,
  event_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, source)
);