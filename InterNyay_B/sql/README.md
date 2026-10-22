# InterNyay database (Flyway)

The schema and the reference data are managed by **Flyway**. The backend applies the files in
`src/main/resources/db/migration/` by itself every time it starts, in version order, and records each one in the
`flyway_schema_history` table. Hibernate runs with `ddl-auto=validate`: it only checks that the tables match the entities
and refuses to start if they do not. It never changes the database.

| File | What it does |
| --- | --- |
| `V1__create_schema.sql` | All tables, indexes and foreign keys (`users.court_preferences` holds the court ids a user works at, comma separated) |
| `V2__courts.sql` | Courts, districts and the two high courts |
| `V3__police_directory.sql` | Police districts, sub-divisions, stations and directory settings |
| `V4__drt_jurisdiction.sql` | DRT tribunals and the stations each covers |
| `V5__consumer_jurisdiction.sql` | Consumer commissions and the stations each covers |
| `V6__plans.sql` | Subscription plans (Free, Basic, Professional, Business) |
| `V7__option_items.sql` | `option_items`: the dropdown choices the admin edits (case catalogue incl. High Court and Supreme Court case types, client and document types, ...) with their starting values |
| `V8__judge_change_and_released.sql` | Court history keeps the name of the judge who sat in each court no. period |
| `V9__judge_profiles_and_listings.sql` | Judges List split into `judge_profiles` (the judge) and `judges` (the court listing held by one profile) |
| `V10__mahila_court_on_court_rooms.sql` | Mahila court flag moves from the judge listing to the court room (`courts.mahila_court`) |
| `V11__drop_released_judges.sql` | Drops the unused `released_judges` table |
| `V12__vacant_court.sql` | `judge_profiles.vacant` and one special profile, "Vacant", for a court whose judge was transferred and the next one has not joined yet |
| `V13__backfill_next_hearing_history.sql` | Adds a hearing-history entry for every case whose next hearing date had none |
| `V14__court_reader_phone.sql` | Renames `judges.court_reader_mobile` to `court_reader_phone` (data unchanged) |
| `V15__chat_history.sql` | `chat_messages`: the saved conversation of each account with the AI assistant (deleted together with the account) |
| `V16__chat_conversations.sql` | `chat_conversations`: several saved chats per account; each existing conversation becomes one chat, titled with its first question |
| `V17__daily_hearing_limits.sql` | `users.daily_hearing_limit` (the usual most hearings per day) and `hearing_day_limits` (a limit for one particular date, replaces the usual one) |
| `V18__login_log_app.sql` | `login_log.app` (WEB or CALENDAR): which app each sign-in came from, shown under Login Activity; older rows count as WEB |
| `V19__court_floors.sql` | `courts.floor` (between building and court no., part of the unique key), plus `judges.floor` and `judge_court_no_records.floor`; existing rows get an empty floor |
| `V20__case_building_floor.sql` | `cases.building` and `cases.floor`: the court room a case is listed in, filled in for existing cases where the court table names exactly one room |
| `V21__misc_applications.sql` | `misc_applications` (applications filed in a case: type, filing and hearing date, Pending / Disposed Off) and `documents.misc_application_id` / `misc_role` (application, order or additional document) |
| `V22__misc_application_options.sql` | Dropdown Options list `MISC_APPLICATION_TYPE` for the Misc. Application page: Bail Application, and Other (Type Manually) which the app needs and is locked |
| `V23__misc_application_disposal_outcome.sql` | `misc_applications.disposal_outcome`: Allowed or Disallowed once an application is disposed off |
| `V24__misc_application_hearings.sql` | `misc_application_hearings`: every date an application was listed for (its own hearing history); an existing next hearing date becomes its first entry |
| `V25__misc_application_hearing_note.sql` | `misc_application_hearings.note`: what happened at that hearing |
| `V26__drop_misc_application_history.sql` | Drops the unused `misc_applications.history` column from V21 |
| `V27__remove_generic_misc_document_type.sql` | Removes the generic document type "Misc. Application (Type Manually)"; misc. applications and their files are added on the Misc. Application page |
| `V28__refresh_court_judge_listings.sql` | Courts and judge listings refreshed from the Delhi District Courts rosters (8 districts) |
| `V29__add_east_rouse_central_rosters.sql.sql` | An exact copy of V28 (the doubled `.sql.sql` is in the file name). **Do not rename, edit or delete it**: it is already applied, and Flyway refuses to start when an applied migration changes |
| `V30__reload_all_district_rosters.sql` | Judge listings of all 11 district rosters reloaded; listings no longer on a roster are archived (`active = FALSE`), never deleted, because cases and histories point at them. Supersedes V28 and V29 |
| `V31__app_notes.sql` | `app_notes`: private notes of the Calendar app, one row per note per account; a deleted note stays as a row with `deleted_at` set so the deletion reaches the other phones |
| `V32__app_preferences.sql` | `app_preferences`: court colours, court filter and view settings of the Calendar app, one row per account (a small JSON object plus the time of the last change) |
| `V33__case_opponents_and_non_clients.sql` | `case_opposing_parties` (a case can have several opposite parties) and `case_non_clients` (people on our side who are not saved as clients, with their role). The single opposite party of each existing case is copied into the first table, then `cases.opposing_party`, `opposing_father_name`, `opposing_address` and `opposing_phone` are dropped |
| `V36__juvenile_justice_board.sql` | `courts.juvenile_justice_board`: the mark for a Juvenile Justice Board. Its cases have no CNR and nothing is fetched from eCourts for them (cause list number, next-hearing sync, orders) |
| `V37__juvenile_justice_board_whole_court.sql` | The mark belongs to a whole court (Admin > Courts, every row of the court), not a court no.; marks set on single court numbers are cleared |
| `V38__case_no_optional.sql` | `cases.case_no` may be empty: a Juvenile Justice Board case needs neither a CNR nor a case number (every other case still needs one) |

