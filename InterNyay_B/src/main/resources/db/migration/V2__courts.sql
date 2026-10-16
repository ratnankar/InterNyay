-- V2: courts, districts and high courts (reference data).
-- Every case is linked to a row of this table (cases.court_id), so a case can only be created for a court and district listed here.
-- One row = one place. Empty text ('') means "none": court only ('Saket','','',''), court + district ('Saket','South','',''),
-- then building and court no. go in the last two columns. High courts have high_court = 1 and no district.
-- Add more places in Admin -> Courts, or with a new migration file (V<next>__more_courts.sql), never by editing this one.
SET NAMES utf8mb4;

-- Districts under each court complex
INSERT IGNORE INTO courts (court, district, building, court_no, high_court) VALUES
  ('Rohini',        'North',        '', '', 0),
  ('Rohini',        'North West',   '', '', 0),
  ('Karkardooma',   'Shahdara',     '', '', 0),
  ('Karkardooma',   'East',         '', '', 0),
  ('Karkardooma',   'North East',   '', '', 0),
  ('Tis Hazari',    'West',         '', '', 0),
  ('Tis Hazari',    'Central',      '', '', 0),
  ('Dwarka',        'South West',   '', '', 0),
  ('Saket',         'South',        '', '', 0),
  ('Saket',         'South East',   '', '', 0),
  ('Patiala House', 'New Delhi',    '', '', 0),
  ('Rouse Avenue',  'Rouse Avenue', '', '', 0);

-- Courts above the district level
INSERT IGNORE INTO courts (court, district, building, court_no, high_court) VALUES
  ('Delhi High Court',       '', '', '', 1),
  ('Supreme Court of India', '', '', '', 1);
