-- The hearing date choice of each further run time of a job (Admin > Schedulers). One entry per entry of extra_crons, in
-- the same order, separated by "|"; an empty entry (or NULL) means the same choice as the job's first time (target).
ALTER TABLE scheduler_settings ADD COLUMN extra_targets VARCHAR(400) NULL;
