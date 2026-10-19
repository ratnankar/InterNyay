// The route table: every URL the app answers to, in one place.
//
//   /                         landing page (signed out) -> dashboard (signed in)
//   /login /register /forgot-password   sign-in screens (signed out only)
//   /dashboard /cases /cases/:caseId /clients /clients/:clientId /transactions /expenses /notifications
//   /documents /misc-applications /forms /todos /calculator /quick-access /judges-on-leave /contact /profile /my-plan   (signed in)
//                             (the old /quickaccess /judgeleave /myplan addresses redirect to the new ones)
//   /forms/fill/:formId       form-fill screen that opens in its own window (no sidebar)
//   /admin  /admin/:tab  /admin/profile    admin sign-in and console, one URL per tab (administrators only)
//   anything else             "page not found" (also for visitors who are signed out)
import { createBrowserRouter, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import App from './App'
import PageGate from './routes/PageGate'
import RouteError from './routes/RouteError'
import { AdminArea, PublicOnly, RequireAuth, useSessionRole } from './routes/guards'
import { fillFormPath, destinationAfterLogin, NAV_SLUGS } from './routes/paths'
import { useApp } from './context/AppContext'

import LandingPage        from './pages/LandingPage'
import {
  AuthPage, AppLayout, Dashboard, Cases, Clients, TransactionHistory, Expenses, NotificationsPage, Documents, MiscApplications,
  LegalForms, TodoList, CourtFeeCalculator, QuickAccess, JudgesOnLeave, ContactUs, Profile, MyPlan, Admin, FillFormPage,
} from './routes/lazy'
import { MISC_APP_NAME } from './constants/data'
import NotFound           from './pages/NotFound'

// "/": the landing page for visitors, the app for signed-in users. Old form-fill links (/?fillForm=3) are forwarded
function RootIndex() {
  const { loggedIn } = useApp()
  const role = useSessionRole()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const legacyForm = params.get('fillForm')
  if (legacyForm) return <Navigate to={fillFormPath(legacyForm, params.get('caseId'))} replace />
  if (loggedIn) return <Navigate to={destinationAfterLogin(null, role)} replace />
  return <LandingPage onSignIn={() => navigate('/login')} onRegister={() => navigate('/register')} />
}

// Sign-in / register / forgot-password: the tab comes from the URL (see AppContext)
function AuthRoute() {
  const navigate = useNavigate()
  return <AuthPage onBack={() => navigate('/')} />
}

// Form-fill screen: form id from the path, optional case from ?caseId=
function FillRoute() {
  const { formId } = useParams()
  const [params] = useSearchParams()
  return <FillFormPage formId={formId} caseId={params.get('caseId') || ''} />
}

// Old run-together address (/quickaccess) -> new address (/quick-access), keeping any ?query and #hash
function LegacyRedirect({ to }) {
  const { search, hash } = useLocation()
  return <Navigate to={`${to}${search}${hash}`} replace />
}

// A page inside the app layout, behind its plan/role gate
const page = (id, Component) => <PageGate id={id}><Component /></PageGate>

const routes = [
  {
    element: <App />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <RootIndex /> },
      { path: 'home', element: <Navigate to="/" replace /> },
      // Renamed pages: the old address keeps working (bookmarks, emails), and the guards still apply to the new one
      ...Object.entries(NAV_SLUGS).map(([oldPath, slug]) => ({ path: oldPath, element: <LegacyRedirect to={`/${slug}`} /> })),

      // Visitors only
      {
        element: <PublicOnly />,
        children: [
          { path: 'login',           element: <AuthRoute />, handle: { title: 'Sign in' } },
          { path: 'register',        element: <AuthRoute />, handle: { title: 'Create account' } },
          { path: 'forgot-password', element: <AuthRoute />, handle: { title: 'Reset password' } },
        ],
      },

      // Administrators: sign-in when signed out, console when signed in
      {
        path: 'admin',
        element: <AdminArea />,
        children: [
          // One route for every tab (/admin, /admin/judges ...) so the console stays mounted when the tab changes
          { path: ':tab?',   element: <Admin />,   handle: { title: 'Admin Console' } },
          { path: 'profile', element: <Profile />, handle: { title: 'Profile' } },
          { path: '*',       element: <Navigate to="/admin" replace /> },
        ],
      },

      // Signed-in advocates and associates
      {
        element: <RequireAuth />,
        children: [
          // Opens in its own window, so it has no sidebar
          { path: 'forms/fill/:formId', element: <FillRoute />, handle: { keepTitle: true } },
          {
            element: <AppLayout />,
            children: [
              { path: 'dashboard',     element: page('dashboard', Dashboard),            handle: { title: 'Dashboard' } },
              // Optional :caseId / :clientId keep one route (and one mounted page) when a case or client is opened
              { path: 'cases/:caseId?',     element: page('cases', Cases),               handle: { title: 'Cases' } },
              { path: 'clients/:clientId?',  element: page('clients', Clients),          handle: { title: 'Clients' } },
              { path: 'transactions',  element: page('transactions', TransactionHistory), handle: { title: 'Transactions' } },
              { path: 'expenses',      element: page('expenses', Expenses),              handle: { title: 'Expenses' } },
              { path: 'notifications', element: page('notifications', NotificationsPage), handle: { title: 'Notifications' } },
              { path: 'documents',     element: page('documents', Documents),            handle: { title: 'Documents' } },
              { path: 'misc-applications', element: page('miscapps', MiscApplications), handle: { title: MISC_APP_NAME.full } },
              { path: 'forms',         element: page('forms', LegalForms),               handle: { title: 'Legal Forms' } },
              { path: 'todos',         element: page('todos', TodoList),                 handle: { title: 'To-Do List' } },
              { path: 'calculator',    element: page('calculator', CourtFeeCalculator),  handle: { title: 'Fee Calculator' } },
              { path: 'quick-access',  element: page('quickaccess', QuickAccess),        handle: { title: 'Quick Access' } },
              { path: 'judges-on-leave', element: page('judgeleave', JudgesOnLeave),       handle: { title: 'Judges on Leave' } },
              { path: 'contact',       element: page('contact', ContactUs),              handle: { title: 'Contact Us' } },
              { path: 'profile',       element: page('profile', Profile),                handle: { title: 'Profile' } },
              { path: 'my-plan',       element: page('myplan', MyPlan),                  handle: { title: 'My Plan' } },
              { path: '*',             element: <NotFound embedded />,                            handle: { title: 'Page not found' } },
            ],
          },
        ],
      },
    ],
  },
]

// Served from the Vite base path (normally "/")
const basename = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '') || '/'

const router = createBrowserRouter(routes, {
  basename,
  future: {
    v7_relativeSplatPath: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true,
  },
})

export default router
