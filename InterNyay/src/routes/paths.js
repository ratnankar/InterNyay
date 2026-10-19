// Single source of truth for URLs: page names, path helpers and the parsing used by the router, the sidebar and the app state.

// Pages for advocates and associates. The name is also the first URL segment (e.g. 'cases' -> /cases)
export const NAV_IDS = [
  'dashboard', 'cases', 'clients', 'transactions', 'expenses', 'notifications',
  'documents', 'miscapps', 'forms', 'todos', 'calculator', 'quickaccess', 'judgeleave', 'contact', 'profile', 'myplan',
]

// Pages whose URL differs from their page name: readable kebab-case, like /forgot-password.
// The old run-together URLs (/quickaccess ...) still work and redirect to the new ones (see router.jsx)
export const NAV_SLUGS = { quickaccess: 'quick-access', judgeleave: 'judges-on-leave', myplan: 'my-plan', miscapps: 'misc-applications' }
const SLUG_TO_NAV = Object.fromEntries(Object.entries(NAV_SLUGS).map(([id, slug]) => [slug, id]))

export const HOME_PATH = '/dashboard'
export const ADMIN_PATH = '/admin'

// Sign-in screens: each tab of the auth page has its own URL
export const AUTH_PATHS = { login: '/login', register: '/register', forgot: '/forgot-password' }

// Normalised path: lowercase, no trailing slash
const clean = pathname => String(pathname || '/').replace(/\/+$/, '').toLowerCase() || '/'

// True for /admin and everything below it
export const isAdminPath = pathname => /^\/admin(\/|$)/.test(clean(pathname))

// True for the landing and sign-in screens (never a place to send a signed-in user back to)
export function isPublicPath(pathname) {
  const p = clean(pathname)
  return p === '/' || p === '/home' || Object.values(AUTH_PATHS).includes(p)
}

// Which auth tab a URL stands for
export function authTabFromPath(pathname) {
  const p = clean(pathname)
  if (p === AUTH_PATHS.register) return 'register'
  if (p === AUTH_PATHS.forgot) return 'forgot'
  return 'login'
}

// Page name and optional case/client id for a URL, e.g. /cases/12 -> { nav: 'cases', detail: '12' }.
// Unknown URLs give nav '' so that no sidebar item is highlighted on the "not found" page
export function parseNavPath(pathname) {
  const [seg = '', second = ''] = clean(pathname).replace(/^\/+/, '').split('/')
  if (seg === 'admin') return { nav: second === 'profile' ? 'profile' : 'admin', detail: null }
  // A renamed page is only known by its new slug; its old URL is redirected before it gets here
  const nav = SLUG_TO_NAV[seg] || (NAV_IDS.includes(seg) && !NAV_SLUGS[seg] ? seg : '')
  let detail = null
  const rawId = String(pathname || '').replace(/^\/+|\/+$/g, '').split('/')[1]
  if (rawId && (nav === 'cases' || nav === 'clients')) {
    try { detail = decodeURIComponent(rawId) } catch { detail = rawId }
  }
  return { nav, detail }
}

// URL for a page name. Inside the admin area the profile lives at /admin/profile
export function navToPath(id, onAdmin = false) {
  if (id === 'admin') return ADMIN_PATH
  if (id === 'profile' && onAdmin) return `${ADMIN_PATH}/profile`
  return NAV_IDS.includes(id) ? `/${NAV_SLUGS[id] || id}` : HOME_PATH
}

// URL of one tab of the admin console: /admin/judges. The first tab (overview) is plain /admin
export function adminTabPath(tabId) {
  return !tabId || tabId === 'overview' ? ADMIN_PATH : `${ADMIN_PATH}/${encodeURIComponent(tabId)}`
}

// URL of the standalone form-fill screen
export function fillFormPath(formId, caseId) {
  const qs = caseId ? `?caseId=${encodeURIComponent(caseId)}` : ''
  return `/forms/fill/${encodeURIComponent(formId)}${qs}`
}

// Where to send someone who has just signed in: back to the page they asked for, otherwise their home page
export function destinationAfterLogin(from, role) {
  if (String(role || '').toUpperCase() === 'ADMIN') return ADMIN_PATH
  if (from?.pathname && !isPublicPath(from.pathname) && !isAdminPath(from.pathname)) {
    return `${from.pathname}${from.search || ''}${from.hash || ''}`
  }
  return HOME_PATH
}
