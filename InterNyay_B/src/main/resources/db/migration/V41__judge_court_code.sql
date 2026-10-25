-- Optional court code of a listing (judges table = listings). Left empty unless the admin fills it in.
ALTER TABLE judges ADD COLUMN court_code VARCHAR(255) NULL;
