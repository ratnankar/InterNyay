-- A case number only has to be unique for one advocate: a case added by CNR carries the number eCourts gives it,
-- so two advocates holding the same case would otherwise fail on the second save
ALTER TABLE cases DROP INDEX uk_cases_case_no;
ALTER TABLE cases ADD CONSTRAINT uk_cases_user_case_no UNIQUE (user_id, case_no);
