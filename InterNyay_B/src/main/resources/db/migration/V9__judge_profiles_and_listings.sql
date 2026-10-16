-- Judges List split in two:
--   judge_profiles = the judge (name and photo only)
--   judges         = the listing: a court seat (court, building, court no., contacts, jurisdiction ...) held by one judge profile
-- Nothing is deleted when a judge or a listing is removed: they are switched off (active = FALSE) and every
-- court number period stays, each tied to the judge who sat in it.
-- Take a database backup before this runs: the name and photo columns of judges are dropped at the end,
-- after being copied into judge_profiles.

CREATE TABLE judge_profiles (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  name       VARCHAR(255) NOT NULL,
  -- lower case name with the spaces collapsed, two profiles with the same value are the same judge
  name_key   VARCHAR(255) NOT NULL,
  photo      LONGTEXT,
  active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at DATETIME(6),
  updated_at DATETIME(6),
  PRIMARY KEY (id),
  KEY idx_judge_profiles_key (name_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The same judge in several courts was several rows with the same name: they become one profile
ALTER TABLE judges ADD COLUMN name_key VARCHAR(255) NULL;
UPDATE judges SET name_key = LOWER(TRIM(REGEXP_REPLACE(name, '[[:space:]]+', ' ')));

INSERT INTO judge_profiles (name, name_key, photo, active, created_at, updated_at)
SELECT j.name, j.name_key, j.photo, TRUE, NOW(6), NOW(6)
FROM judges j
JOIN (SELECT name_key,
             COALESCE(MIN(CASE WHEN photo IS NOT NULL AND photo <> '' THEN id END), MIN(id)) AS first_id
      FROM judges GROUP BY name_key) f ON f.first_id = j.id;

-- Released judges (they hold no court) become judges without a listing
INSERT INTO judge_profiles (name, name_key, photo, active, created_at, updated_at)
SELECT r.name, f.k, r.photo, TRUE, COALESCE(r.released_at, NOW(6)), NOW(6)
FROM released_judges r
JOIN (SELECT LOWER(TRIM(REGEXP_REPLACE(name, '[[:space:]]+', ' '))) AS k, MIN(id) AS first_id
      FROM released_judges GROUP BY k) f ON f.first_id = r.id
WHERE (f.k COLLATE utf8mb4_unicode_ci) NOT IN (SELECT name_key FROM judge_profiles);

-- Judges that only appear in the court history (no listing, not released) are kept as switched-off profiles
INSERT INTO judge_profiles (name, name_key, photo, active, created_at, updated_at)
SELECT r.judge_name, f.k, NULL, FALSE, NOW(6), NOW(6)
FROM judge_court_no_records r
JOIN (SELECT LOWER(TRIM(REGEXP_REPLACE(judge_name, '[[:space:]]+', ' '))) AS k, MIN(id) AS first_id
      FROM judge_court_no_records
      WHERE judge_name IS NOT NULL AND TRIM(judge_name) <> ''
      GROUP BY k) f ON f.first_id = r.id
WHERE (f.k COLLATE utf8mb4_unicode_ci) NOT IN (SELECT name_key FROM judge_profiles);

-- Every listing points at its judge
ALTER TABLE judges ADD COLUMN profile_id BIGINT NULL;
UPDATE judges j JOIN judge_profiles p ON p.name_key = j.name_key SET j.profile_id = p.id;

ALTER TABLE judges
  MODIFY profile_id BIGINT NOT NULL,
  ADD COLUMN active      BOOLEAN    NOT NULL DEFAULT TRUE,
  ADD COLUMN archived_at DATETIME(6) NULL,
  ADD KEY idx_judges_profile (profile_id),
  ADD CONSTRAINT fk_judges_profile FOREIGN KEY (profile_id) REFERENCES judge_profiles (id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Every court number period remembers which judge sat in it
ALTER TABLE judge_court_no_records ADD COLUMN profile_id BIGINT NULL;
UPDATE judge_court_no_records r
JOIN judges j ON j.id = r.judge_id
LEFT JOIN judge_profiles pn
       ON pn.name_key = LOWER(TRIM(REGEXP_REPLACE(COALESCE(NULLIF(TRIM(r.judge_name), ''), j.name), '[[:space:]]+', ' ')))
SET r.profile_id = COALESCE(pn.id, j.profile_id);

ALTER TABLE judge_court_no_records
  ADD KEY idx_court_no_record_profile (profile_id),
  ADD CONSTRAINT fk_court_no_profile FOREIGN KEY (profile_id) REFERENCES judge_profiles (id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- History no longer goes with the listing: deleting a listing row must never take its court history along
ALTER TABLE judge_court_no_records DROP FOREIGN KEY fk_court_no_judge;
ALTER TABLE judge_court_no_records
  ADD CONSTRAINT fk_court_no_judge FOREIGN KEY (judge_id) REFERENCES judges (id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Name and photo now live on the judge profile only
ALTER TABLE judges DROP COLUMN name, DROP COLUMN photo, DROP COLUMN name_key;

-- released_judges is no longer used (a judge without a listing is simply a judge with no court). Its rows were copied above;
-- the table is left in place and can be dropped later.
