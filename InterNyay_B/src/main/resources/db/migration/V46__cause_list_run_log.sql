-- One row per cause list run (the hourly automatic runs and the runs started from Admin > Cause List),
-- so the admin can see what ran, when, and what it could not do
CREATE TABLE cause_list_run_log (
    id                  BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    hearing_date        DATE         NOT NULL,
    origin              VARCHAR(20)  NOT NULL,
    label               VARCHAR(60)  NULL,
    status              VARCHAR(20)  NOT NULL,
    high_court_checked  INT          NOT NULL DEFAULT 0,
    district_rooms      INT          NOT NULL DEFAULT 0,
    district_done       INT          NOT NULL DEFAULT 0,
    district_captcha    INT          NOT NULL DEFAULT 0,
    district_failed     INT          NOT NULL DEFAULT 0,
    numbers_saved       INT          NOT NULL DEFAULT 0,
    started_at          DATETIME     NOT NULL,
    finished_at         DATETIME     NULL,
    summary             VARCHAR(500) NULL,
    details             TEXT         NULL,
    INDEX idx_cause_list_run_log_started (started_at),
    INDEX idx_cause_list_run_log_date (hearing_date)
);
