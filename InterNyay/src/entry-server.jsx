// Used only by scripts/prerender.mjs at build time: draws the landing page to plain HTML so search engines and link previews
// can read it without running JavaScript. The browser still mounts the normal app over it (see main.jsx).
import { renderToString } from 'react-dom/server'
import LandingPage from './pages/LandingPage'

export function renderLanding() {
  return renderToString(<LandingPage onSignIn={() => {}} onRegister={() => {}} />)
}
