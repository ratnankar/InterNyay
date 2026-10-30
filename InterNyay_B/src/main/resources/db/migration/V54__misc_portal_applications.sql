ALTER TABLE cases ADD COLUMN misc_portal BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE misc_applications ADD COLUMN portal_synced BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO misc_applications (case_id, user_id, application_type, filing_date, hearing_date, status, case_created_here, portal_synced, created_at, updated_at)
SELECT c.id, c.user_id,
       COALESCE(NULLIF(TRIM(c.case_type), ''), 'Misc. Application'),
       c.filing_date,
       c.next_hearing,
       CASE WHEN c.status IN ('Decided', 'Withdrawn') THEN 'Disposed Off' ELSE 'Pending' END,
       TRUE,
       TRUE,
       NOW(6),
       NOW(6)
FROM cases c
WHERE (c.deleted IS NULL OR c.deleted = 0)
  AND c.cnr_no IS NOT NULL AND TRIM(c.cnr_no) <> ''
  AND c.case_no REGEXP '(^|[^A-Za-z])MISC([^A-Za-z]|$)'
  AND NOT EXISTS (SELECT 1 FROM misc_applications m WHERE m.case_id = c.id);

UPDATE cases c SET c.misc_portal = TRUE
WHERE EXISTS (SELECT 1 FROM misc_applications m WHERE m.case_id = c.id AND m.portal_synced = TRUE);
