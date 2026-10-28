-- True for an application that was added together with a new case: its case details (title, case no., CNR, client, court)
-- can be edited from the application. Older applications are treated as filed in an existing case.
ALTER TABLE misc_applications ADD COLUMN case_created_here BOOLEAN NOT NULL DEFAULT FALSE;
