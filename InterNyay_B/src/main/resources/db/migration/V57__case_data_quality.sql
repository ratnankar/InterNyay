-- InterNyay V57: case data quality
--   1. created_at / updated_at were never filled for new cases (the builder skipped the field initializer) - backfilled here
--   2. the case number no longer gets "#deleted-<id>" added when a case is deleted: a deleted case keeps its number, and the
--      unique keys look at live_case_no / live_cnr_no, which are empty for a deleted case
--   3. fir_section is as wide as acts_sections, the junk text the portal page added to acts is cut, titles are tidied
--   4. the ecourts_judge column (field removed from the app) is dropped, deleted can no longer be NULL

-- 1. Times. The best date left for a case is its last update, then its deletion, then now
UPDATE cases SET created_at = COALESCE(updated_at, deleted_at, NOW(6)) WHERE created_at IS NULL;
UPDATE cases SET updated_at = created_at WHERE updated_at IS NULL;

-- 4a. deleted is never NULL (bit, like the column was made in V1)
UPDATE cases SET deleted = b'0' WHERE deleted IS NULL;
ALTER TABLE cases MODIFY deleted BIT(1) NOT NULL DEFAULT b'0';

-- 2. Generated columns and keys. Every step first checks whether it was already done, so that this file can run again
--    after a failure part-way (MySQL cannot roll back ALTER TABLE)
SET @has_live_case = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cases' AND column_name = 'live_case_no');
SET @sql = IF(@has_live_case = 0,
    'ALTER TABLE cases ADD COLUMN live_case_no VARCHAR(255) GENERATED ALWAYS AS (IF(deleted = b\'1\', NULL, case_no)) STORED', 'SELECT 1');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @has_live_cnr = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cases' AND column_name = 'live_cnr_no');
SET @sql = IF(@has_live_cnr = 0,
    'ALTER TABLE cases ADD COLUMN live_cnr_no VARCHAR(255) GENERATED ALWAYS AS (IF(deleted = b\'1\', NULL, cnr_no)) STORED', 'SELECT 1');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- A deleted case gets its own number back (before the key on live_case_no, which only looks at live cases)
UPDATE cases SET case_no = REGEXP_REPLACE(case_no, '#deleted-[0-9]+$', '') WHERE case_no LIKE '%#deleted-%';

-- The old key on (user_id, case_no) goes (user_id is still covered by idx_cases_user_status for its foreign key)
SET @has_old = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'cases' AND index_name = 'uk_cases_user_case_no');
SET @sql = IF(@has_old > 0, 'ALTER TABLE cases DROP INDEX uk_cases_user_case_no', 'SELECT 1');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @has_new = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'cases' AND index_name = 'uk_cases_user_live_case_no');
SET @sql = IF(@has_new = 0, 'ALTER TABLE cases ADD CONSTRAINT uk_cases_user_live_case_no UNIQUE (user_id, live_case_no)', 'SELECT 1');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- One live case per CNR for each advocate. When a database already holds such duplicates, only a plain index is made
-- (so the migration never stops the app from starting); find them with
--   SELECT user_id, cnr_no, COUNT(*) FROM cases WHERE deleted = 0 AND cnr_no IS NOT NULL GROUP BY user_id, cnr_no HAVING COUNT(*) > 1;
-- (V59 makes it unique later, once they are gone)
SET @has_cnr_key = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'cases'
                    AND index_name IN ('uk_cases_user_live_cnr_no', 'idx_cases_user_live_cnr_no'));
SET @cnr_dups = (SELECT COUNT(*) FROM (
    SELECT 1 FROM cases WHERE deleted = b'0' AND cnr_no IS NOT NULL GROUP BY user_id, cnr_no HAVING COUNT(*) > 1) d);
SET @sql = IF(@has_cnr_key > 0, 'SELECT 1',
    IF(@cnr_dups = 0,
       'ALTER TABLE cases ADD CONSTRAINT uk_cases_user_live_cnr_no UNIQUE (user_id, live_cnr_no)',
       'ALTER TABLE cases ADD KEY idx_cases_user_live_cnr_no (user_id, live_cnr_no)'));
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- 3. Wider FIR section (it holds the same text as acts_sections)
ALTER TABLE cases MODIFY fir_section VARCHAR(1000) NULL;

