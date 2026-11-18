ALTER TABLE whatsapp_message_log
  ADD COLUMN wa_message_id       VARCHAR(128) NULL,
  ADD COLUMN delivery_status     VARCHAR(16)  NULL,
  ADD COLUMN delivery_updated_at DATETIME(6)  NULL,
  ADD INDEX idx_wa_log_message_id (wa_message_id);
