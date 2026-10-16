# Administrator access

Registration never creates an administrator. `/api/auth/register` always creates an **ADVOCATE** (or ASSOCIATE).

## 1. First admin (one time)

1. Register the account normally (it becomes an advocate).
2. Set a long random secret in the environment, never in code or git:

   ```
   INTERNYAY_ADMIN_SETUP_KEY=<32+ random characters>      # e.g. openssl rand -base64 48
   ```
3. Call the setup endpoint:

   ```
   curl -X POST http://localhost:8080/api/admin/setup \
        -H "X-Admin-Setup-Key: $INTERNYAY_ADMIN_SETUP_KEY" \
        -H "Content-Type: application/json" \
        -d '{"email":"you@example.com"}'
   ```

Behaviour: no/short key configured → 404 (endpoint off) · wrong key → 403 · 5 wrong keys → 429 for 15 min ·
an admin already exists → 409 · success → 200. Remove the key from the environment afterwards.

## 2. More admins

Sign in as admin, then Admin → Accounts → **Edit** on an advocate and press **Make admin** (you must enter your own password)
(`POST /api/admin/users/{id}/promote` with body `{"password": "<your password>"}`, ADMIN role required).

Promotion sets role ADMIN, active, and clears the advocate code. Associates cannot be promoted.
