# Registration email verification (OTP) — setup

Before an account can be created, InterNyay emails the address a 6-digit code
and the sign-up form has to verify it. This goes through a regular Gmail
account over SMTP — no third-party email service required.

## 1. Get a Gmail app password

Gmail will not accept your normal login password over SMTP from an app like
this one. Instead:

1. Turn on **2-Step Verification** on the Google account you want to send from
   (Google Account → Security), if it isn't already on.
2. Go to <https://myaccount.google.com/apppasswords>.
3. Create an app password (any name, e.g. "InterNyay") and copy the 16-character
   password it gives you.

## 2. Configure the backend

Set these as environment variables (or in `local-secrets.properties`, which is
git-ignored) — **never** commit real values to `.env` or `application.properties`:

| Variable | Value |
|---|---|
| `GMAIL_USERNAME` | The full Gmail address, e.g. `yourpractice@gmail.com` |
| `GMAIL_APP_PASSWORD` | The 16-character app password from step 1 |

## 3. Trying it before Gmail is set up

Set `OTP_DRY_RUN=true` and the backend logs each code (`OTP email DRY RUN → ...`)
instead of emailing it, so you can copy it from the console and finish
registering while testing locally. Flip it back to `false` (or unset it) once
`GMAIL_USERNAME` / `GMAIL_APP_PASSWORD` are filled in for real.

## Other knobs (`application.properties`)

| Property | Default | What it does |
|---|---|---|
| `internyay.otp.expiry-minutes` | 10 | How long a freshly sent code is valid |
| `internyay.otp.verified-window-minutes` | 30 | How long after verifying the person has to finish the form |
| `internyay.otp.resend-cooldown-seconds` | 45 | Minimum gap between two "send code" requests |
| `internyay.otp.max-attempts` | 5 | Wrong codes allowed before a new one must be requested |
