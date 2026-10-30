-- Photos, videos and PDFs a user attaches to a Contact Us / Feedback message. The files themselves are in file storage;
-- this table keeps each file's storage key. Deleting a message deletes its attachment rows (the files are removed by the service)
CREATE TABLE contact_attachments (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  message_id  BIGINT       NOT NULL,
  file_name   VARCHAR(255) NOT NULL,
  mime_type   VARCHAR(100) NOT NULL,
  size_bytes  BIGINT       NOT NULL,
  storage_key VARCHAR(255) NOT NULL,
  created_at  DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  KEY idx_contact_attachments_message (message_id),
  CONSTRAINT fk_contact_attachment_message FOREIGN KEY (message_id) REFERENCES contact_messages (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
