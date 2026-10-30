-- Police challan cases titled "State v. ..." where our client is marked COMPLAINANT: the State is the complainant, so our
-- client is the accused. Run by hand after a backup.
-- It runs in a transaction that ends with ROLLBACK, so nothing is kept the first time: look at the counts, then change the
-- last line to COMMIT and run it again.
--
-- Three places hold the side: the roles of the clients (case_client_sub_types), the roles of the people on our side who are
-- not clients (case_non_clients) and cases.client_side. The opposite parties keep no role, so they need no change.
-- (cases is changed last, because the other two updates find their cases by the old side.)

-- Preview
SELECT id, user_id, title, client_side FROM cases
WHERE deleted = b'0' AND relief_sought = 'Police Challan' AND title LIKE 'State v.%' AND client_side = 'COMPLAINANT';

START TRANSACTION;

UPDATE case_client_sub_types s JOIN cases c ON c.id = s.case_id
SET s.sub_type = 'Accused'
WHERE s.sub_type = 'Complainant'
  AND c.deleted = b'0' AND c.relief_sought = 'Police Challan' AND c.title LIKE 'State v.%' AND c.client_side = 'COMPLAINANT';
SELECT ROW_COUNT() AS client_roles_changed;

UPDATE case_non_clients n JOIN cases c ON c.id = n.case_id
SET n.sub_type = 'Accused'
WHERE n.sub_type = 'Complainant'
  AND c.deleted = b'0' AND c.relief_sought = 'Police Challan' AND c.title LIKE 'State v.%' AND c.client_side = 'COMPLAINANT';
SELECT ROW_COUNT() AS non_client_roles_changed;

UPDATE cases SET client_side = 'ACCUSED'
WHERE deleted = b'0' AND relief_sought = 'Police Challan' AND title LIKE 'State v.%' AND client_side = 'COMPLAINANT';
SELECT ROW_COUNT() AS cases_changed;

ROLLBACK;   -- change to COMMIT after checking the three counts above
