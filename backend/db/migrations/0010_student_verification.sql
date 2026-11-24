ALTER TABLE users.schools
  ADD COLUMN IF NOT EXISTS email_domains text[] NOT NULL DEFAULT '{}';

ALTER TABLE users.profiles
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

UPDATE users.profiles
SET verified_at = joined_at
WHERE verified_student = true AND verified_at IS NULL;
