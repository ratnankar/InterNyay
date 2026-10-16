import { useEffect } from 'react'
import BrandMark from './BrandMark'
import Icon from './Icon'

// Full error screen: big status code, a short explanation and the ways out (buttons are passed in as children).
// Needs no app state, so it also works when the app itself has crashed (see routes/RouteError.jsx).
//   embedded  true = sits inside the signed-in layout next to the sidebar; false = takes the whole window with its own header
//   icon      name of the Icon drawn above the code (default: warning)
//   details   optional technical text (e.g. the error message) tucked away in a "Technical details" fold for support
export default function ErrorPage({ code, title, message, address, icon = 'warning', details, embedded = false, children }) {
  // Error screens must never be listed by search engines (a single-page app always answers 200, so the page says it itself),
  // and the tab says what happened
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    const previousTitle = document.title
    document.title = `${title} · InterNyay`
    return () => { meta.remove(); document.title = previousTitle }
  }, [title])

  return (
    <div className={`errpage${embedded ? ' errpage--embedded' : ''}`}>
      {!embedded && (
        <header className="errpage__bar">
          <a href="/" className="errpage__brand" aria-label="InterNyay home"><BrandMark size="md" /><span>InterNyay</span></a>
        </header>
      )}
      <main className="errpage__body" role="alert">
        <div className="errpage__card">
          <span className="errpage__icon" aria-hidden="true"><Icon name={icon} /></span>
          {code && <p className="errpage__code" aria-hidden="true">{code}</p>}
          <h1 className="errpage__title">{title}</h1>
          <p className="errpage__text">{message}</p>
          {address && (
            <p className="errpage__address" title={address}>
              <span>Address:</span>
              <code>{address}</code>
            </p>
          )}
          {children && <div className="errpage__actions">{children}</div>}
          {details && (
            <details className="errpage__details">
              <summary>Technical details</summary>
              <pre>{details}</pre>
            </details>
          )}
        </div>
      </main>
    </div>
  )
}
