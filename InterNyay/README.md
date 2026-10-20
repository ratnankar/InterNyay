# InterNyay Web (frontend)

The website for **InterNyay**, a practice manager for Indian advocates: cases, clients, hearings, documents, fees and
expenses, legal forms, WhatsApp reminders, a court fee calculator and quick-access court data (judges on leave, police,
DRT and consumer jurisdiction). It is a React single-page app that talks to the Spring Boot API in `InterNyay_B`.

## Requirements

- Node.js 18 or newer and npm
- The backend (`InterNyay_B`) running, by default at `http://localhost:8080`

## Quick start

```bash
cp .env.example .env     # then edit the values below
npm install
npm run dev              # http://localhost:5173
```

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Backend API address, e.g. `http://localhost:8080/api`. Only the dev server falls back to this value; a production build without it stops with an error. |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client id for "Continue with Google". Leave empty if Google sign-in is not used. |
| `VITE_SITE_URL` | Public address of the site (`https://your-domain`), used for the prerendered landing page, canonical links and the sitemap. |

The backend must list the site's address in its `CORS_ALLOWED_ORIGINS`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build into `dist/`, then prerenders the landing page (`scripts/prerender.mjs`) |
| `npm run build:plain` | Production build without the prerender step |
| `npm run preview` | Serves the built `dist/` locally |
| `npm test` | Unit tests once (Vitest) |
| `npm run test:watch` | Unit tests in watch mode |

## Project layout

```
src/
├── main.jsx               entry point, mounts the router
├── router.jsx             every route in one place
├── entry-server.jsx       server render of the landing page, used by the prerender script
├── App.jsx                root route: app provider, toasts, confirm dialogs, tab title, scroll reset
├── routes/                URL helpers, sign-in and role guards, page gate (plan rules), layout, error screens
├── context/AppContext.jsx global state and actions shared by all pages
├── services/api.js        every call to the backend
├── pages/                 one file per screen (Dashboard, Cases, Clients, Transactions, Documents, ...)
├── components/            auth, layout (sidebar), modals, admin editors, chat, misc. applications, shared widgets
├── hooks/                 reusable hooks (notifications, WhatsApp, PDF viewer, chat, image crop, ...)
├── constants/             catalogues: courts, case types, plans, holidays, jurisdiction
├── utils/                 pure helpers (dates, names, fees, validators, PDF support, ...)
├── styles/                CSS grouped by role: base, layout, components, pages, admin, theme, responsive
└── assets/                background photos for the sign-in pages and landing hero
public/                    static files: icons, web manifest, 404 page, `_headers`
scripts/prerender.mjs      build-time prerender of the landing page
```

All CSS files are imported from `src/index.css`.

## Routing

Routing uses React Router 6. The URL decides what is on screen.

| URL | Who | Screen |
| --- | --- | --- |
| `/` | everyone | Landing page when signed out, redirect to the app when signed in |
| `/login`, `/register`, `/forgot-password` | signed out | Sign-in tabs |
| `/dashboard`, `/cases`, `/cases/:caseId`, `/clients`, `/clients/:clientId`, `/transactions`, `/expenses`, `/notifications`, `/documents`, `/misc-applications`, `/forms`, `/todos`, `/calculator`, `/quick-access`, `/judges-on-leave`, `/contact`, `/profile`, `/my-plan` | signed in | App pages inside the sidebar layout |
| `/forms/fill/:formId?caseId=` | signed in | Form-fill screen that opens in its own window |
| `/admin`, `/admin/:tab`, `/admin/profile` | administrators | Admin sign-in and console, one URL per tab |
| anything else | everyone | "Page not found" |

- A signed-out visitor who opens a protected URL is sent to `/login` and returned there after signing in.
- Plan and role rules (upgrade notice, associates and Transactions, the Transactions PIN) live in `routes/PageGate.jsx`.
- Old addresses (`/quickaccess`, `/judgeleave`, `/myplan`, `/?fillForm=`) redirect to the current ones.
- A page that crashes while drawing shows `routes/RouteError.jsx` with a reload button.
- Administrators sign in at `/admin`; the normal sign-in page has no admin option.

## Notes for developers

- **API access** goes through `services/api.js` only. It adds the sign-in token, turns failures into friendly messages
  (`utils/errorMessages.js`) and signs the user out when the token is rejected.
- **State** lives in `context/AppContext.jsx`. Pages read it with `useApp()`; they do not call the API directly for shared data.
- **Plans**: which features a user sees comes from the backend plan (`hooks/usePlanFeatures.js`); the server enforces the same rules.
- **Dropdown choices** (case types, client and document types, ...) are edited by administrators and loaded from the server
  (`constants/optionsStore.js`), so they are not hard-coded in the pages.
- **PDF viewing** uses `pdfjs-dist` (`utils/pdfjsLoader.js`, `components/common/PdfCanvasViewer.jsx`) because phone browsers do not embed PDFs.
- **Deployment**: the build is static (`dist/`). `vite.config.js` generates the host rule file (`_redirects`), `robots.txt` and `sitemap.xml`:
  known addresses are served the app, any other address gets `404.html` with a real 404 status. This suits Netlify and Cloudflare Pages;
  on another host, serve `index.html` for the app addresses listed in `src/routes/paths.js`.
- Password rules match the backend's (`utils/passwordPolicy.js` and `PasswordPolicy.java`); change both together.
