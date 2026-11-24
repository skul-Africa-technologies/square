CREATE SCHEMA IF NOT EXISTS feeds;
CREATE SCHEMA IF NOT EXISTS events;
CREATE SCHEMA IF NOT EXISTS lists;
CREATE SCHEMA IF NOT EXISTS boards;
CREATE SCHEMA IF NOT EXISTS campaigns;
CREATE SCHEMA IF NOT EXISTS badges;

CREATE TABLE IF NOT EXISTS feeds.posts (
  id text PRIMARY KEY,
  asset_id text NOT NULL REFERENCES assets.assets(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users.profiles(id),
  title text,
  body text NOT NULL,
  media_ids text[] NOT NULL DEFAULT '{}',
  pinned boolean NOT NULL DEFAULT false,
  comments_enabled boolean NOT NULL DEFAULT true,
  status text,
  like_count integer NOT NULL DEFAULT 0,
  up_count integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feeds.comments (
  id text PRIMARY KEY,
  post_id text NOT NULL REFERENCES feeds.posts(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users.profiles(id),
  parent_id text,
  body text NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events.events (
  id text PRIMARY KEY,
  asset_id text NOT NULL REFERENCES assets.assets(id) ON DELETE CASCADE,
  creator_id text NOT NULL REFERENCES users.profiles(id),
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  timezone text NOT NULL DEFAULT 'Africa/Lagos',
  place text,
  online_url text,
  description text,
  cover_upload_id text,
  cancelled_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events.rsvps (
  event_id text NOT NULL REFERENCES events.events(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users.profiles(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('going','interested','not_going')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id,user_id)
);

CREATE TABLE IF NOT EXISTS lists.entries (
  id text PRIMARY KEY,
  asset_id text NOT NULL REFERENCES assets.assets(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users.profiles(id),
  title text NOT NULL,
  url text,
  description text,
  tags text[] NOT NULL DEFAULT '{}',
  deadline_at timestamptz,
  pinned boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lists.saves (
  entry_id text NOT NULL REFERENCES lists.entries(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id,user_id)
);

CREATE TABLE IF NOT EXISTS boards.items (
  id text PRIMARY KEY,
  asset_id text NOT NULL REFERENCES assets.assets(id) ON DELETE CASCADE,
  owner_id text NOT NULL REFERENCES users.profiles(id),
  title text NOT NULL,
  blurb text,
  description text,
  why text,
  needs text[] NOT NULL DEFAULT '{}',
  stage text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS boards.updates (
  id text PRIMARY KEY,
  item_id text NOT NULL REFERENCES boards.items(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users.profiles(id),
  body text NOT NULL,
  media_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS boards.milestones (
  id text PRIMARY KEY,
  item_id text NOT NULL REFERENCES boards.items(id) ON DELETE CASCADE,
  text text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS boards.join_requests (
  id text PRIMARY KEY,
  item_id text NOT NULL REFERENCES boards.items(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users.profiles(id) ON DELETE CASCADE,
  message text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id,user_id,status)
);

CREATE TABLE IF NOT EXISTS campaigns.campaigns (
  id text PRIMARY KEY,
  asset_id text NOT NULL REFERENCES assets.assets(id) ON DELETE CASCADE,
  creator_id text NOT NULL REFERENCES users.profiles(id),
  title text NOT NULL,
  goal text,
  starts_at timestamptz,
  ends_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaigns.tasks (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES campaigns.campaigns(id) ON DELETE CASCADE,
  title text NOT NULL,
  proof_required boolean NOT NULL DEFAULT false,
  points integer NOT NULL DEFAULT 10,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaigns.participants (
  campaign_id text NOT NULL REFERENCES campaigns.campaigns(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users.profiles(id) ON DELETE CASCADE,
  points integer NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id,user_id)
);

CREATE TABLE IF NOT EXISTS campaigns.completions (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES campaigns.tasks(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users.profiles(id) ON DELETE CASCADE,
  proof text,
  status text NOT NULL DEFAULT 'pending',
  points integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id,user_id)
);
