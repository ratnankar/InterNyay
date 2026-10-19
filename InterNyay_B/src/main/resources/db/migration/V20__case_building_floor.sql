-- Building and floor of the court room a case is listed in, kept next to the court no.
ALTER TABLE cases ADD COLUMN building VARCHAR(255) NULL AFTER court_no;
ALTER TABLE cases ADD COLUMN floor VARCHAR(50) NULL AFTER building;

-- Fill existing cases where the court table names exactly one room for the case's court, district and court no.
UPDATE cases c
JOIN courts p ON p.id = c.court_id
JOIN (
  SELECT court, district, court_no, MIN(building) AS building, MIN(floor) AS floor
  FROM courts WHERE court_no <> ''
  GROUP BY court, district, court_no
  HAVING COUNT(*) = 1
) r ON r.court = p.court AND r.district = p.district AND r.court_no = c.court_no
SET c.building = NULLIF(r.building, ''), c.floor = NULLIF(r.floor, '')
WHERE c.court_no IS NOT NULL AND c.court_no <> '';
