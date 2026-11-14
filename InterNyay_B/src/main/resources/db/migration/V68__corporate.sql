-- V68: Corporate accounts. A firm on a corporate plan creates advocate accounts for its hired advocates and allots cases to them
-- by uploading PDFs (the CNR numbers in each PDF are read and given to the chosen advocate).

-- A hired advocate is an ordinary advocate account that belongs to a firm
ALTER TABLE users ADD COLUMN corporate_id BIGINT NULL;
ALTER TABLE users ADD CONSTRAINT fk_users_corporate FOREIGN KEY (corporate_id) REFERENCES users (id);
CREATE INDEX idx_users_corporate ON users (corporate_id);

-- PDFs the firm uploaded for allotment (one PDF can carry several CNR numbers)
CREATE TABLE corporate_pdfs (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  firm_id     BIGINT       NOT NULL,
  file_name   VARCHAR(255) NOT NULL,
  storage_key VARCHAR(255) NOT NULL,
  created_at  DATETIME     NOT NULL,
  CONSTRAINT fk_corporate_pdfs_firm FOREIGN KEY (firm_id) REFERENCES users (id)
);
CREATE INDEX idx_corporate_pdfs_firm ON corporate_pdfs (firm_id);

-- One row per case the firm allotted: the CNR number, the advocate it went to and the PDF it came from
CREATE TABLE corporate_allotments (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  firm_id      BIGINT      NOT NULL,
  advocate_id  BIGINT      NOT NULL,
  pdf_id       BIGINT      NULL,
  cnr_no       VARCHAR(16) NOT NULL,
  batch_id     VARCHAR(40) NOT NULL,
  created_at   DATETIME    NOT NULL,
  updated_at   DATETIME    NOT NULL,
  CONSTRAINT fk_allot_firm     FOREIGN KEY (firm_id)     REFERENCES users (id),
  CONSTRAINT fk_allot_advocate FOREIGN KEY (advocate_id) REFERENCES users (id),
  CONSTRAINT fk_allot_pdf      FOREIGN KEY (pdf_id)      REFERENCES corporate_pdfs (id) ON DELETE SET NULL,
  CONSTRAINT uk_allot_firm_cnr UNIQUE (firm_id, cnr_no)
);
CREATE INDEX idx_allot_advocate ON corporate_allotments (advocate_id);

-- The corporate plan. Audience BOTH so a firm can request it from My Plan and an admin can assign it (a BUSINESS-only plan cannot be
-- given to an advocate account). Edit the numbers later in Admin -> Plans
INSERT INTO plans
  (code, name, tagline, price_monthly, discount_price, price_yearly, discount_price_yearly,
   coming_soon, audience, most_popular, associate_limit, features, feature_keys, sort_order)
VALUES
  ('CORPORATE', 'Corporate', 'For firms with hired advocates', 4999, NULL, 49990, NULL,
   0, 'BOTH', 0, 25,
   'Advocate accounts for your hired advocates\nAllot cases in bulk from PDFs\nEverything in Business',
   'corporate,documents,office_expenses,transactions,legal_forms,court_fee_calculator,whatsapp_reminders,chat_assistant', 5) AS new_plan
ON DUPLICATE KEY UPDATE
  name = new_plan.name, tagline = new_plan.tagline, price_monthly = new_plan.price_monthly,
  price_yearly = new_plan.price_yearly, audience = new_plan.audience, associate_limit = new_plan.associate_limit,
  features = new_plan.features, feature_keys = new_plan.feature_keys, sort_order = new_plan.sort_order;
