-- Active listings that still have no court code after V42 (South West and Gurugram are not loaded; vacant and special seats have no portal row)
SELECT j.id, j.court, j.district, j.court_room_no, p.name, j.designation
FROM judges j JOIN judge_profiles p ON p.id = j.profile_id
WHERE j.active = TRUE AND j.court_code IS NULL
ORDER BY j.court, j.district, j.court_room_no;

-- Did V41, V42 and V43 run on this database? (success = 1)
SELECT version, description, success, installed_on FROM flyway_schema_history WHERE version IN ('41', '42', '43') ORDER BY installed_rank;

-- How many active listings have a court code, per district
SELECT court, district, COUNT(*) AS listings, SUM(court_code IS NOT NULL) AS with_code
FROM judges WHERE active = TRUE GROUP BY court, district ORDER BY court, district;

-- Active listings that share a court code inside one court and district (should return no rows)
SELECT court, district, court_code, COUNT(*) AS listings, GROUP_CONCAT(court_room_no ORDER BY court_room_no) AS court_nos
FROM judges WHERE active = TRUE AND court_code IS NOT NULL
GROUP BY court, district, court_code HAVING COUNT(*) > 1;
