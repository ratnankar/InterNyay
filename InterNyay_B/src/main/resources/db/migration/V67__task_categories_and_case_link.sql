CREATE TABLE task_categories (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  user_id    BIGINT       NOT NULL,
  name       VARCHAR(100) NOT NULL,
  created_at DATETIME(6),
  PRIMARY KEY (id),
  UNIQUE KEY uk_task_categories_user_name (user_id, name),
  CONSTRAINT fk_task_categories_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO task_categories (user_id, name, created_at)
SELECT DISTINCT user_id, TRIM(category), NOW(6)
FROM tasks
WHERE category IS NOT NULL
  AND TRIM(category) <> ''
  AND LOWER(TRIM(category)) <> 'general'
  AND CHAR_LENGTH(TRIM(category)) <= 100;

ALTER TABLE tasks
  ADD COLUMN case_id BIGINT NULL AFTER due_date,
  ADD KEY idx_tasks_case (case_id),
  ADD CONSTRAINT fk_tasks_case FOREIGN KEY (case_id) REFERENCES cases (id) ON DELETE SET NULL;
