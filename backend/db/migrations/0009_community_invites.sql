CREATE TABLE IF NOT EXISTS communities.invites (
  id text PRIMARY KEY,
  community_id text NOT NULL REFERENCES communities.communities(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  created_by text NOT NULL REFERENCES users.profiles(id) ON DELETE RESTRICT,
  max_uses integer CHECK (max_uses IS NULL OR max_uses BETWEEN 1 AND 500),
  uses integer NOT NULL DEFAULT 0 CHECK (uses >= 0),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_invites_active_idx
  ON communities.invites(community_id,expires_at,created_at DESC)
  WHERE revoked_at IS NULL;
