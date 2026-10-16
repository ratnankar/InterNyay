// Root route element: wraps every screen in AppProvider so all components can read the shared state,
// and mounts the things that must exist on every screen (toasts, confirm dialogs, tab title, scroll reset).
import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { loadOptions } from './constants/optionsStore'
import { AppProvider, useApp } from './context/AppContext'
import ToastContainer from './components/common/ToastContainer'
import ConfirmHost from './components/common/ConfirmHost'
import { HomeClass, RouteTitle, ScrollToTop } from './routes/RouteEffects'
import { useDisableAutofill } from './utils/noAutofill'
import { useEnterToContinue } from './utils/enterKey'
import { useModalA11y } from './utils/modalA11y'

// Global behaviours that apply on every screen
function GlobalBehaviours() {
  const { loggedIn } = useApp()
  // Enter in a text field presses the form's main button everywhere in the app
  useEnterToContinue()
  // Dialog semantics and Escape-to-close for every modal and drawer
  useModalA11y()
  // Browser autofill and saved-value suggestions stay on for the landing, sign-in and register pages only: switched off once signed in
  useDisableAutofill(loggedIn)
  return null
}

// Dropdown choices are loaded once before the first screen draws, so every list shows the admin's choices from the start
function useOptionsLoaded() {
  const [ready, setReady] = useState(false)
  useEffect(() => { loadOptions(3000).finally(() => setReady(true)) }, [])
  return ready
}

export default function App() {
  const optionsReady = useOptionsLoaded()
  const { pathname } = useLocation()
  const showRoute = optionsReady || pathname === '/'

  return (
    <AppProvider>
      <GlobalBehaviours />
      <HomeClass />
      <RouteTitle />
      <ScrollToTop />
      {/* While the dropdown choices load, show the loading bar instead of an empty white screen */}
      {showRoute ? (
        <Suspense fallback={<div className="route-loading" role="status" aria-label="Loading" />}>
          <Outlet />
        </Suspense>
      ) : (
        <div className="route-loading" role="status" aria-label="Loading" />
      )}
      <ToastContainer />
      {/* Styled confirmation dialogs (confirmDialog) can be opened from any screen */}
      <ConfirmHost />
    </AppProvider>
  )
}
