-- Run times of the background jobs, set from Admin > Schedulers. A job without a row here starts from the default
-- in application.properties, and its row is created the first time the server starts.
CREATE TABLE scheduler_settings (
    job_key    VARCHAR(60)  NOT NULL PRIMARY KEY,
    cron_expr  VARCHAR(100) NOT NULL,
    enabled    BOOLEAN      NOT NULL DEFAULT TRUE,
    updated_at DATETIME     NULL
);
