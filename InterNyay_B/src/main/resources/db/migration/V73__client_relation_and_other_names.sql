-- "Son of" style relation (S/o, D/o, W/o, ...) with the relative's name, and other names a client is known by
ALTER TABLE clients
  ADD COLUMN relation_type VARCHAR(10)  NULL,
  ADD COLUMN relation_name VARCHAR(255) NULL,
  ADD COLUMN other_names   TEXT         NULL;
