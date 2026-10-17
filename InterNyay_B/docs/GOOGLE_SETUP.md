# Sign in / register with Google

InterNyay can create accounts and sign people in with their Google account. It uses Google's
"Sign in with Google" button in the browser, which returns a signed **ID token**; the backend
verifies that token with Google's keys before trusting anything in it.

Nothing here is a secret — the client ID is public (it is visible in the browser too).

## 1. Create the client ID (once)

1. Open <https://console.cloud.google.com/> and pick (or create) a project.
2. **APIs & Services → OAuth consent screen** — choose *External*, fill in the app name and
   support email. The default scopes (`openid`, `email`, `profile`) are all InterNyay uses.
   While the publishing status is *Testing*, only the test users you list can sign in — set it
   to *In production* when you are ready for everyone.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorized JavaScript origins** — add every address the frontend is served from, exactly
     (scheme + host + port, no trailing slash, no path):
     - `http://localhost:5173` **and** `http://localhost` (Google asks for both when testing locally)
     - your production origin, e.g. `https://app.yourdomain.com`
   - No redirect URI is needed.
4. Copy the **Client ID** (ends in `.apps.googleusercontent.com`).

## 2. Configure both projects with the same value

| Project            | File    | Setting                |
| ------------------ | ------- | ---------------------- |
| backend `InterNyay_B` | `.env`  | `GOOGLE_CLIENT_ID=...` |
| frontend `InterNyay`  | `.env`  | `VITE_GOOGLE_CLIENT_ID=...` |

Restart both (Vite only reads `.env` at start-up). With the value blank, the Google buttons are
simply hidden and the backend refuses Google requests.

The backend rejects any token that was not issued for its own client ID, so the two values must match.

## How it behaves

- **Sign In tab → Google**: signs in an *existing* account whose email matches. It never creates
  one — if there is none it says so and points to Register.
- **Register tab → Google**: creates the account straight away, with the name and email from Google.
  No emailed code is needed (Google already verified the address). The Advocate / Associate
  toggle, advocate code (associates), phone, bar council no. and specialization on the form are
  used. An associate must enter the advocate code *before* clicking Google.
- **Existing password account + Google**: the first Google sign-in with the same email links the
  two (Google's account id is remembered; a different Google account with that email is refused
  afterwards). The password keeps working.
- **Accounts created with Google have no password.** Screens that confirm a password
  (Transactions, change email, change password, deactivate/delete) ask them to set one first via
  *Profile → Reset your password by email* (emailed code). Google sign-in keeps working after that.
- **Administrators are password-only.** `/admin` has no Google button, Google sign-in skips
  ADMIN accounts.

## API

| Endpoint                        | Body                                                                                 | Answers |
| ------------------------------- | ------------------------------------------------------------------------------------ | ------- |
| `POST /api/auth/google/login`    | `{ idToken, accountType? }`                                                          | same as `/auth/login` |
| `POST /api/auth/google/register` | `{ idToken, accountType?, advocateCode?, phone?, barNo?, specialization? }`          | same as `/auth/login` |

The `users` table has two columns for this, created by the Flyway migrations: `google_id` and `password_set`.

## Troubleshooting

- **No Google button on the page** — `VITE_GOOGLE_CLIENT_ID` is empty, or Vite was not restarted.
- **Button shows but the popup says the origin is not allowed** — add the exact page origin under
  *Authorized JavaScript origins* (changes can take a few minutes to apply).
- **"Your Google sign-in could not be verified"** — the backend's `GOOGLE_CLIENT_ID` differs from the frontend's, or the token expired.
- **"Google sign-in is not configured on this server"** — `GOOGLE_CLIENT_ID` is not set for the backend.
- **"Could not verify your Google sign-in right now"** — the server could not reach Google to fetch its public keys (firewall / no outbound internet).
