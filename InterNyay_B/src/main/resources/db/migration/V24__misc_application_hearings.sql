-- Hearing history of a misc. application: every date it was listed for, kept apart from the case's own hearing history
CREATE TABLE misc_application_hearings (
  id                  BIGINT      NOT NULL AUTO_INCREMENT,
  misc_application_id BIGINT      NOT NULL,
  hearing_date        DATE        NOT NULL,
  created_at          DATETIME(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_misc_app_hearing_date (misc_application_id, hearing_date),
  KEY idx_misc_app_hearing_date (hearing_date),
  CONSTRAINT fk_misc_app_hearing_app FOREIGN KEY (misc_application_id) REFERENCES misc_applications (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Applications that already have a next hearing date start their history with it
INSERT INTO misc_application_hearings (misc_application_id, hearing_date, created_at)
SELECT id, hearing_date, NOW(6) FROM misc_applications WHERE hearing_date IS NOT NULL;
