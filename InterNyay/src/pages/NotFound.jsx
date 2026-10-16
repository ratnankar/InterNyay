import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import ErrorPage from '../components/common/ErrorPage'
import { ADMIN_PATH, HOME_PATH } from '../routes/paths'

// Shown for any address the app does not have a page for: a mistyped or outdated link.
//   embedded  true inside the signed-in layout (the sidebar stays), false as a full page for visitors and administrators
//   isAdmin   the signed-in account is an administrator (home is the admin console)
export default function NotFound({ embedded = false, isAdmin = false }) {
  const { loggedIn } = useApp()
  const { pathname, search } = useLocation()
  const navigate = useNavigate()

  // Where "home" is for this visitor, and what to call it
  const home = loggedIn && isAdmin ? { to: ADMIN_PATH, label: 'Go to admin console' }
    : loggedIn ? { to: HOME_PATH, label: 'Go to dashboard' }
    : { to: '/', label: 'Go to home page' }
  // Back only makes sense when this tab has somewhere to go back to
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1

  return (
    <ErrorPage
      embedded={embedded}
      icon="search"
      code="404"
      title="Page not found"
      message="The link you followed is broken or the page has moved. Check the address for typing mistakes, or use one of the options below."
      address={`${pathname}${search}`}
    >
      <Link to={home.to} className="btn-gold">{home.label}</Link>
      {canGoBack && <button type="button" className="btn-outline" onClick={() => navigate(-1)}>Go back</button>}
      {!loggedIn && <Link to="/login" className="btn-outline">Sign in</Link>}
    </ErrorPage>
  )
}
