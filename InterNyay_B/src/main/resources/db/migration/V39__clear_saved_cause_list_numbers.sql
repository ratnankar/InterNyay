-- One-time cleanup: removes every cause list number saved earlier (they came from the old eCourts API fetch),
-- so the new cause list scraping starts from empty. Runs once; Flyway never repeats it.
UPDATE cases
SET listing_no = NULL,
    listing_date = NULL
WHERE listing_no IS NOT NULL
   OR listing_date IS NOT NULL;
