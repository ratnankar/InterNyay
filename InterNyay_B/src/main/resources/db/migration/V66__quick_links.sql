CREATE TABLE quick_link_groups (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  title      VARCHAR(120) NOT NULL,
  sort_order INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_quick_link_groups_order (sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE quick_links (
  id          BIGINT        NOT NULL AUTO_INCREMENT,
  group_id    BIGINT        NOT NULL,
  label       VARCHAR(200)  NOT NULL,
  description VARCHAR(500)  NULL,
  url         VARCHAR(1000) NOT NULL,
  icon        VARCHAR(40)   NOT NULL DEFAULT 'clip',
  sort_order  INT           NOT NULL DEFAULT 0,
  enabled     BIT(1)        NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_quick_links_group (group_id, sort_order, id),
  CONSTRAINT fk_quick_links_group FOREIGN KEY (group_id) REFERENCES quick_link_groups (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO quick_link_groups (id, title, sort_order) VALUES
(1, 'Court Payments', 0),
(2, 'Pre-Institution Mediation', 1),
(3, 'Challans & Traffic Notices', 2);

INSERT INTO quick_links (group_id, label, description, url, icon, sort_order, enabled) VALUES
(1, 'Court Fees Payment', 'ePay eCourts — court fee, judicial deposit, fine, penalty and other payments', 'https://pay.ecourts.gov.in/epay/', 'receipt', 0, 1),
(1, 'DLSA Gurugram Cost', 'SBI Collect — cost deposit to District Legal Services Authority, Gurugram', 'https://sbcollect.sbi.bank.in/sbicollect/icollecthome.htm?corpID=5383434', 'money', 1, 1),
(2, 'DLSA Pre Mediation Bank Account Details', 'DSLSA — bank details for fees, application form, protocol and designated email IDs', 'https://dslsa.org/mandatory-pre-institution-mediation-case-commercial-matters/', 'bank', 0, 1),
(3, 'Delhi Challan Virtual Court', 'Virtual Courts — settle Delhi traffic and notice challans online', 'https://vcourts.gov.in/virtualcourt/', 'gavel', 0, 1),
(3, 'eChallan', 'Parivahan — check and pay a challan as the accused', 'https://echallan.parivahan.gov.in/index/accused-challan', 'card', 1, 1),
(3, 'Delhi Traffic', 'Delhi Traffic Police — pay pending notices by vehicle or notice number', 'https://traffic.delhipolice.gov.in/notice/pay-notice', 'shield', 2, 1);
