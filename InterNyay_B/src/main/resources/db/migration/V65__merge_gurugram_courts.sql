-- InterNyay V65: one Gurugram court instead of two.
--   * the plain "Gurugram" court (added by V64) is removed;
--   * the "Gurugram District Court" court is kept and renamed "Gurugram" (shown as "Gurugram Court");
--   * it gets a district named "Gurugram", and everything that had no district (court numbers, judges, court history,
--     rosters, leave, district PDFs) moves into that district;
--   * everything that pointed at the removed court (cases, judge listings, saved court preferences) is moved to the kept one.
-- The cause list, judges-on-leave and court code logic is keyed by the court / district name "Gurugram", so it now runs for
-- the kept court with no further change. A database with no "Gurugram District Court" is left exactly as it is.
SET NAMES utf8mb4;

-- Old row -> row that replaces it. Rows of the removed court and "no district" rows that already have a "Gurugram" twin.
DROP TEMPORARY TABLE IF EXISTS gg_map;
CREATE TEMPORARY TABLE gg_map (
  old_id BIGINT NOT NULL PRIMARY KEY,
  new_id BIGINT NOT NULL
);

-- 1. The kept court gets its "Gurugram" district row (the district itself, with no building or court no.)
INSERT IGNORE INTO courts (court, district, building, floor, court_no, high_court)
SELECT k.court, 'Gurugram', '', '', '', 0
FROM courts k
WHERE LOWER(TRIM(k.court)) IN ('gurugram district court', 'gurugram district courts', 'gurgaon district court')
ORDER BY k.id
LIMIT 1;

-- 2. "No district" rows of the kept court that already exist under the "Gurugram" district are merged into that row
INSERT INTO gg_map (old_id, new_id)
SELECT a.id, MIN(b.id)
FROM courts a
JOIN courts b ON b.court = a.court AND b.district = 'Gurugram'
             AND b.building = a.building AND b.floor = a.floor AND b.court_no = a.court_no
WHERE LOWER(TRIM(a.court)) IN ('gurugram district court', 'gurugram district courts', 'gurgaon district court')
  AND a.district = ''
GROUP BY a.id;

-- 3. The other "no district" rows of the kept court become rows of the "Gurugram" district
UPDATE courts
SET district = 'Gurugram'
WHERE LOWER(TRIM(court)) IN ('gurugram district court', 'gurugram district courts', 'gurgaon district court')
  AND district = ''
  AND id NOT IN (SELECT old_id FROM gg_map);

-- 4. Every row of the plain "Gurugram" court is replaced by the same building / floor / court no. of the kept court's
--    "Gurugram" district, or by the district row itself when the kept court has no such place
INSERT INTO gg_map (old_id, new_id)
SELECT o.id,
       COALESCE(
         (SELECT MIN(n.id) FROM courts n
           WHERE LOWER(TRIM(n.court)) IN ('gurugram district court', 'gurugram district courts', 'gurgaon district court')
             AND n.district = 'Gurugram' AND n.building = o.building AND n.floor = o.floor AND n.court_no = o.court_no),
         (SELECT MIN(n.id) FROM courts n
           WHERE LOWER(TRIM(n.court)) IN ('gurugram district court', 'gurugram district courts', 'gurgaon district court')
             AND n.district = 'Gurugram' AND n.building = '' AND n.floor = '' AND n.court_no = '')
       )
FROM courts o
WHERE o.court = 'Gurugram'
  AND EXISTS (SELECT 1 FROM courts k
               WHERE LOWER(TRIM(k.court)) IN ('gurugram district court', 'gurugram district courts', 'gurgaon district court'));

-- 5. Point cases, judge listings and saved court preferences at the replacing rows
UPDATE cases c JOIN gg_map m ON m.old_id = c.court_id SET c.court_id = m.new_id;
UPDATE judges j JOIN gg_map m ON m.old_id = j.court_id SET j.court_id = m.new_id;