-- Page text that follows the acts on the portal page is not part of the acts
UPDATE cases SET
  acts_sections = REGEXP_REPLACE(acts_sections, ';? *(Processes|IA Status|Main Matters|Process ID|IA Number)( .*|;.*)?$', '')
WHERE acts_sections REGEXP '(Processes|IA Status|Main Matters|Process ID|IA Number)';
UPDATE cases SET
  fir_section = REGEXP_REPLACE(fir_section, ';? *(Processes|IA Status|Main Matters|Process ID|IA Number)( .*|;.*)?$', '')
WHERE fir_section REGEXP '(Processes|IA Status|Main Matters|Process ID|IA Number)';

-- A value that is only the case's own CNR number is not an acts text
UPDATE cases SET acts_sections = NULL WHERE acts_sections = cnr_no;
UPDATE cases SET fir_section  = NULL WHERE fir_section  = cnr_no;

-- &amp; and trailing "," or ";"
UPDATE cases SET acts_sections = REPLACE(acts_sections, '&amp;', '&') WHERE acts_sections LIKE '%&amp;%';
UPDATE cases SET fir_section   = REPLACE(fir_section,   '&amp;', '&') WHERE fir_section   LIKE '%&amp;%';
UPDATE cases SET acts_sections = REGEXP_REPLACE(REGEXP_REPLACE(acts_sections, ' *, *;', ';'), '[;, ]+$', '') WHERE acts_sections REGEXP '[;, ]$|,;';
UPDATE cases SET fir_section   = REGEXP_REPLACE(REGEXP_REPLACE(fir_section,   ' *, *;', ';'), '[;, ]+$', '') WHERE fir_section   REGEXP '[;, ]$|,;';

-- A field name read as the value
UPDATE cases SET efiling_no = NULL WHERE efiling_no REGEXP '^e-?filing (number|date)$';

-- A case that is over has no stage; "(Criminal)" / "(Civil)" after a stage is not part of it
UPDATE cases SET case_stage = NULL WHERE status IN ('Decided', 'Withdrawn') AND case_stage IS NOT NULL;
UPDATE cases SET case_stage = REGEXP_REPLACE(case_stage, ' *\\((Criminal|Civil)\\)$', '') WHERE case_stage REGEXP '\\((Criminal|Civil)\\)$';

-- Cause list numbers of past days are of no use (they are filled again on the day)
UPDATE cases SET listing_no = NULL, listing_date = NULL WHERE listing_date IS NOT NULL AND listing_date < CURDATE();

-- Titles: single spaces, "v." between the sides (names in capitals are changed to normal case when the case is next saved)
UPDATE cases SET title = TRIM(REGEXP_REPLACE(title, ' {2,}', ' ')) WHERE title REGEXP ' {2,}|^ | $';
-- (a capital "V" alone is left, it can be an initial: "Rajesh V. Kumar")
UPDATE cases SET title = REGEXP_REPLACE(title, ' +(v\\.?|[vV][sS]\\.?) +', ' v. ', 1, 1, 'c')
WHERE REGEXP_LIKE(title, ' (v\\.?|[vV][sS]\\.?) ', 'c') AND title NOT LIKE '% v. %';

-- 4b. The Judge (eCourts) field was removed from the app; drop its column when this database still has it
SET @has_judge = (SELECT COUNT(*) FROM information_schema.columns
                  WHERE table_schema = DATABASE() AND table_name = 'cases' AND column_name = 'ecourts_judge');
SET @judge_sql = IF(@has_judge = 1, 'ALTER TABLE cases DROP COLUMN ecourts_judge', 'SELECT 1');
PREPARE judge_stmt FROM @judge_sql;
EXECUTE judge_stmt;
DEALLOCATE PREPARE judge_stmt;
