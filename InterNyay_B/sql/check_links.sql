-- Optional: read-only report on how well the data is linked.
-- Nothing is changed or deleted. Run it any time, for example after importing data or before a release.
--
-- Part A counts the foreign keys the database enforces (the 22 named keys of V1__create_schema.sql, plus the other keys of that file).
-- Part B checks links that MySQL cannot enforce because the tables only share a name, not an id.
--   A number above 0 in part B is something to review, not always an error: for example a judge may sit in a
--   court that is not in the courts table yet.

USE internyay;

-- ---------- Part A: enforced links ----------

SELECT COUNT(*) AS named_keys /* expected: 22 */
FROM information_schema.TABLE_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = 'internyay' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  AND CONSTRAINT_NAME IN ('fk_users_plan','fk_court_no_judge','fk_duty_judge','fk_bail_link_one','fk_bail_link_two',
                          'fk_reply_message','fk_message_account','fk_email_otp_account','fk_no_hearing_user',
                          'fk_dismissal_user','fk_dismissal_notice','fk_wa_log_user','fk_wa_log_case','fk_wa_log_client',
                          'fk_documents_case','fk_documents_client','fk_documents_user','fk_qr_user',
                          'fk_judges_court','fk_cases_police_station','fk_bail_judges_roster','fk_bail_judges_judge');

SELECT COUNT(*) AS all_foreign_keys_in_database
FROM information_schema.TABLE_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = 'internyay' AND CONSTRAINT_TYPE = 'FOREIGN KEY';

-- ---------- Part B: links kept by name (review any number above 0) ----------

SELECT 'judges whose court + district is not in courts' AS check_name, COUNT(*) AS rows_to_review
FROM judges j
WHERE NOT EXISTS (SELECT 1 FROM courts c WHERE c.court = j.court AND c.district = j.district)
UNION ALL
SELECT 'cases with a police station name not in police_stations', COUNT(*)
FROM cases cs
WHERE cs.police_station IS NOT NULL AND TRIM(cs.police_station) <> ''
  AND NOT EXISTS (SELECT 1 FROM police_stations ps WHERE ps.name = cs.police_station)
UNION ALL
SELECT 'police districts whose court is not in courts', COUNT(*)
FROM police_districts pd
WHERE pd.court IS NOT NULL AND TRIM(pd.court) <> ''
  AND NOT EXISTS (SELECT 1 FROM courts c WHERE c.court = pd.court);

-- ---------- Part C: judge ids stored as a comma list in bail_roster_records ----------
-- Lists every roster row that names a judge id that no longer exists. Needs MySQL 8.0.4 or newer.
-- No rows returned means every id in every list still points at a judge.

SELECT b.id AS roster_row_id, TRIM(t.jid) AS missing_judge_id
FROM bail_roster_records b
JOIN JSON_TABLE(
       CONCAT('["', REPLACE(REPLACE(b.judicial_officer_ids, ' ', ''), ',', '","'), '"]'),
       '$[*]' COLUMNS (jid VARCHAR(20) PATH '$')
     ) t
LEFT JOIN judges j ON j.id = CAST(t.jid AS UNSIGNED)
WHERE b.judicial_officer_ids IS NOT NULL AND TRIM(b.judicial_officer_ids) <> ''
  AND TRIM(t.jid) REGEXP '^[0-9]+$'
  AND j.id IS NULL;


-- ---------- Part D: the id links filled from the names (review any number above 0) ----------

SELECT 'judges without court_id (court + district not in courts)' AS check_name, COUNT(*) AS rows_to_review
FROM judges WHERE court_id IS NULL
UNION ALL
SELECT 'cases with a station name but no police_station_id (unknown or ambiguous name)', COUNT(*)
FROM cases WHERE police_station_id IS NULL AND police_station IS NOT NULL AND TRIM(police_station) <> ''
UNION ALL
SELECT 'bail roster judge ids in the comma list but not in bail_roster_judges', COUNT(*)
FROM bail_roster_records b
JOIN JSON_TABLE(
       CONCAT('["', REPLACE(REPLACE(b.judicial_officer_ids, ' ', ''), ',', '","'), '"]'),
       '$[*]' COLUMNS (jid VARCHAR(20) PATH '$')
     ) t
JOIN judges j ON j.id = CAST(TRIM(t.jid) AS UNSIGNED)
LEFT JOIN bail_roster_judges rj ON rj.roster_id = b.id AND rj.judge_id = j.id
WHERE b.judicial_officer_ids IS NOT NULL AND TRIM(b.judicial_officer_ids) <> ''
  AND TRIM(t.jid) REGEXP '^[0-9]+$' AND rj.id IS NULL;
