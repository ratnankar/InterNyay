-- A case added by CNR may be saved without a client (the advocate can add one later)
ALTER TABLE cases MODIFY client_id BIGINT NULL;
