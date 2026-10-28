-- Which hearing date(s) a background job looks up (today, tomorrow, ...), set from Admin > Schedulers.
-- NULL means the job has no date choice, or uses its own default until the admin saves one.
ALTER TABLE scheduler_settings ADD COLUMN target VARCHAR(30) NULL;
