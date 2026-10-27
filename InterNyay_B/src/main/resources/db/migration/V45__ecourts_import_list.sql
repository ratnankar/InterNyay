-- InterNyay V45: the "Import from eCourts" list (cases of the uploaded My Cases file) is kept on the account, so it is
-- still there after signing in on another device, a new browser or a closed tab. It used to live in the browser only.
-- One row per account. data is the JSON list of cases as the web app reads it from the file; updated_at is epoch
-- milliseconds set by the app.
CREATE TABLE ecourts_imports (
  id         BIGINT      NOT NULL AUTO_INCREMENT,
  account_id BIGINT      NOT NULL,
  data       MEDIUMTEXT  NOT NULL,
  updated_at BIGINT      NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ecourts_imports_account (account_id),
  CONSTRAINT fk_ecourts_imports_account FOREIGN KEY (account_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
