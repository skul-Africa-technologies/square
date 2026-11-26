-- Production hardening migration.
-- Fixes schema integrity gaps that prevent safe production operation:
--   * RLS enabled on kernel.outbox / kernel.consumer_receipts with no policies
--     (blocks all access for any non-owner role). The application connects as
--     the database owner, so RLS is not needed; disable it explicitly.
--   * dm.conversations.pair_key was added nullable with no UNIQUE constraint,
--     so DM de-duplication is unenforced. Backfill and enforce it.
--   * chat.messages.seq and dm.messages.seq were added nullable, breaking
--     ordering/pagination. Backfill and enforce NOT NULL + indexes.
--   * Missing indexes on hot query paths (outbox published_at, dm seq).

-- 1. Outbox / consumer_receipts: RLS is not used (single owner role).
ALTER TABLE kernel.outbox DISABLE ROW LEVEL SECURITY;
ALTER TABLE kernel.consumer_receipts DISABLE ROW LEVEL SECURITY;

-- 2. Outbox / consumer_receipts: indexes for consumer polling.
CREATE INDEX IF NOT EXISTS outbox_published_at_idx
  ON kernel.outbox (published_at)
  WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS consumer_receipts_event_id_idx
  ON kernel.consumer_receipts (event_id);

-- 3. dm.conversations.pair_key: backfill from participants, then enforce.
UPDATE dm.conversations conv
SET pair_key = pair.participants
FROM (
  SELECT conversation_id, string_agg(user_id, ':' ORDER BY user_id) AS participants
  FROM dm.participants
  GROUP BY conversation_id
  HAVING count(*) = 2
) pair
WHERE conv.pair_key IS NULL AND conv.id = pair.conversation_id;

-- Any remaining NULL pair_key (legacy / unexpected participant counts) gets a
-- stable synthetic value so SET NOT NULL cannot fail on existing data.
UPDATE dm.conversations
SET pair_key = 'legacy:' || id
WHERE pair_key IS NULL;

ALTER TABLE dm.conversations ALTER COLUMN pair_key SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dm_conversations_pair_key_key'
      AND conrelid = 'dm.conversations'::regclass
  ) THEN
    ALTER TABLE dm.conversations
      ADD CONSTRAINT dm_conversations_pair_key_key UNIQUE (pair_key);
  END IF;
END
$$;

-- 4. chat.messages.seq: backfill by created_at order, enforce NOT NULL.
WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY asset_id ORDER BY created_at, id) AS rn
  FROM chat.messages
  WHERE seq IS NULL
)
UPDATE chat.messages msg
SET seq = ordered.rn
FROM ordered
WHERE msg.id = ordered.id;

ALTER TABLE chat.messages ALTER COLUMN seq SET NOT NULL;

-- 5. dm.messages.seq: backfill by created_at order, enforce NOT NULL + index.
WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY conversation_id ORDER BY created_at, id) AS rn
  FROM dm.messages
  WHERE seq IS NULL
)
UPDATE dm.messages msg
SET seq = ordered.rn
FROM ordered
WHERE msg.id = ordered.id;

ALTER TABLE dm.messages ALTER COLUMN seq SET NOT NULL;

CREATE INDEX IF NOT EXISTS dm_messages_conversation_seq_idx
  ON dm.messages (conversation_id, seq DESC);