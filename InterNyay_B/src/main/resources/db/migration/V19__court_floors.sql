ALTER TABLE courts ADD COLUMN floor VARCHAR(50) NOT NULL DEFAULT '' AFTER building;
ALTER TABLE courts DROP INDEX uk_court_place;
ALTER TABLE courts ADD CONSTRAINT uk_court_place UNIQUE (court, district, building, floor, court_no);
ALTER TABLE judges ADD COLUMN floor VARCHAR(255) NULL AFTER building;
ALTER TABLE judge_court_no_records ADD COLUMN floor VARCHAR(255) NULL AFTER building;
