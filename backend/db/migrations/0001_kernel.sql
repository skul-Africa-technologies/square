CREATE SCHEMA IF NOT EXISTS kernel;

CREATE TABLE IF NOT EXISTS kernel.outbox (
  id text PRIMARY KEY,
  type text NOT NULL,
  version smallint NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX IF NOT EXISTS outbox_unpublished_idx
  ON kernel.outbox (created_at, id)
  WHERE published_at IS NULL;

CREATE TABLE IF NOT EXISTS kernel.consumer_receipts (
  consumer text NOT NULL,
  event_id text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);

ALTER TABLE kernel.outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE kernel.consumer_receipts ENABLE ROW LEVEL SECURITY;
