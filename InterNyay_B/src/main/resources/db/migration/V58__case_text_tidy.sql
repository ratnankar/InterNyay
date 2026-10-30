-- InterNyay V58: one way of writing the same thing in existing cases (what the app now does on every save)
--   1. case numbers: "CR Cases/6871/2025" and "CR Cases 6871 / 2025" become "CR Cases 6871/2025"
--      (a row whose new number would meet another live case of the same advocate is left as it is, so the unique key never fails)
--   2. case stage: no space after "/", capitals like the rest ("Misc. cases" -> "Misc. Cases", "On Charge" -> "on Charge")
--   3. FIR number: no spaces around "/"
--   4. FIR section / acts typed by hand ("457/380/411/34 of IPC") get the form of the portal ("IPC - Section 457,380,411,34")

-- 1. Case numbers. Worked out in a helper table first, because MySQL cannot read and change cases in the same statement
DROP TABLE IF EXISTS tmp_case_no_fix;
CREATE TABLE tmp_case_no_fix AS
SELECT id, user_id, deleted,
       REGEXP_REPLACE(TRIM(REGEXP_REPLACE(case_no, ' {2,}', ' ')),
                      '^(.*[A-Za-z.]) *[/ ] *([0-9]+) */ *([0-9]{4})$', '$1 $2/$3') AS new_no
FROM cases
WHERE case_no IS NOT NULL AND case_no <> '';

-- Nothing to do when the number is already in that form
DELETE t FROM tmp_case_no_fix t JOIN cases c ON c.id = t.id WHERE CAST(c.case_no AS BINARY) = CAST(t.new_no AS BINARY);

-- Two live cases of one advocate that would get the same number: leave both
DELETE t FROM tmp_case_no_fix t
JOIN (SELECT user_id, new_no FROM tmp_case_no_fix WHERE deleted = b'0' GROUP BY user_id, new_no HAVING COUNT(*) > 1) d
  ON d.user_id = t.user_id AND d.new_no = t.new_no
WHERE t.deleted = b'0';

-- A live case that would get the number of another live case: leave it
DELETE t FROM tmp_case_no_fix t
JOIN cases o ON o.user_id = t.user_id AND o.id <> t.id AND o.deleted = b'0' AND o.case_no = t.new_no
WHERE t.deleted = b'0';

UPDATE cases c JOIN tmp_case_no_fix t ON t.id = c.id SET c.case_no = t.new_no;

-- The cases left out above (list them with: SELECT id, user_id, case_no FROM cases WHERE deleted = 0
--   AND case_no REGEXP '^.*[A-Za-z.] */ *[0-9]+ */ *[0-9]{4}$') can be corrected by hand
DROP TABLE tmp_case_no_fix;

-- 2. Case stage
UPDATE cases SET case_stage = REGEXP_REPLACE(case_stage, ' *\\/ *', '/') WHERE case_stage REGEXP ' \\/|\\/ ';
UPDATE cases SET case_stage = REPLACE(case_stage, ' cases', ' Cases') WHERE CAST(case_stage AS BINARY) LIKE '% cases';
UPDATE cases SET case_stage = REPLACE(case_stage, ' On ', ' on ')     WHERE CAST(case_stage AS BINARY) LIKE '% On %';
UPDATE cases SET case_stage = 'Arguments on Charge' WHERE case_stage IN ('Argument on Charge', 'Arguments on Charge');

-- 3. FIR number
UPDATE cases SET fir_no = TRIM(REGEXP_REPLACE(fir_no, ' *\\/ *', '/')) WHERE fir_no REGEXP ' \\/|\\/ |^ | $';

-- 4. Acts typed by hand. Only the two forms seen in practice are changed here, the rest is tidied when the case is next saved:
--      "<sections> of <act>"                          e.g. 457/380/411/34 of IPC
--      "<sections> of <act> & <section> <act>"        e.g. 376/342/506 of IPC & 6 POCSO Act
--    <sections> is a list of numbers with an optional letter or brackets: 354D, 351(2)
-- 4a. One act. A short name (IPC, BNS) is written in capitals
UPDATE cases SET fir_section = CONCAT(
        IF(CHAR_LENGTH(REGEXP_REPLACE(fir_section, '^.* of ', '')) <= 5, UPPER(REGEXP_REPLACE(fir_section, '^.* of ', '')), REGEXP_REPLACE(fir_section, '^.* of ', '')),
        ' - Section ', REPLACE(REPLACE(REGEXP_REPLACE(fir_section, ' of .*$', ''), ' ', ''), '/', ','))
WHERE fir_section REGEXP '^[0-9]+[A-Za-z]?(\\([A-Za-z0-9]+\\))?([/,][0-9]+[A-Za-z]?(\\([A-Za-z0-9]+\\))?)* of [A-Za-z][A-Za-z .]*$';

UPDATE cases SET acts_sections = CONCAT(
        IF(CHAR_LENGTH(REGEXP_REPLACE(acts_sections, '^.* of ', '')) <= 5, UPPER(REGEXP_REPLACE(acts_sections, '^.* of ', '')), REGEXP_REPLACE(acts_sections, '^.* of ', '')),
        ' - Section ', REPLACE(REPLACE(REGEXP_REPLACE(acts_sections, ' of .*$', ''), ' ', ''), '/', ','))
WHERE acts_sections REGEXP '^[0-9]+[A-Za-z]?(\\([A-Za-z0-9]+\\))?([/,][0-9]+[A-Za-z]?(\\([A-Za-z0-9]+\\))?)* of [A-Za-z][A-Za-z .]*$';

-- 4b. Two acts joined by "&": the second act gets its section number first, then the name (POCSo -> POCSO)
UPDATE cases SET fir_section = REPLACE(REPLACE(REGEXP_REPLACE(fir_section,
        '^([0-9][0-9A-Za-z()/,]*) of ([A-Za-z]{2,5}) & ([0-9]+[A-Za-z]?) ([A-Za-z .]+)$', '$2 - Section $1; $4 - Section $3'), '/', ','), 'POCSo', 'POCSO')
WHERE fir_section REGEXP '^[0-9][0-9A-Za-z()/,]* of [A-Za-z]{2,5} & [0-9]+[A-Za-z]? [A-Za-z .]+$';

UPDATE cases SET acts_sections = REPLACE(REPLACE(REGEXP_REPLACE(acts_sections,
        '^([0-9][0-9A-Za-z()/,]*) of ([A-Za-z]{2,5}) & ([0-9]+[A-Za-z]?) ([A-Za-z .]+)$', '$2 - Section $1; $4 - Section $3'), '/', ','), 'POCSo', 'POCSO')
WHERE acts_sections REGEXP '^[0-9][0-9A-Za-z()/,]* of [A-Za-z]{2,5} & [0-9]+[A-Za-z]? [A-Za-z .]+$';

-- Letters left in a list of sections by "N.I. ACT": "Section 138,N,I,ACT" -> "Section 138"
UPDATE cases SET acts_sections = REGEXP_REPLACE(acts_sections, '(?<=[0-9)]),([A-Za-z]{1,4},)*[A-Za-z]{1,4}(?=;|$)', '') WHERE acts_sections REGEXP '[0-9)],[A-Za-z]{1,4}(,|;|$)';
