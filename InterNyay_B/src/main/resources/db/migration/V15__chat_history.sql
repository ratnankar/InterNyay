-- Chat history of the AI assistant: one running conversation per account (advocates and associates each have their own).
-- Deleting an account deletes its chat history with it.
CREATE TABLE chat_messages (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  account_id BIGINT       NOT NULL,
  role       VARCHAR(20)  NOT NULL,
  content    TEXT         NOT NULL,
  action     VARCHAR(30),
  created_at DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  KEY idx_chat_messages_account (account_id, id),
  CONSTRAINT fk_chat_messages_account FOREIGN KEY (account_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
