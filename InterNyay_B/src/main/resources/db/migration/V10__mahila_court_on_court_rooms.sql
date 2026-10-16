UPDATE courts c
JOIN judges j
  ON j.active = TRUE
 AND j.mahila_court = TRUE
 AND j.court = c.court
 AND j.district = c.district
 AND COALESCE(j.building, '') = c.building
 AND j.court_room_no = c.court_no
SET c.mahila_court = TRUE
WHERE c.court_no <> '';

ALTER TABLE judges DROP COLUMN mahila_court;
