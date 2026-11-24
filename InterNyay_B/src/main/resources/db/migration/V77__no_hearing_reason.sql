-- Optional reason the advocate gives for marking a date as a no-hearing date
ALTER TABLE no_hearing_dates ADD COLUMN reason VARCHAR(255) NULL;
