CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS users;
CREATE SCHEMA IF NOT EXISTS communities;
CREATE SCHEMA IF NOT EXISTS assets;
CREATE SCHEMA IF NOT EXISTS chat;
CREATE SCHEMA IF NOT EXISTS dm;
CREATE SCHEMA IF NOT EXISTS feeds;
CREATE SCHEMA IF NOT EXISTS events;
CREATE SCHEMA IF NOT EXISTS lists;
CREATE SCHEMA IF NOT EXISTS boards;
CREATE SCHEMA IF NOT EXISTS campaigns;
CREATE SCHEMA IF NOT EXISTS discover;
CREATE SCHEMA IF NOT EXISTS search;
CREATE SCHEMA IF NOT EXISTS notifications;
CREATE SCHEMA IF NOT EXISTS moderation;

CREATE TABLE IF NOT EXISTS auth.accounts (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.sessions (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES auth.accounts(id) ON DELETE CASCADE,
  refresh_hash text NOT NULL,
  family_id text NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users.profiles (
  id text PRIMARY KEY,
  username text NOT NULL UNIQUE,
  display_name text,
  school_id text,
  school_name text,
  avatar_url text,
  banner_url text,
  verified_student boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  bio text,
  status text,
  department text,
  level text,
  location text,
  birthday_opt_in boolean NOT NULL DEFAULT false,
  appear_offline boolean NOT NULL DEFAULT false,
  show_communities boolean NOT NULL DEFAULT true,
  dm_privacy text NOT NULL DEFAULT 'shared',
  timezone text NOT NULL DEFAULT 'Africa/Lagos',
  birthday_md text,
  date_of_birth date
);

CREATE TABLE IF NOT EXISTS users.schools (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE
);

ALTER TABLE users.profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE users.profiles ADD COLUMN IF NOT EXISTS school_id text;
ALTER TABLE users.profiles ADD COLUMN IF NOT EXISTS school_name text;
ALTER TABLE users.profiles ADD COLUMN IF NOT EXISTS banner_url text;
ALTER TABLE users.profiles ADD COLUMN IF NOT EXISTS verified_student boolean NOT NULL DEFAULT false;
ALTER TABLE users.profiles ADD COLUMN IF NOT EXISTS joined_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE users.profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE users.profiles ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE users.profiles ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE users.profiles ADD COLUMN IF NOT EXISTS level text;
ALTER TABLE users.profiles ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE users.profiles ADD COLUMN IF NOT EXISTS birthday_opt_in boolean NOT NULL DEFAULT false;
ALTER TABLE users.profiles ADD COLUMN IF NOT EXISTS appear_offline boolean NOT NULL DEFAULT false;
ALTER TABLE users.profiles ADD COLUMN IF NOT EXISTS show_communities boolean NOT NULL DEFAULT true;
ALTER TABLE users.profiles ADD COLUMN IF NOT EXISTS dm_privacy text NOT NULL DEFAULT 'shared';
ALTER TABLE users.profiles ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Africa/Lagos';
ALTER TABLE users.profiles ADD COLUMN IF NOT EXISTS birthday_md text;
ALTER TABLE users.profiles ADD COLUMN IF NOT EXISTS date_of_birth date;

INSERT INTO users.schools (id, name) VALUES
  ('fut-minna', 'FUT Minna'),
  ('unilag', 'University of Lagos'),
  ('oau', 'Obafemi Awolowo University'),
  ('ui', 'University of Ibadan')
ON CONFLICT (id) DO NOTHING;