-- Court preferences are a comma separated list of ids. One pass replaces one id per user, so it is run a few times
UPDATE users u JOIN gg_map m ON FIND_IN_SET(m.old_id, REPLACE(u.court_preferences, ' ', '')) > 0
SET u.court_preferences = TRIM(BOTH ',' FROM REPLACE(CONCAT(',', REPLACE(u.court_preferences, ' ', ''), ','),
                                                     CONCAT(',', m.old_id, ','), CONCAT(',', m.new_id, ',')))
WHERE u.court_preferences IS NOT NULL;
UPDATE users u JOIN gg_map m ON FIND_IN_SET(m.old_id, REPLACE(u.court_preferences, ' ', '')) > 0
SET u.court_preferences = TRIM(BOTH ',' FROM REPLACE(CONCAT(',', REPLACE(u.court_preferences, ' ', ''), ','),
                                                     CONCAT(',', m.old_id, ','), CONCAT(',', m.new_id, ',')))
WHERE u.court_preferences IS NOT NULL;
UPDATE users u JOIN gg_map m ON FIND_IN_SET(m.old_id, REPLACE(u.court_preferences, ' ', '')) > 0
SET u.court_preferences = TRIM(BOTH ',' FROM REPLACE(CONCAT(',', REPLACE(u.court_preferences, ' ', ''), ','),
                                                     CONCAT(',', m.old_id, ','), CONCAT(',', m.new_id, ',')))
WHERE u.court_preferences IS NOT NULL;

-- 6. The replaced rows are not needed any more
DELETE FROM courts WHERE id IN (SELECT old_id FROM gg_map);

-- 7. The kept court is now called "Gurugram"
UPDATE courts
SET court = 'Gurugram'
WHERE LOWER(TRIM(court)) IN ('gurugram district court', 'gurugram district courts', 'gurgaon district court');

-- 8. Everything that keeps its own copy of the court / district text follows: no district becomes the "Gurugram" district.
--    UPDATE IGNORE leaves a row alone if its new spelling would clash with an existing one (district PDFs: one per section and district)
UPDATE IGNORE judges
SET court = 'Gurugram', district = IF(COALESCE(district, '') = '', 'Gurugram', district)
WHERE LOWER(TRIM(court)) IN ('gurugram district court', 'gurugram district courts', 'gurgaon district court', 'gurugram');

UPDATE IGNORE judge_court_no_records
SET court = 'Gurugram', district = IF(COALESCE(district, '') = '', 'Gurugram', district)
WHERE LOWER(TRIM(court)) IN ('gurugram district court', 'gurugram district courts', 'gurgaon district court', 'gurugram');

UPDATE IGNORE judges_on_leave
SET court = 'Gurugram', district = IF(COALESCE(district, '') = '', 'Gurugram', district)
WHERE LOWER(TRIM(court)) IN ('gurugram district court', 'gurugram district courts', 'gurgaon district court', 'gurugram');

UPDATE IGNORE duty_magistrate_roster
SET court = 'Gurugram', district = IF(COALESCE(district, '') = '', 'Gurugram', district)
WHERE LOWER(TRIM(court)) IN ('gurugram district court', 'gurugram district courts', 'gurgaon district court', 'gurugram');

UPDATE IGNORE bail_roster_records
SET court = 'Gurugram', district = IF(COALESCE(district, '') = '', 'Gurugram', district)
WHERE LOWER(TRIM(court)) IN ('gurugram district court', 'gurugram district courts', 'gurgaon district court', 'gurugram');

UPDATE IGNORE district_pdfs
SET court = 'Gurugram', district = IF(COALESCE(district, '') = '', 'Gurugram', district)
WHERE LOWER(TRIM(court)) IN ('gurugram district court', 'gurugram district courts', 'gurgaon district court', 'gurugram');

UPDATE police_districts
SET court = 'Gurugram'
WHERE LOWER(TRIM(court)) IN ('gurugram district court', 'gurugram district courts', 'gurgaon district court');

DROP TEMPORARY TABLE IF EXISTS gg_map;
