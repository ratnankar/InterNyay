-- V69: Corporate allotment now reads the MIS spreadsheets (.xlsx) instead of PDFs. The uploaded file keeps its table (renamed) and
-- every allotment keeps the few MIS details an advocate needs to recognise the case before adding it.

ALTER TABLE corporate_pdfs RENAME TO corporate_sheets;

ALTER TABLE corporate_allotments DROP FOREIGN KEY fk_allot_pdf;
ALTER TABLE corporate_allotments CHANGE COLUMN pdf_id sheet_id BIGINT NULL;
ALTER TABLE corporate_allotments
  ADD CONSTRAINT fk_allot_sheet FOREIGN KEY (sheet_id) REFERENCES corporate_sheets (id) ON DELETE SET NULL;

ALTER TABLE corporate_allotments
  ADD COLUMN cc_no       VARCHAR(60)  NULL,
  ADD COLUMN court_name  VARCHAR(120) NULL,
  ADD COLUMN accused     VARCHAR(255) NULL,
  ADD COLUMN next_date   DATE         NULL,
  ADD COLUMN case_status VARCHAR(80)  NULL;

-- The plan text said "from PDFs"
UPDATE plans
   SET features = 'Advocate accounts for your hired advocates\nAllot cases in bulk from your MIS spreadsheets\nEverything in Business'
 WHERE code = 'CORPORATE';
