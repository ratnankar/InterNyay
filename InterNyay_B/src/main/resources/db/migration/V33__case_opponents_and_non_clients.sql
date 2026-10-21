-- A case can have more than one opposite party, and our side can include people who are not saved as clients.
--
-- case_opposing_parties: every opposite party of a case (name, father's name, address, phone).
-- case_non_clients:      people on our side of a case who are not in the clients list. They can later be marked as a
--                        client; the app then creates the client, links it to the case and removes the row here.
--                        sub_type is their role in the case (Accused, Complainant, ...), like case_client_sub_types
--                        holds for clients.
-- Rows are listed in id order, which is the order they were entered in.

CREATE TABLE case_opposing_parties (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  case_id     BIGINT       NOT NULL,
  name        VARCHAR(255) NOT NULL,
  father_name VARCHAR(255),
  address     VARCHAR(500),
  phone       VARCHAR(30),
  PRIMARY KEY (id),
  KEY idx_case_opposing_parties_case (case_id),
  CONSTRAINT fk_case_opposing_parties_case FOREIGN KEY (case_id) REFERENCES cases (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE case_non_clients (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  case_id     BIGINT       NOT NULL,
  name        VARCHAR(255) NOT NULL,
  father_name VARCHAR(255),
  address     VARCHAR(500),
  phone       VARCHAR(30),
  sub_type    VARCHAR(40),
  PRIMARY KEY (id),
  KEY idx_case_non_clients_case (case_id),
  CONSTRAINT fk_case_non_clients_case FOREIGN KEY (case_id) REFERENCES cases (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The single opposite party every case had until now becomes the first row of the new table
INSERT INTO case_opposing_parties (case_id, name, father_name, address, phone)
SELECT id, TRIM(opposing_party), opposing_father_name, opposing_address, opposing_phone
FROM cases
WHERE opposing_party IS NOT NULL AND TRIM(opposing_party) <> '';

-- Now held in case_opposing_parties
ALTER TABLE cases
  DROP COLUMN opposing_party,
  DROP COLUMN opposing_father_name,
  DROP COLUMN opposing_address,
  DROP COLUMN opposing_phone;
