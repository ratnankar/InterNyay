# Tests and rate limiting

## Running the tests

    mvn test            # unit tests, plus the MySQL tests when Docker is running
    mvn -Dtest='JwtUtilsTest,RateLimitFilterTest,PlanFeatureInterceptorTest,FeeCalculatorServiceTest' test   # no Docker needed

| Test | What it covers | Needs Docker |
| --- | --- | --- |
| `security/JwtUtilsTest` | token issue, subject, expiry, wrong secret, tampered / unsigned / garbage tokens | no |
| `config/RateLimitFilterTest` | per-IP limits, shared buckets, 429 + `Retry-After`, switch off | no |
| `config/PlanFeatureInterceptorTest` | URL -> plan feature mapping, admin / associate / anonymous rules | no |
| `service/FeeCalculatorServiceTest` | defaults, seeding, save validation | no |
| `integration/FeeCalculatorMySqlTest` | LONGTEXT JSON round trip and seeding on real MySQL | yes (skipped without Docker) |
| `integration/AuthAndPlanIntegrationTest` | login, JWT on protected URLs, plan 403 / 200, 429 on login, on real MySQL | yes (skipped without Docker) |
| `integration/FlywayMigrationMySqlTest` | the Flyway migrations on an empty MySQL with `ddl-auto=validate` (so they match the entities), reference data counts and the foreign keys | yes (skipped without Docker) |

The database tests start a throw-away `mysql:8.4` container with Testcontainers; they never touch your `.env` database.

Without Docker, the same check happens on a real start: point the backend at an empty database (`create_database.sql`) and start it. Flyway builds the schema and Hibernate validates it, so a clean start proves the migrations match the entities.
`FlywayMigrationMySqlTest` is the one to run after you add a migration file or change an entity: `mvn -Dtest=FlywayMigrationMySqlTest test`.

## Rate limiting

Per client IP, Bucket4j token buckets (settings in `application.properties`, `internyay.rate-limit.*`):

| Endpoints | Default |
| --- | --- |
| `POST /api/auth/login` | 10 per 15 min |
| `POST /api/auth/google/login`, `/google/register` | 20 per 15 min |
| `POST /api/auth/register/send-otp`, `/forgot-password/send-otp`, `/me/email/send-otp` | 5 per 15 min |
| `POST /api/auth/register/verify-otp`, `/forgot-password/reset`, `/me/email/confirm` | 10 per 15 min |

A blocked request gets HTTP 429, a `Retry-After` header and `{"message": "..."}`. The existing per-email wrong-password lock and OTP cooldown / attempt limits still apply on top.

Behind a reverse proxy or load balancer set `FORWARD_HEADERS_STRATEGY=native` (it feeds `server.forward-headers-strategy`), otherwise every user shares the proxy's IP. The buckets live in memory, so with more than one backend instance each instance counts separately (use a shared store such as Redis if that matters). `RATE_LIMIT_ENABLED=false` switches it off.
