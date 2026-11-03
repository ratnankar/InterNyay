-- More run times for one background job, set from Admin > Schedulers. The first time stays in cron_expr; any further
-- times are kept here, one cron per entry, separated by "|". NULL means the job runs at its one time only.
ALTER TABLE scheduler_settings ADD COLUMN extra_crons VARCHAR(600) NULL;
