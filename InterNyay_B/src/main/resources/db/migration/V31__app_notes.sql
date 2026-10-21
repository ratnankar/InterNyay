-- Private notes of the InterNyay Calendar app, synced from the phone so they survive a new phone or a reinstall.
-- One row per note per account (advocates and associates each have their own, nobody else can read them).
-- client_id is the id the app gave the note; times are epoch milliseconds set by the app so the newest edit wins.
-- A deleted note stays as a row with deleted_at set, so the deletion reaches the user's other devices.
-- case_id is a plain number on purpose: deleting a case must not delete the notes written about it.
CREATE TABLE app_notes (
  id         BIGINT        NOT NULL AUTO_INCREMENT,
  account_id BIGINT        NOT NULL,
  client_id  VARCHAR(64)   NOT NULL,
  title      VARCHAR(255)  NOT NULL DEFAULT '',
  body       TEXT          NOT NULL,
  ink        LONGTEXT    NULL,
  pinned     BIT(1)        NOT NULL DEFAULT b'0',
  case_id    BIGINT        NULL,
  case_title VARCHAR(500)  NULL,
  created_at BIGINT        NOT NULL,
  updated_at BIGINT        NOT NULL,
  deleted_at BIGINT        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_app_notes_account_client (account_id, client_id),
  KEY idx_app_notes_account_updated (account_id, updated_at),
  CONSTRAINT fk_app_notes_account FOREIGN KEY (account_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
