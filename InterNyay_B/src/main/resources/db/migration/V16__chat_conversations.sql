-- Several saved chats per account: the AI assistant keeps each conversation separately, so the user can start a new chat
-- and open an earlier one later. Existing messages (one running conversation per account) become one conversation each.
CREATE TABLE chat_conversations (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  account_id BIGINT       NOT NULL,
  title      VARCHAR(120) NOT NULL,
  created_at DATETIME(6)  NOT NULL,
  updated_at DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  KEY idx_chat_conversations_account (account_id, updated_at),
  CONSTRAINT fk_chat_conversations_account FOREIGN KEY (account_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE chat_messages ADD COLUMN conversation_id BIGINT NULL AFTER account_id;

-- One conversation per account that already has messages, titled with its first question
INSERT INTO chat_conversations (account_id, title, created_at, updated_at)
SELECT m.account_id,
       COALESCE((SELECT LEFT(f.content, 60) FROM chat_messages f WHERE f.account_id = m.account_id AND f.role = 'user' ORDER BY f.id LIMIT 1),
                'Earlier conversation'),
       MIN(m.created_at), MAX(m.created_at)
FROM chat_messages m
GROUP BY m.account_id;

UPDATE chat_messages m
JOIN chat_conversations c ON c.account_id = m.account_id
SET m.conversation_id = c.id;

ALTER TABLE chat_messages
  MODIFY conversation_id BIGINT NOT NULL,
  ADD KEY idx_chat_messages_conversation (conversation_id, id),
  ADD CONSTRAINT fk_chat_messages_conversation FOREIGN KEY (conversation_id) REFERENCES chat_conversations (id) ON DELETE CASCADE;
