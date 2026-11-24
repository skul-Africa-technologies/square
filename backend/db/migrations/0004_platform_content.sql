CREATE TABLE IF NOT EXISTS communities.communities (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  blurb text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  category text,
  school_name text,
  avatar text,
  banner_url text,
  is_public boolean NOT NULL DEFAULT true,
  join_policy text NOT NULL DEFAULT 'open',
  member_count integer NOT NULL DEFAULT 1,
  online_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE communities.communities ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE communities.communities ADD COLUMN IF NOT EXISTS blurb text NOT NULL DEFAULT '';
ALTER TABLE communities.communities ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE communities.communities ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE communities.communities ADD COLUMN IF NOT EXISTS school_name text;
ALTER TABLE communities.communities ADD COLUMN IF NOT EXISTS avatar text;
ALTER TABLE communities.communities ADD COLUMN IF NOT EXISTS banner_url text;
ALTER TABLE communities.communities ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;
ALTER TABLE communities.communities ADD COLUMN IF NOT EXISTS join_policy text NOT NULL DEFAULT 'open';
ALTER TABLE communities.communities ADD COLUMN IF NOT EXISTS member_count integer NOT NULL DEFAULT 1;
ALTER TABLE communities.communities ADD COLUMN IF NOT EXISTS online_count integer NOT NULL DEFAULT 0;
ALTER TABLE communities.communities ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE communities.communities ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE TABLE IF NOT EXISTS communities.memberships (
  community_id text NOT NULL REFERENCES communities.communities(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','moderator','member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);

CREATE TABLE IF NOT EXISTS communities.join_requests (
  id text PRIMARY KEY,
  community_id text NOT NULL REFERENCES communities.communities(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id,user_id,status)
);

CREATE TABLE IF NOT EXISTS assets.assets (
  id text PRIMARY KEY,
  community_id text NOT NULL REFERENCES communities.communities(id) ON DELETE CASCADE,
  catalog_key text NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  kind text NOT NULL,
  category text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  hidden_from_members boolean NOT NULL DEFAULT false,
  can_read_roles text[] NOT NULL DEFAULT ARRAY['owner','moderator','member'],
  can_post_roles text[] NOT NULL DEFAULT ARRAY['owner','moderator','member'],
  can_pin_roles text[] NOT NULL DEFAULT ARRAY['owner','moderator'],
  is_public boolean NOT NULL DEFAULT true,
  unread_count integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  UNIQUE (community_id,catalog_key)
);

ALTER TABLE assets.assets ADD COLUMN IF NOT EXISTS catalog_key text NOT NULL DEFAULT 'general';
ALTER TABLE assets.assets ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'general';
ALTER TABLE assets.assets ADD COLUMN IF NOT EXISTS slug text NOT NULL DEFAULT 'general';
ALTER TABLE assets.assets ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'chat';
ALTER TABLE assets.assets ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Community';
ALTER TABLE assets.assets ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE assets.assets ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
ALTER TABLE assets.assets ADD COLUMN IF NOT EXISTS hidden_from_members boolean NOT NULL DEFAULT false;
ALTER TABLE assets.assets ADD COLUMN IF NOT EXISTS can_pin_roles text[] NOT NULL DEFAULT ARRAY['owner','moderator'];
ALTER TABLE assets.assets ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;
ALTER TABLE assets.assets ADD COLUMN IF NOT EXISTS unread_count integer NOT NULL DEFAULT 0;
ALTER TABLE assets.assets ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE assets.assets ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE TABLE IF NOT EXISTS assets.rules (
  asset_id text PRIMARY KEY REFERENCES assets.assets(id) ON DELETE CASCADE,
  rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assets.agreements (
  community_id text NOT NULL REFERENCES communities.communities(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users.profiles(id) ON DELETE CASCADE,
  version integer NOT NULL,
  agreed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id,user_id)
);

CREATE TABLE IF NOT EXISTS chat.messages (
  id text PRIMARY KEY,
  asset_id text NOT NULL REFERENCES assets.assets(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users.profiles(id),
  body text NOT NULL,
  reply_to_id text,
  seq bigint NOT NULL,
  client_msg_id text,
  edited_at timestamptz,
  deleted_at timestamptz,
  solved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id,client_msg_id)
);

ALTER TABLE chat.messages ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE chat.messages ADD COLUMN IF NOT EXISTS reply_to_id text;
ALTER TABLE chat.messages ADD COLUMN IF NOT EXISTS seq bigint;
ALTER TABLE chat.messages ADD COLUMN IF NOT EXISTS client_msg_id text;
ALTER TABLE chat.messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE chat.messages ADD COLUMN IF NOT EXISTS solved_at timestamptz;

CREATE INDEX IF NOT EXISTS chat_messages_asset_seq_idx ON chat.messages(asset_id,seq DESC);
CREATE TABLE IF NOT EXISTS chat.read_cursors (
  asset_id text NOT NULL REFERENCES assets.assets(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users.profiles(id) ON DELETE CASCADE,
  seq bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id,user_id)
);

CREATE TABLE IF NOT EXISTS dm.conversations (
  id text PRIMARY KEY,
  pair_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  hidden_at timestamptz
);

CREATE TABLE IF NOT EXISTS dm.participants (
  conversation_id text NOT NULL REFERENCES dm.conversations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users.profiles(id) ON DELETE CASCADE,
  muted_until timestamptz,
  PRIMARY KEY (conversation_id,user_id)
);

CREATE TABLE IF NOT EXISTS dm.messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES dm.conversations(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users.profiles(id),
  body text NOT NULL,
  reply_to_id text,
  seq bigint NOT NULL,
  client_msg_id text,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id,client_msg_id)
);

ALTER TABLE dm.messages ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE dm.messages ADD COLUMN IF NOT EXISTS reply_to_id text;
ALTER TABLE dm.messages ADD COLUMN IF NOT EXISTS seq bigint;
ALTER TABLE dm.messages ADD COLUMN IF NOT EXISTS client_msg_id text;
ALTER TABLE dm.messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;

CREATE TABLE IF NOT EXISTS dm.read_cursors (
  conversation_id text NOT NULL REFERENCES dm.conversations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users.profiles(id) ON DELETE CASCADE,
  seq bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id,user_id)
);

CREATE TABLE IF NOT EXISTS chat.mentions (
  id text PRIMARY KEY,
  message_id text NOT NULL REFERENCES chat.messages(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users.profiles(id) ON DELETE CASCADE,
  asset_id text NOT NULL REFERENCES assets.assets(id) ON DELETE CASCADE,
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id,user_id)
);

CREATE TABLE IF NOT EXISTS dm.mentions (
  id text PRIMARY KEY,
  message_id text NOT NULL REFERENCES dm.messages(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users.profiles(id) ON DELETE CASCADE,
  conversation_id text NOT NULL REFERENCES dm.conversations(id) ON DELETE CASCADE,
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id,user_id)
);
