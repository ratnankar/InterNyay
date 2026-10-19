-- Login log: which app the request came from.
--   WEB      = the InterNyay website (also every request that names no app)
--   CALENDAR = the InterNyay Calendar mobile app (sends the header X-Client-App: calendar)
-- Rows written before this column existed are labelled WEB.
ALTER TABLE login_log
  ADD COLUMN app ENUM('WEB','CALENDAR') NOT NULL DEFAULT 'WEB' AFTER method,
  ADD KEY idx_login_log_app (app, created_at);
