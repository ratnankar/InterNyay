# InterNyay — Frontend

React + Vite frontend for InterNyay, a legal practice manager for Indian advocates
(cases, clients, hearings, documents, fees, WhatsApp reminders, quick-access court data).
It talks to the Spring Boot backend in `InterNyay_B`.

## Run

```bash
cp .env.example .env      # set VITE_API_BASE_URL (default http://localhost:8080/api) and, for a production build, VITE_SITE_URL (https://your-domain)
npm install
npm run dev               # development server
npm run build             # production build
npm test                  # unit tests (Vitest)
```

## Structure

```
src/
├── main.jsx                  entry point: mounts the router
├── router.jsx                route table: every URL in one place
├── entry-server.jsx          server render of the landing page, used by scripts/prerender.mjs at build time
├── App.jsx                   root route: AppProvider, toasts, confirm dialogs, tab title, scroll reset
├── routes/                   paths.js (URL helpers), guards.jsx (sign-in / role rules), AppLayout, PageGate
├── context/AppContext.jsx    global state and actions
├── services/api.js           every backend call
├── pages/                    Dashboard, Cases, Clients, Transactions, Documents, Legal Forms,
│                             To-do, Court Fee Calculator, Quick Access, Notifications, Profile, Admin
├── components/
│   ├── auth/                 sign-in / register
│   ├── layout/               sidebar
│   ├── modals/               add case/client, fees, invoices, uploads, next hearing …
│   ├── admin/                admin-console editors (judges, leave, rosters, police, PDFs)
│   └── common/               calendar, hearings list, image cropper, shared widgets
├── assets/                   background photo (photo-bg.webp for desktop, photo-bg-sm.webp for phones) used on the sign-in pages and landing hero
├── hooks/                    WhatsApp, notifications, PDF viewer, image crop, police directory …
├── constants/, utils/        catalogues (courts, case types, holidays) and helpers
└── styles/                   one stylesheet per area, imported from index.css
```

Administrators sign in at `/admin` (or `?admin=1`); the normal sign-in page has no admin option.

## Routing

Navigation uses React Router (`react-router-dom` 6). The URL decides what is on screen; `src/router.jsx` lists every route.

| URL | Who | Screen |
| --- | --- | --- |
| `/` | everyone | landing page (signed out) or redirect to the app (signed in) |
| `/login`, `/register`, `/forgot-password` | signed out | sign-in tabs |
| `/dashboard`, `/cases`, `/cases/:caseId`, `/clients`, `/clients/:clientId`, `/transactions`, `/expenses`, `/notifications`, `/documents`, `/forms`, `/todos`, `/calculator`, `/quick-access`, `/judges-on-leave`, `/contact`, `/profile`, `/my-plan` | signed in | app pages inside the sidebar layout (the old `/quickaccess`, `/judgeleave`, `/myplan` addresses redirect) |
| `/forms/fill/:formId?caseId=` | signed in | form-fill screen that opens in its own window |
| `/admin`, `/admin/:tab` (e.g. `/admin/judges`), `/admin/profile` | administrators | admin sign-in and console, one URL per tab |
| anything else | everyone | "Page not found" screen (404) |

- Signed-out visitors who open a protected URL are sent to `/login` and returned to that URL after signing in.
- Plan and role rules (upgrade notice, associates and Transactions, the Transactions PIN) live in `routes/PageGate.jsx`.
- In code, `setActiveNav('cases')` navigates to `/cases`, and `openCase(c)` opens a case at `/cases/:id`. The sidebar uses real links.
- Wrong links: inside the app, an address with no page shows the "Page not found" screen (`pages/NotFound.jsx`, built on `components/common/ErrorPage.jsx`) with a way home. The same screen is used for visitors who are signed out and for administrators. If a page crashes while drawing, `routes/RouteError.jsx` shows "Something went wrong" with a reload button.
- Hosting and real 404 status: the build writes `dist/_redirects` (generated in `vite.config.js` from the lists in `routes/paths.js`, so a new page is picked up by itself). Known addresses get `index.html` with status 200; every other address gets `public/404.html` with a real 404 status, so search engines do not index mistyped links (no more soft 404s). Netlify and Cloudflare Pages both read this file. Another host needs the same rule: known paths -> `index.html`, everything else -> `404.html` with status 404.
- Landing page for crawlers: `npm run build` runs `vite build` and then `scripts/prerender.mjs`, which writes the landing page's HTML into `dist/index.html` so search engines and link previews can read it without JavaScript. If that extra step fails it prints a warning and leaves the normal build untouched; `npm run build:plain` skips it. `public/session-flag.js` stops signed-in users from seeing that pre-rendered page flash before the dashboard opens.
- Account switching and session expiry still do a full page reload on purpose, so no state from the previous account survives.
- Tests: `routes/paths.test.js` covers the URL helpers and `routes/guards.test.jsx` covers the sign-in, role and plan redirects.


## PDFs on phones and tablets

Android Chrome and iPhone/iPad browsers cannot show a PDF inside an `<iframe>` (they show a grey "PDF - Open" box or only page one).
`src/components/common/PdfFrame.jsx` keeps the browser's own viewer on desktop and, on touch devices, draws the pages itself with
`pdfjs-dist` (`PdfCanvasViewer.jsx`, loaded only when a PDF is opened). It is used for the court calendar, notifications, district PDFs,
uploaded documents and the legal form fill window. After pulling this change run `npm install` once (new dependency `pdfjs-dist`).

## Styles

All CSS lives in `src/styles/`, one file per area, pulled in by `src/index.css`. Order matters: later imports win when two rules have the same specificity, so keep new overrides in the file that matches their area and do not repeat a selector and property that an earlier file already sets (edit the earlier rule instead). `bottom-nav.css` is imported by the sidebar component and `fonts.css` by `main.jsx`. Breakpoints used most: 860px (sidebar to top bar) and 640px (phones).

## Where sizes and text styles live

| What | File |
|---|---|
| Desktop buttons, fields, search, filter, sort (one place, change the numbers in `:root`) | `src/styles/desktop-sizes.css` |
| Sign in, Register, plan, court preference, Google sign-up window (desktop and phone) | `src/styles/auth-flow.css` |
| Text scale: tables, labels, subtitles (desktop and phone) | `src/styles/typography.css` |
| Phone and tablet field / button sizes in the app | `src/styles/unified.css` |
| Size tokens (`--fs-*`) and phone overrides | `src/styles/variables.css`, `src/styles/mobile.css` |

These files are imported last in `src/index.css`; keep them last so they win over older rules.
