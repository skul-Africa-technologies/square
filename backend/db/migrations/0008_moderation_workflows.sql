ALTER TABLE communities.member_restrictions
  ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT '';
ALTER TABLE communities.member_restrictions
  ADD COLUMN IF NOT EXISTS created_by text REFERENCES users.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS member_restrictions_active_idx
  ON communities.member_restrictions(community_id,restriction,expires_at);

CREATE TABLE IF NOT EXISTS moderation.reports (
  id text PRIMARY KEY,
  community_id text REFERENCES communities.communities(id) ON DELETE SET NULL,
  reporter_id text NOT NULL REFERENCES users.profiles(id) ON DELETE CASCADE,
  target_kind text NOT NULL CHECK (target_kind IN ('message','post','comment','user','community','entry','item')),
  target_id text NOT NULL,
  reported_user_id text REFERENCES users.profiles(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 80),
  details text NOT NULL DEFAULT '' CHECK (length(details) <= 2000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','dismissed')),
  resolution_action text CHECK (resolution_action IN ('dismiss','delete_content','timeout','ban')),
  resolution_note text NOT NULL DEFAULT '' CHECK (length(resolution_note) <= 2000),
  resolved_by text REFERENCES users.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moderation_reports_queue_idx
  ON moderation.reports(community_id,status,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS moderation_reports_reporter_recent_idx
  ON moderation.reports(reporter_id,created_at DESC);

CREATE TABLE IF NOT EXISTS moderation.community_audit_log (
  id text PRIMARY KEY,
  community_id text REFERENCES communities.communities(id) ON DELETE SET NULL,
  actor_id text NOT NULL REFERENCES users.profiles(id) ON DELETE RESTRICT,
  action text NOT NULL,
  target_kind text,
  target_id text,
  target_user_id text REFERENCES users.profiles(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_audit_log_page_idx
  ON moderation.community_audit_log(community_id,created_at DESC,id DESC);
