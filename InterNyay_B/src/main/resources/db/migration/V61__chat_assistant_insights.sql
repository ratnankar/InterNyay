CREATE TABLE chat_feedback (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  account_id BIGINT       NOT NULL,
  message_id BIGINT       NOT NULL,
  rating     INT          NOT NULL,
  note       VARCHAR(500) NULL,
  created_at DATETIME(6)  NOT NULL,
  updated_at DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_chat_feedback_message_account (message_id, account_id),
  KEY idx_chat_feedback_rating (rating, updated_at),
  CONSTRAINT fk_chat_feedback_message FOREIGN KEY (message_id) REFERENCES chat_messages (id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_feedback_account FOREIGN KEY (account_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE chat_runs (
  id                BIGINT       NOT NULL AUTO_INCREMENT,
  account_id        BIGINT       NOT NULL,
  conversation_id   BIGINT       NULL,
  question          VARCHAR(300) NULL,
  tools             VARCHAR(400) NULL,
  rounds            INT          NOT NULL,
  latency_ms        BIGINT       NOT NULL,
  prompt_tokens     INT          NULL,
  completion_tokens INT          NULL,
  outcome           VARCHAR(30)  NOT NULL,
  created_at        DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  KEY idx_chat_runs_created (created_at),
  KEY idx_chat_runs_outcome (outcome, created_at),
  CONSTRAINT fk_chat_runs_account FOREIGN KEY (account_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
