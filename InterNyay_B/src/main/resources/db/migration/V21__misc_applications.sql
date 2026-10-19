-- Miscellaneous applications filed in a case (stay, exemption, bail, ... anything that is not the main case itself).
-- Each one belongs to a case and has its own status (Pending / Disposed Off), hearing date, history note and documents.
CREATE TABLE misc_applications (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  case_id          BIGINT       NOT NULL,
  user_id          BIGINT       NOT NULL,
  application_type VARCHAR(255) NOT NULL,
  history          TEXT,
  filing_date      DATE,
  hearing_date     DATE,
  status           VARCHAR(30)  NOT NULL DEFAULT 'Pending',
  disposed_on      DATE,
  created_at       DATETIME(6),
  updated_at       DATETIME(6),
  PRIMARY KEY (id),
  KEY idx_misc_apps_user_status (user_id, status),
  KEY idx_misc_apps_case (case_id),
  KEY idx_misc_apps_hearing (hearing_date),
  -- rows go with their case or owner (the services remove the files)
  CONSTRAINT fk_misc_apps_case FOREIGN KEY (case_id) REFERENCES cases (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_misc_apps_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A document can belong to a misc. application: the application itself, its order, or an additional document
ALTER TABLE documents ADD COLUMN misc_application_id BIGINT NULL;
ALTER TABLE documents ADD COLUMN misc_role VARCHAR(20) NULL;
ALTER TABLE documents ADD KEY idx_documents_misc_app (misc_application_id);
ALTER TABLE documents ADD CONSTRAINT fk_documents_misc_app
  FOREIGN KEY (misc_application_id) REFERENCES misc_applications (id) ON DELETE CASCADE ON UPDATE CASCADE;
