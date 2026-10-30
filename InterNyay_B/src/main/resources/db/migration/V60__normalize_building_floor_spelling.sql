-- Same building / floor written one way everywhere.
-- Older rosters (V28, V29, V30, V42, V43) wrote "Main building" and "Main court building"; the app and the
-- database compare these without regard to capitals, so only the display differed. Those files cannot be
-- edited (Flyway checksum), so this migration fixes the stored values instead.
-- Safe to run more than once, and a no-op on a database that was already fixed by hand.
-- "Main Building" and "Main Court Building" are kept as two buildings on purpose.

UPDATE courts                 SET building = 'Main Building'       WHERE BINARY building = BINARY 'Main building';
UPDATE courts                 SET building = 'Main Court Building' WHERE BINARY building = BINARY 'Main court building';
UPDATE cases                  SET building = 'Main Building'       WHERE BINARY building = BINARY 'Main building';
UPDATE cases                  SET building = 'Main Court Building' WHERE BINARY building = BINARY 'Main court building';
UPDATE judges                 SET building = 'Main Building'       WHERE BINARY building = BINARY 'Main building';
UPDATE judges                 SET building = 'Main Court Building' WHERE BINARY building = BINARY 'Main court building';
UPDATE judge_court_no_records SET building = 'Main Building'       WHERE BINARY building = BINARY 'Main building';
UPDATE judge_court_no_records SET building = 'Main Court Building' WHERE BINARY building = BINARY 'Main court building';

UPDATE courts                 SET floor = '3rd Floor' WHERE BINARY floor = BINARY '3rd floor';
UPDATE cases                  SET floor = '3rd Floor' WHERE BINARY floor = BINARY '3rd floor';
UPDATE judges                 SET floor = '3rd Floor' WHERE BINARY floor = BINARY '3rd floor';
UPDATE judge_court_no_records SET floor = '3rd Floor' WHERE BINARY floor = BINARY '3rd floor';
