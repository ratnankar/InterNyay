-- Renames judges.court_reader_mobile to court_reader_phone so every phone field in the app is called "phone".
-- Only the column name changes; the data stays as it is. Nothing is dropped.
ALTER TABLE judges CHANGE COLUMN court_reader_mobile court_reader_phone VARCHAR(255) NULL;
