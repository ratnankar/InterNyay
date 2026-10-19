-- misc_applications.history (V21) was never used: each application keeps its dated entries in misc_application_hearings
-- (V24, with a note per hearing since V25), so the column is dropped
ALTER TABLE misc_applications DROP COLUMN history;
