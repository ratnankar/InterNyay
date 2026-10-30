ALTER TABLE misc_applications ADD COLUMN linked_case_id BIGINT NULL;
CREATE INDEX idx_misc_applications_linked_case ON misc_applications (linked_case_id);
