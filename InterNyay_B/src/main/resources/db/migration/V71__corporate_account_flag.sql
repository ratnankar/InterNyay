-- V71: the corporate flag on users is now called corporate_account (V70 created it as corporate_firm)
ALTER TABLE users CHANGE COLUMN corporate_firm corporate_account TINYINT(1) NOT NULL DEFAULT 0;
