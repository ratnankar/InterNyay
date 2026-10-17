-- Limit on how many hearings an advocate can list on one day.
-- users.daily_hearing_limit is the usual limit for every day (NULL = no limit).
-- hearing_day_limits holds a limit for one particular date, which replaces the usual limit for that date.
ALTER TABLE users ADD COLUMN daily_hearing_limit INT NULL;

CREATE TABLE hearing_day_limits (
  id           BIGINT NOT NULL AUTO_INCREMENT,
  user_id      BIGINT NOT NULL,
  limit_date   DATE   NOT NULL,
  max_hearings INT    NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT uk_hearing_limit_user_date UNIQUE (user_id, limit_date),
  CONSTRAINT fk_hearing_limit_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
