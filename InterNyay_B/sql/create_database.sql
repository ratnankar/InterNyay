-- Create the empty database with one collation for every table. This is the only SQL you run by hand.
-- The backend connects to jdbc:mysql://localhost:3306/internyay and does not create the database itself.
-- Creating it as utf8mb4_unicode_ci here means every table shares the same collation, which avoids
-- Error 1267 (Illegal mix of collations). The tables themselves also say utf8mb4_unicode_ci explicitly.
--
-- Fresh install:
--   1. create_database.sql          (this file)
--   2. Start the backend               (Flyway builds the tables and loads the reference data, Hibernate only validates)
-- Nothing else to run. The schema lives in src/main/resources/db/migration, see README.md in this folder.
--
-- SAFE BY DEFAULT: this file no longer deletes anything. If a database named internyay already exists,
-- it is left untouched and nothing is created.
--
-- To wipe and rebuild on purpose (development only, this erases ALL data in internyay):
--   1. Remove the two dashes in front of the DROP DATABASE line below.
--   2. Run the file.
--   3. Put the dashes back so the next run is safe again.
--   Also empty the file storage (the data/uploads folder or the S3 bucket) and sign out in the browser (see README, last section).

-- DROP DATABASE IF EXISTS internyay;

CREATE DATABASE IF NOT EXISTS internyay CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE internyay;

-- Shows the collation of the database you are about to use. It must say utf8mb4_unicode_ci.
-- If an older internyay database already existed with another collation, drop it (see above) and run this again.
SELECT DEFAULT_CHARACTER_SET_NAME AS charset, DEFAULT_COLLATION_NAME AS collation
FROM information_schema.SCHEMATA
WHERE SCHEMA_NAME = 'internyay';
