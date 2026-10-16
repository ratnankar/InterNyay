-- A court can have no judge for a while (a judge is transferred and the next one has not joined yet).
-- Such a court stays a normal listing whose judge is one special profile, "Vacant". That way every list, history and
-- successor-court screen keeps working, and the gap shows in the court's history as a period held by "Vacant".
ALTER TABLE judge_profiles ADD COLUMN vacant BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO judge_profiles (name, name_key, photo, active, vacant, created_at, updated_at)
SELECT 'Vacant', 'vacant', NULL, TRUE, TRUE, NOW(6), NOW(6)
WHERE NOT EXISTS (SELECT 1 FROM judge_profiles WHERE vacant = TRUE);
