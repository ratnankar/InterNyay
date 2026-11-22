ALTER TABLE documents
  ADD COLUMN source VARCHAR(20) NULL,
  ADD COLUMN page_count INT NULL,
  ADD COLUMN client_upload_id VARCHAR(64) NULL,
  ADD COLUMN ocr_status VARCHAR(20) NULL,
  ADD COLUMN ocr_language VARCHAR(20) NULL,
  ADD COLUMN ocr_confidence DOUBLE NULL,
  ADD KEY idx_documents_source (user_id, source, uploaded_at),
  ADD UNIQUE KEY uq_documents_user_upload (user_id, client_upload_id);

CREATE TABLE document_text (
  document_id  VARCHAR(36) NOT NULL,
  text_content LONGTEXT    NOT NULL,
  updated_at   DATETIME(6) NOT NULL,
  PRIMARY KEY (document_id),
  CONSTRAINT fk_document_text_document FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
