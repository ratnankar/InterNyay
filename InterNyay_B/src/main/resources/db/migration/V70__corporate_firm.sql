-- V70: Corporate accounts register through their own sign-up. The Corporate plan is shown only to them (new plan audience CORPORATE),
-- never to ordinary advocates, so the account needs a flag that says it is a corporate account.

ALTER TABLE users ADD COLUMN corporate_account TINYINT(1) NOT NULL DEFAULT 0;

-- The Corporate plan is for corporate accounts only. Audience is VARCHAR(20), so CORPORATE fits
UPDATE plans SET audience = 'CORPORATE' WHERE code = 'CORPORATE';

-- Accounts that already hold the Corporate plan are corporate accounts
UPDATE users SET corporate_account = 1 WHERE plan_code = 'CORPORATE' AND corporate_id IS NULL;
