-- The 12 AM runs and the cause list run log cleanup no longer exist (the run log is kept for good)
DELETE FROM scheduler_settings WHERE job_key IN ('causelist_midnight', 'nexthearing_midnight', 'causelist_cleanup');
