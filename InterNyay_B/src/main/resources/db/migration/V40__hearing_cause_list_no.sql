-- A hearing keeps its own cause list number. The number on the case row is cleared when the case moves to its next date,
-- so without this a hearing that is already heard has nowhere to keep (or get) the number it was listed under.
ALTER TABLE hearings ADD COLUMN listing_no INT NULL;

-- Numbers still sitting on a case row for a date that has a hearing entry belong to that hearing too
UPDATE hearings h
JOIN cases c ON c.id = h.case_id AND c.listing_date = h.`date`
SET h.listing_no = c.listing_no
WHERE c.listing_no IS NOT NULL;
