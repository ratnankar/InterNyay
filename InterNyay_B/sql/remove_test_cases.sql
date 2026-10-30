-- Soft-deletes the four entries that look like test data in the sample you sent (ids 5, 70, 71, 79).
-- Each id is checked against what the sample showed, so a different case that now has one of these ids is never touched.
-- Look first:
SELECT id, user_id, title, case_no, cnr_no, status FROM cases
WHERE id IN (5, 70, 71, 79);

-- Prefer deleting them with "Delete Case" in the app (it also releases the file number and the hearings).
-- This is the fallback when you want it done in the database:
UPDATE cases SET deleted = b'1', deleted_at = NOW(6)
WHERE deleted = b'0' AND (
     (id = 5  AND cnr_no = 'DLHC123456123456')
  OR (id = 70 AND cnr_no = 'DLST123456789012')
  OR (id = 71 AND case_no IS NULL AND cnr_no IS NULL AND title LIKE 'State v%Naresh%')   -- confirm this one is not a real case
  OR (id = 79 AND title = 'ef'));
