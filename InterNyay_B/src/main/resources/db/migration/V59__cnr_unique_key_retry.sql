-- InterNyay V59: V57 could only add a plain index on (user_id, live_cnr_no) when the data held live cases with the same CNR.
-- When those have been removed since, the key becomes the unique one it should be. Nothing happens while duplicates remain
-- (find them with: SELECT user_id, cnr_no, COUNT(*) FROM cases WHERE deleted = 0 AND cnr_no IS NOT NULL GROUP BY user_id, cnr_no HAVING COUNT(*) > 1)
SET @has_unique = (SELECT COUNT(*) FROM information_schema.statistics
                   WHERE table_schema = DATABASE() AND table_name = 'cases' AND index_name = 'uk_cases_user_live_cnr_no');
SET @cnr_dups = (SELECT COUNT(*) FROM (
    SELECT 1 FROM cases WHERE deleted = b'0' AND cnr_no IS NOT NULL GROUP BY user_id, cnr_no HAVING COUNT(*) > 1) d);
SET @has_plain = (SELECT COUNT(*) FROM information_schema.statistics
                  WHERE table_schema = DATABASE() AND table_name = 'cases' AND index_name = 'idx_cases_user_live_cnr_no');

SET @sql = IF(@has_unique = 0 AND @cnr_dups = 0,
    'ALTER TABLE cases ADD CONSTRAINT uk_cases_user_live_cnr_no UNIQUE (user_id, live_cnr_no)', 'SELECT 1');
PREPARE s1 FROM @sql; EXECUTE s1; DEALLOCATE PREPARE s1;

SET @sql = IF(@has_plain > 0 AND @has_unique = 0 AND @cnr_dups = 0,
    'ALTER TABLE cases DROP INDEX idx_cases_user_live_cnr_no', 'SELECT 1');
PREPARE s2 FROM @sql; EXECUTE s2; DEALLOCATE PREPARE s2;
