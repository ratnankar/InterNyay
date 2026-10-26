-- InterNyay V44: details of a case that the eCourts case page gives and the app did not keep
--   case_stage        - "Case Stage" of the page (Arguments, Evidence...), changes from hearing to hearing
--   acts_sections     - the acts and sections the case is under, as "Act - Section 175(3); Act 2 - Section 138"
--   registration_date - registration date, first_hearing_date - first hearing date
--   efiling_no        - e-Filing number
--   decision_date, disposal_nature - only a decided case has them
ALTER TABLE cases
  ADD COLUMN case_stage        VARCHAR(255)  NULL,
  ADD COLUMN acts_sections     VARCHAR(1000) NULL,
  ADD COLUMN registration_date DATE          NULL,
  ADD COLUMN first_hearing_date DATE         NULL,
  ADD COLUMN efiling_no        VARCHAR(100)  NULL,
  ADD COLUMN decision_date     DATE          NULL,
  ADD COLUMN disposal_nature   VARCHAR(255)  NULL;
