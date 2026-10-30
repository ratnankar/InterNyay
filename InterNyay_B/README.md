# InterNyay API (backend)

Spring Boot backend for **InterNyay**, a practice manager for Indian advocates. It serves the REST API used by the
website (`InterNyay`) and owns the database, file storage, scheduled jobs, e-mail / WhatsApp sending and the AI assistant.

## Stack

- Java 25, Spring Boot 3.5 (Web, Data JPA, Security, Validation, Mail)
- MySQL 8.0.19 or newer, schema managed by Flyway (Hibernate only validates it)
- JWT sign-in (jjwt) and Google sign-in; per-IP rate limiting with Bucket4j
- File storage on local disk or S3 (AWS SDK v2)
- Maven (`pom.xml`); Testcontainers for the MySQL tests

## Quick start

1. Install Java 25, Maven and MySQL.
2. Create the empty database: run `sql/create_database.sql` in MySQL.
3. Copy the settings file and fill it in:
   ```bash
   cp .env.example .env     # at least DB_PASSWORD and JWT_SECRET
   ```
4. Start the API (it listens on `http://localhost:8080`):
   ```bash
   mvn spring-boot:run
   ```
   Flyway builds the tables and loads the reference data on the first start.
5. Register an account in the website, then make it the first administrator (`docs/ADMIN_SETUP.md`).

Settings are read from `.env` in the working directory, from `local-secrets.properties` if present, and from OS
environment variables. Never commit them.

## Configuration

Everything is set through `.env` (see `.env.example` for the full list). The main groups:

| Group | Variables | Guide |
| --- | --- | --- |
| Database | `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` | `sql/README.md` |
| Security | `JWT_SECRET`, `CORS_ALLOWED_ORIGINS`, `INTERNYAY_ADMIN_SETUP_KEY`, `RATE_LIMIT_ENABLED`, `FORWARD_HEADERS_STRATEGY` | `docs/ADMIN_SETUP.md`, `docs/TESTING.md` |
| E-mail codes (OTP) | `GMAIL_USERNAME`, `GMAIL_APP_PASSWORD`, `OTP_DRY_RUN` | `docs/OTP_SETUP.md` |
| Google sign-in | `GOOGLE_CLIENT_ID` | `docs/GOOGLE_SETUP.md` |
| File storage | `STORAGE_TYPE`, `STORAGE_LOCAL_DIR`, `S3_*` | `docs/STORAGE_SETUP.md` |
| WhatsApp reminders | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN`, `WHATSAPP_DRY_RUN` | `docs/WHATSAPP_SETUP.md` |
| AI assistant | `CHAT_BASE_URL`, `CHAT_MODEL`, `CHAT_API_KEY` | `docs/CHAT_SETUP.md` |
| Automatic CAPTCHA reading | `CAPTCHA_SOLVER_ENABLED`, `CAPTCHA_SOLVER_URL`, `CAPTCHA_SOLVER_KEY` | `docs/CAPTCHA_SETUP.md` |
| Logging | `LOG_LEVEL` | |

`*_DRY_RUN=true` logs what would be sent instead of sending it, which is useful in development.

## Code layout

```
src/main/java/com/internyay/
├── InterNyayApplication.java   entry point
├── controller/                 REST endpoints, one controller per area (cases, clients, hearings, admin, ...)
├── service/                    business rules; service/chat holds the AI assistant and its read-only tools
├── repository/                 Spring Data JPA repositories
├── entity/                     JPA entities (they must match the Flyway migrations)
├── dto/                        request and response objects
├── security/                   JWT filter and utilities, login-attempt lock
├── config/                     security, CORS, rate limiting, duplicate-submit guard, plan-feature interceptor
├── scheduler/                  timed jobs (see below)
├── scraper/                    eCourts portal, cause list (High Court, Supreme Court, district) and leave-page readers, CAPTCHA solver client
├── storage/                    FileStorage with local and S3 implementations, cleanup of orphaned files
├── exception/                  error types and the global error handler
└── util/                       small helpers (case catalogue, court matching, password policy, ...)
src/main/resources/
├── application.properties      settings, with defaults and environment-variable names
├── fee-calculator-defaults.json
└── db/migration/               Flyway migrations V1 ... V60
captcha-service/                small Python service that reads the eCourts CAPTCHA (see docs/CAPTCHA_SETUP.md)
sql/                            create_database.sql plus optional check / fix scripts run by hand, and the migration guide
docs/                           setup guides
```

## Scheduled jobs

All times are India time (`Asia/Kolkata`). The values in `application.properties` are only the starting values: the run
time, the days of the week, the on/off switch and (for the two jobs that look up hearing dates) the hearing date
(today, tomorrow, day after tomorrow, today and tomorrow, next 3 days, next 7 days) are changed in **Admin > Schedulers**
and apply straight away, without a restart. Each job also has a Run now button there. Runs must be at least 5 minutes apart.

| Job | Default | Purpose |
| --- | --- | --- |
| `JudgeLeaveScheduler` | every hour | Reads the district court leave pages (`judgeleave.scrape.cron`) |
| `CauseListScheduler` | every hour 17:00-23:00, for tomorrow | Looks up cause list numbers for the chosen hearing date: Delhi High Court / Supreme Court PDFs and district courts (CAPTCHA read by the solver). Only cases still without a number are tried, so each run completes the last one. Runs are listed in Admin > Cause List (`causelist.auto.*`) |
| `NextHearingUpdateScheduler` | every hour 17:00-23:00, for today | Asks eCourts for the new next hearing date of cases still on the chosen date (`nexthearing.update.*`) |
| `WhatsAppReminderScheduler` | 10:00 daily | Sends hearing and payment reminders; each case uses its own "days before" (`whatsapp.reminder.cron`) |

## Database

Flyway applies `src/main/resources/db/migration/` on every start and Hibernate runs with `ddl-auto=validate`.
**Never edit a migration that has already been applied; add a new `V<next>__name.sql`.** `sql/README.md` lists every
migration and explains fresh installs and schema changes.

## Tests

```bash
mvn test        # unit tests, plus the MySQL tests when Docker is running
```

`docs/TESTING.md` lists what each test covers and describes the rate limits.

## Production notes

- Use a long random `JWT_SECRET` and set `CORS_ALLOWED_ORIGINS` to the real https site address.
- Behind nginx or a load balancer set `FORWARD_HEADERS_STRATEGY=native` so rate limits see each user's own IP.
- Use `STORAGE_TYPE=s3` if the server's disk is not permanent.
- Keep `LOG_LEVEL=INFO`, and keep `*_DRY_RUN` off.
- Take database backups before deploying a release that adds migrations.
