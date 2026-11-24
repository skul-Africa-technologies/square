ALTER TABLE dm.messages ADD COLUMN IF NOT EXISTS author_id text;
ALTER TABLE dm.messages ADD COLUMN IF NOT EXISTS body text;

UPDATE dm.messages
SET author_id=sender_id
WHERE author_id IS NULL;

UPDATE dm.messages
SET body=content
WHERE body IS NULL;

ALTER TABLE dm.messages ALTER COLUMN author_id SET NOT NULL;
ALTER TABLE dm.messages ALTER COLUMN body SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='dm_messages_author_id_fkey'
      AND conrelid='dm.messages'::regclass
  ) THEN
    ALTER TABLE dm.messages
      ADD CONSTRAINT dm_messages_author_id_fkey
      FOREIGN KEY (author_id) REFERENCES users.profiles(id);
  END IF;
END
$$;
