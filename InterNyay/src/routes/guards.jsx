// Route guards: decide who may see which part of the app. Each one either renders its child routes (<Outlet />) or redirects.
import { Navigate, Outlet, useLocation, useMatches } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import NotFound from '../pages/NotFound'
import { AuthPage, AppLayout, ChoosePlan, ChooseCourts } from './lazy'
import { ADMIN_PATH, HOME_PATH, destinationAfterLogin } from './paths'

// Role saved with the last session; known immediately after a reload, before the profile has been fetched again
function cachedRole() {
  try { return String(JSON.parse(localStorage.getItem('internyay_user') || '{}').role || '').toUpperCase() } catch { return '' }
}

// Role of the signed-in user ('' when signed out)
export function useSessionRole() {
  const { loggedIn, currentUser } = useApp()
  if (!loggedIn) return ''
  return String(currentUser?.role || cachedRole()).toUpperCase()
}

// Sign-in, register and forgot-password: for visitors only. Someone already signed in is sent on to the app
export function PublicOnly() {
  const { loggedIn } = useApp()
  const location = useLocation()
  const role = useSessionRole()
  if (!loggedIn) return <Outlet />
  return <Navigate to={destinationAfterLogin(location.state?.from, role)} replace />
}

// The whole signed-in app. Signed-out visitors go to the sign-in page and come back to the page they asked for afterwards
export function RequireAuth() {
  const { loggedIn, justSignedOut, planPromptOpen, courtPromptOpen } = useApp()
  const location = useLocation()
  const role = useSessionRole()

  // The "*" route inside the app means the address is not a page at all
  const matches = useMatches()
  const unknownAddress = matches[matches.length - 1]?.params?.['*'] !== undefined

  if (!loggedIn) {
    // After pressing Sign Out the visitor lands on the home page instead of the sign-in form
    if (justSignedOut) return <Navigate to="/" replace />
    // A mistyped or outdated address is "not found", not a reason to ask someone to sign in
    if (unknownAddress) return <NotFound />
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  // A wrong address typed by an administrator gets the same "not found" page, with a way back to the console
  if (role === 'ADMIN' && unknownAddress) return <NotFound isAdmin />
  // Administrators only use the admin console
  if (role === 'ADMIN') return <Navigate to={ADMIN_PATH} replace />
  // New advocates must choose a plan before they can use the app (associates skip this)
  if (planPromptOpen && role !== 'ASSOCIATE') return <ChoosePlan />
  // Then every new account says which courts it works at (it can be skipped and changed later on the Profile page)
  if (courtPromptOpen) return <ChooseCourts />
  return <Outlet />
}

// The admin area (/admin and below): the admin sign-in when signed out, the console when signed in as an admin
export function AdminArea() {
  const { loggedIn, justSignedOut } = useApp()
  const role = useSessionRole()
  // After pressing Sign Out the admin lands on the home page too, instead of keeping the old /admin/... address
  if (!loggedIn && justSignedOut) return <Navigate to="/" replace />
  if (!loggedIn) return <AuthPage />
  // A signed-in non-admin account has no business here (an unknown role is let through until the profile has loaded)
  if (role && role !== 'ADMIN') return <Navigate to={HOME_PATH} replace />
  return <AppLayout />
}
