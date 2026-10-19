-- How a disposed off misc. application ended: Allowed or Disallowed (empty for pending ones and older disposals)
ALTER TABLE misc_applications ADD COLUMN disposal_outcome VARCHAR(20) NULL;
