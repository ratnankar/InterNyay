-- Read-only checks of the cases table. Nothing here changes data: run each query, look at the rows, then decide.
-- Replace 1 with the advocate's user id where a query has :user_id

-- 1. Building / floor written in more than one way (they are copied from the court table, so fix the spelling THERE,
--    under Admin > Courts; a case then takes it when it is next saved)
SELECT LOWER(building) AS building_key, GROUP_CONCAT(DISTINCT building ORDER BY building SEPARATOR ' | ') AS spellings, COUNT(*) AS cases
FROM cases WHERE building IS NOT NULL GROUP BY LOWER(building) HAVING COUNT(DISTINCT building) > 1;
SELECT LOWER(floor) AS floor_key, GROUP_CONCAT(DISTINCT floor ORDER BY floor SEPARATOR ' | ') AS spellings, COUNT(*) AS cases
FROM cases WHERE floor IS NOT NULL GROUP BY LOWER(floor) HAVING COUNT(DISTINCT floor) > 1;
SELECT LOWER(building) AS building_key, GROUP_CONCAT(DISTINCT building ORDER BY building SEPARATOR ' | ') AS spellings
FROM courts WHERE building <> '' GROUP BY LOWER(building) HAVING COUNT(DISTINCT building) > 1;

-- 2. Cases that look like test entries: no case number and no CNR, a placeholder CNR (digits 1-2-3-4-5-6 twice),
--    or a title of a few letters. Check each before deleting
SELECT id, user_id, title, case_no, cnr_no, status, created_at
FROM cases
WHERE deleted = b'0'
  AND ((case_no IS NULL AND cnr_no IS NULL)
       OR cnr_no REGEXP '^[A-Z]{4}1234567890|^[A-Z]{4}123456123456$'
       OR CHAR_LENGTH(title) <= 3)
ORDER BY user_id, id;

-- 3. Live cases that share a CNR (the unique key on (user_id, live_cnr_no) is a plain index until these are gone)
SELECT user_id, cnr_no, COUNT(*) AS copies, GROUP_CONCAT(id) AS ids
FROM cases WHERE deleted = b'0' AND cnr_no IS NOT NULL GROUP BY user_id, cnr_no HAVING COUNT(*) > 1;

-- 4. A decided case without how it was disposed
SELECT id, user_id, title, case_no, decision_date FROM cases
WHERE status = 'Decided' AND deleted = b'0' AND (disposal_nature IS NULL OR disposal_nature = '');

-- 5. Cases where the client side may be the wrong way round: "State v. ..." with our client on the State side
SELECT id, user_id, title, client_side, relief_sought FROM cases
WHERE deleted = b'0' AND title LIKE 'State v.%' AND client_side = 'COMPLAINANT' AND relief_sought = 'Police Challan';

-- 6. Filing date that does not fit the case number's year (more than a year apart, or later than the number's year)
SELECT id, user_id, case_no, filing_date FROM cases
WHERE deleted = b'0' AND filing_date IS NOT NULL AND case_no REGEXP '/[0-9]{4}$'
  AND (YEAR(filing_date) > CAST(RIGHT(case_no, 4) AS UNSIGNED) OR CAST(RIGHT(case_no, 4) AS UNSIGNED) - YEAR(filing_date) > 1);
