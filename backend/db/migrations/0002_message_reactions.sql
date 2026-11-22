CREATE SCHEMA IF NOT EXISTS users;
CREATE SCHEMA IF NOT EXISTS communities;
CREATE SCHEMA IF NOT EXISTS assets;
CREATE SCHEMA IF NOT EXISTS chat;
CREATE SCHEMA IF NOT EXISTS dm;
CREATE SCHEMA IF NOT EXISTS moderation;

CREATE TABLE IF NOT EXISTS users.profiles (
  id text PRIMARY KEY,
  username text NOT NULL UNIQUE,
  avatar_url text
);

CREATE TABLE IF NOT EXISTS users.blocks (
  blocker_id text NOT NULL REFERENCES users.profiles(id) ON DELETE CASCADE,
  blocked_id text NOT NULL REFERENCES users.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS communities.communities (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS communities.memberships (
  community_id text NOT NULL REFERENCES communities.communities(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'moderator', 'member')),
  PRIMARY KEY (community_id, user_id)
);

CREATE TABLE IF NOT EXISTS assets.assets (
  id text PRIMARY KEY,
  community_id text NOT NULL REFERENCES communities.communities(id) ON DELETE CASCADE,
  can_read_roles text[] NOT NULL DEFAULT ARRAY['owner', 'moderator', 'member'],
  can_post_roles text[] NOT NULL DEFAULT ARRAY['owner', 'moderator', 'member'],
  is_public boolean NOT NULL DEFAULT true,
  CHECK (can_read_roles <@ ARRAY['owner', 'moderator', 'member']::text[]),
  CHECK (can_post_roles <@ ARRAY['owner', 'moderator', 'member']::text[])
);

CREATE TABLE IF NOT EXISTS communities.member_restrictions (
  community_id text NOT NULL REFERENCES communities.communities(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users.profiles(id) ON DELETE CASCADE,
  restriction text NOT NULL CHECK (restriction IN ('timeout', 'banned')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id, restriction),
  CHECK (restriction <> 'timeout' OR expires_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS chat.messages (
  id text PRIMARY KEY,
  asset_id text NOT NULL REFERENCES assets.assets(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users.profiles(id),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS chat_messages_asset_page_idx
  ON chat.messages (asset_id, created_at, id);

CREATE TABLE IF NOT EXISTS dm.conversations (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dm.participants (
  conversation_id text NOT NULL REFERENCES dm.conversations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS dm.messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES dm.conversations(id) ON DELETE CASCADE,
  sender_id text NOT NULL REFERENCES users.profiles(id),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS dm_messages_conversation_page_idx
  ON dm.messages (conversation_id, created_at, id);

CREATE TABLE IF NOT EXISTS moderation.audit_log (
  id text PRIMARY KEY,
  actor_id text NOT NULL REFERENCES users.profiles(id),
  action text NOT NULL,
  room_scope text NOT NULL CHECK (room_scope IN ('asset', 'dm')),
  room_id text NOT NULL,
  message_id text NOT NULL,
  emoji varchar(32),
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS chat.reactions (
  message_id text NOT NULL REFERENCES chat.messages(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users.profiles(id) ON DELETE CASCADE,
  emoji varchar(32) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji),
  CHECK (octet_length(emoji) <= 32)
);

CREATE INDEX IF NOT EXISTS chat_reactions_message_emoji_created_idx
  ON chat.reactions (message_id, emoji, created_at);
CREATE INDEX IF NOT EXISTS chat_reactions_user_message_idx
  ON chat.reactions (user_id, message_id);

CREATE TABLE IF NOT EXISTS chat.reaction_counts (
  message_id text NOT NULL REFERENCES chat.messages(id) ON DELETE CASCADE,
  emoji varchar(32) NOT NULL,
  count integer NOT NULL CHECK (count > 0),
  first_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, emoji),
  CHECK (octet_length(emoji) <= 32)
);

CREATE TABLE IF NOT EXISTS dm.reactions (
  message_id text NOT NULL REFERENCES dm.messages(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users.profiles(id) ON DELETE CASCADE,
  emoji varchar(32) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji),
  CHECK (octet_length(emoji) <= 32)
);

CREATE INDEX IF NOT EXISTS dm_reactions_message_emoji_created_idx
  ON dm.reactions (message_id, emoji, created_at);
CREATE INDEX IF NOT EXISTS dm_reactions_user_message_idx
  ON dm.reactions (user_id, message_id);

CREATE TABLE IF NOT EXISTS dm.reaction_counts (
  message_id text NOT NULL REFERENCES dm.messages(id) ON DELETE CASCADE,
  emoji varchar(32) NOT NULL,
  count integer NOT NULL CHECK (count > 0),
  first_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, emoji),
  CHECK (octet_length(emoji) <= 32)
);

CREATE OR REPLACE FUNCTION chat.reconcile_reaction_counts() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  LOCK TABLE chat.reactions IN SHARE MODE;
  LOCK TABLE chat.reaction_counts IN SHARE ROW EXCLUSIVE MODE;
  DELETE FROM chat.reaction_counts counts
  WHERE NOT EXISTS (SELECT 1 FROM chat.reactions reactions WHERE reactions.message_id = counts.message_id AND reactions.emoji = counts.emoji);
  INSERT INTO chat.reaction_counts (message_id, emoji, count, first_at)
  SELECT message_id, emoji, count(*), min(created_at)
  FROM chat.reactions
  GROUP BY message_id, emoji
  ON CONFLICT (message_id, emoji) DO UPDATE
    SET count = EXCLUDED.count, first_at = EXCLUDED.first_at;
END;
$$;

CREATE OR REPLACE FUNCTION dm.reconcile_reaction_counts() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  LOCK TABLE dm.reactions IN SHARE MODE;
  LOCK TABLE dm.reaction_counts IN SHARE ROW EXCLUSIVE MODE;
  DELETE FROM dm.reaction_counts counts
  WHERE NOT EXISTS (SELECT 1 FROM dm.reactions reactions WHERE reactions.message_id = counts.message_id AND reactions.emoji = counts.emoji);
  INSERT INTO dm.reaction_counts (message_id, emoji, count, first_at)
  SELECT message_id, emoji, count(*), min(created_at)
  FROM dm.reactions
  GROUP BY message_id, emoji
  ON CONFLICT (message_id, emoji) DO UPDATE
    SET count = EXCLUDED.count, first_at = EXCLUDED.first_at;
END;
$$;