This folder keeps only the two scripts that run outside the app: `create_database.sql` and `check_links.sql`.
Fee calculator rules still need no file: the backend saves them itself on the first start (see below).

## Fresh install (new, empty database)

Use MySQL 8.0.19 or newer (`V6__plans.sql` uses a row alias in its upsert; MySQL 5.7 and MariaDB do not support it).

1. In MySQL run `create_database.sql`. It creates an empty `internyay` database as `utf8mb4_unicode_ci` and never deletes anything.
2. Start the backend. Flyway runs V1 to V38, Hibernate validates, and the app is up. That is the whole setup.
3. Sign out in the browser, register your account, then make it the first administrator (see `docs/ADMIN_SETUP.md`).

Expected: the log shows `Successfully applied 38 migrations`. The row counts below are what V1 to V11 create; the roster migrations V28 to V30 change the courts and judge listings afterwards, so those counts will differ on a full install:

| Table | Rows |
| --- | --- |
| `courts` | 14 |
| `police_districts` | 15 |
| `police_sub_divisions` | 67 |
| `police_stations` | 179 |
| `drt_tribunals` | 4 |
| `drt_stations` | 87 |
| `consumer_commissions` | 12 |
| `consumer_stations` | 101 |
| `plans` | 4 |
| `option_items` | 211 |

`fee_calculator_config` has 1 row after the first start (`SELECT JSON_LENGTH(config, '$.filings') FROM fee_calculator_config;` gives 46).
Use Admin -> Fee Calculator -> Reset to return to the defaults later.

## Changing the schema later

The rule: **never edit a migration file that has been applied anywhere. Add a new one.**
Flyway stores a checksum of every applied file and the backend refuses to start if one changed.

1. Change the entity (add the field).
2. Add `src/main/resources/db/migration/V33__what_it_does.sql` (the number after the highest one in that folder, two underscores, a short name), for example:
   ```sql
   ALTER TABLE cases ADD COLUMN court_hall VARCHAR(100);
   ```
3. Make the SQL match the entity: same column name (`courtHall` -> `court_hall`), a compatible type, `NOT NULL` when the field
   is `nullable = false` or a primitive. Hibernate is only validating, so a mismatch stops the start with an error such as
   `Schema-validation: missing column [court_hall] in table [cases]` or `wrong column type encountered in column [...]`.
4. Start the backend. Flyway applies V33, Hibernate validates.

Good habits: one change per file, test it on a copy of the production data first, and take a backup before deploying. Flyway Community has
no undo, to go back you restore the backup and deploy the old version of the app. A failed migration stops the start; MySQL cannot roll
back DDL, so a half-applied file has to be repaired by hand, which is another reason to keep files small.

When more than one backend instance starts at once, Flyway takes a database lock so only one of them migrates and the others wait.

## If the backend does not start

- `Schema-validation: ...` Hibernate found a table or column that does not match an entity. Almost always a new field without its migration file (step 2 above).
- `Validate failed: Migration checksum mismatch for migration version N` an applied file was edited. Put it back as it was and add a new V file instead.
- `Detected failed migration to version N` the file stopped half way. Repair by hand (undo what it already did), then
  `DELETE FROM flyway_schema_history WHERE success = 0;` and start again.
- `Found non-empty schema(s) ... but no schema history table` the database already has tables that Flyway did not create. Start from an empty database (see "Development: start from nothing").

## Development: start from nothing

1. Stop the backend. In MySQL: `DROP DATABASE IF EXISTS internyay;` (or remove the two dashes in `create_database.sql`, see the file).
2. Empty the `data/uploads` folder (or the S3 bucket), because old files belong to the old database.
3. Run `create_database.sql`, start the backend, register your account (see `docs/ADMIN_SETUP.md`).

## Read-only check

`check_links.sql` reports on the links MySQL cannot enforce (matched by name, not by id) and counts the named foreign keys. It changes nothing.
Run it any time, for example after importing data or before a release. A number above 0 in part B is something to review, not always an error.

## Links that stay as plain text

MySQL cannot enforce these, so they are matched by name or by app code: `judges.court` / `judges.district` against `courts`, `cases.police_station`, `police_districts.court`, `bail_roster_records.judicial_officer_ids` (a comma list of judge ids), and `documents.case_id` / `client_id` / `user_id`, which the services remove (rows and files together) when a case, client or account is deleted.

## Note when recreating the MySQL database later

Document details, payment QR codes and the details of every PDF are rows in MySQL, so they disappear with the database. The uploaded files themselves (documents, notification, district, legal form and court calendar PDFs) live in file storage and are named by random keys, so they can never show up under a new account, but they would stay behind as unused files. Whenever you recreate the MySQL database, also empty the `data/uploads` folder (or the S3 bucket), and sign out in the browser, because an old login token carries the old user id.