-- Change judge: the name of the judge who sat in a court during each court no. period is kept on the period itself,
-- so replacing the judge of a court never rewrites who sat there before. Empty = use the judge row's current name.
ALTER TABLE judge_court_no_records ADD COLUMN judge_name VARCHAR(255) NULL;

-- Judges who were replaced in their court and now hold no court. They stay available to be put in a court again.
CREATE TABLE released_judges (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  name          VARCHAR(255) NOT NULL,
  designation   VARCHAR(255),
  photo         LONGTEXT,
  released_from VARCHAR(500),
  released_at   DATETIME,
  PRIMARY KEY (id),
  KEY idx_released_judges_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
