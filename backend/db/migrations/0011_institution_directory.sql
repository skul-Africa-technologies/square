CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE users.schools
  ADD COLUMN institution_type text NOT NULL DEFAULT 'other',
  ADD COLUMN ownership text NOT NULL DEFAULT 'unknown';

ALTER TABLE users.schools
  ADD CONSTRAINT schools_institution_type_check
    CHECK (institution_type IN (
      'university',
      'polytechnic',
      'college_of_education',
      'monotechnic',
      'specialized',
      'other'
    )),
  ADD CONSTRAINT schools_ownership_check
    CHECK (ownership IN ('federal', 'state', 'private', 'unknown'));

UPDATE users.schools
SET institution_type = 'university',
    ownership = 'federal'
WHERE id IN ('fut-minna', 'unilag', 'oau', 'ui');

CREATE TABLE users.school_aliases (
  school_id text NOT NULL REFERENCES users.schools(id) ON DELETE CASCADE,
  alias text NOT NULL CHECK (length(btrim(alias)) > 0),
  normalized_alias text NOT NULL CHECK (normalized_alias = lower(btrim(alias))),
  PRIMARY KEY (school_id, normalized_alias)
);

INSERT INTO users.school_aliases (school_id, alias, normalized_alias) VALUES
  ('fut-minna', 'Federal University of Technology Minna', 'federal university of technology minna'),
  ('fut-minna', 'Federal University of Technology, Minna', 'federal university of technology, minna'),
  ('fut-minna', 'FUTMINNA', 'futminna'),
  ('unilag', 'UNILAG', 'unilag'),
  ('unilag', 'University of Lagos, Akoka', 'university of lagos, akoka'),
  ('oau', 'OAU', 'oau'),
  ('oau', 'Obafemi Awolowo University, Ile-Ife', 'obafemi awolowo university, ile-ife'),
  ('ui', 'UI', 'ui'),
  ('ui', 'University of Ibadan, Ibadan', 'university of ibadan, ibadan');

CREATE UNIQUE INDEX school_aliases_normalized_alias_idx
  ON users.school_aliases (normalized_alias);
CREATE INDEX schools_name_trgm_idx
  ON users.schools USING gin (lower(name) gin_trgm_ops);
CREATE INDEX school_aliases_alias_trgm_idx
  ON users.school_aliases USING gin (normalized_alias gin_trgm_ops);

ALTER TABLE users.profiles
  ADD COLUMN education_status text NOT NULL DEFAULT 'student'
  CHECK (education_status IN ('student', 'alumni'));
