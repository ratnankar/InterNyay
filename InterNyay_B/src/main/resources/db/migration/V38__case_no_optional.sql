-- A case heard by a Juvenile Justice Board has no case number requirement (nor a CNR), so the column may be empty.
-- The unique key (user_id, case_no) from V35 still holds: MySQL allows many NULLs in a unique key
ALTER TABLE cases MODIFY case_no VARCHAR(255) NULL;
