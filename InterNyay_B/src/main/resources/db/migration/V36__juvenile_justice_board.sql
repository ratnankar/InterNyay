-- A court room can be marked as a Juvenile Justice Board (Admin > Courts). Cases heard there have no CNR number, so
-- nothing is read from eCourts for them (no cause list number, no hearing sync, no orders)
ALTER TABLE courts ADD COLUMN juvenile_justice_board BOOLEAN NOT NULL DEFAULT FALSE;
