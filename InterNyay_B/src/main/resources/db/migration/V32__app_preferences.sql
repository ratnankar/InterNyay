-- Preferences of the InterNyay Calendar app (court colours, court filter, view settings), synced from the phone
-- so they follow the account to a new phone or a reinstall.
-- One row per account. data is a small JSON object kept as the app produces it; updated_at is epoch milliseconds
-- set by the app, so the newest change wins when two phones save.
CREATE TABLE app_preferences (
  id         BIGINT      NOT NULL AUTO_INCREMENT,
  account_id BIGINT      NOT NULL,
  data       TEXT        NOT NULL,
  updated_at BIGINT      NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_app_preferences_account (account_id),
  CONSTRAINT fk_app_preferences_account FOREIGN KEY (account_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
