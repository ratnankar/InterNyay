-- The name a client goes by in one case when the court lists them under another name than the client's main name
-- (eCourts spells the party differently): client id -> name as in the case
CREATE TABLE case_client_names (
  case_id   BIGINT       NOT NULL,
  client_id BIGINT       NOT NULL,
  case_name VARCHAR(255) NOT NULL,
  PRIMARY KEY (case_id, client_id),
  CONSTRAINT fk_case_client_names_case FOREIGN KEY (case_id) REFERENCES cases (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
