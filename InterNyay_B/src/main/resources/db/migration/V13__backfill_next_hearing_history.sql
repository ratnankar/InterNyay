INSERT INTO hearings (`date`, case_id, user_id, created_at, updated_at)
SELECT c.next_hearing, c.id, c.user_id, NOW(6), NOW(6)
FROM cases c
WHERE c.next_hearing IS NOT NULL
  AND (c.deleted IS NULL OR c.deleted = 0)
  AND NOT EXISTS (
    SELECT 1 FROM hearings h
    WHERE h.case_id = c.id AND h.user_id = c.user_id AND h.`date` = c.next_hearing
  );
