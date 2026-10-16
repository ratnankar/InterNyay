import { useEffect } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { isChunkError, reloadOnce } from '../utils/chunkError'
import ErrorPage from '../components/common/ErrorPage'

// Last-resort screen when something throws while a page is drawing (also used for a 404 raised by the router).
// It replaces the whole app, so it uses plain links and no app state.
// Short, plain-text cause for the "Technical details" fold (never the full stack trace)
function describe(error) {
  const text = error?.statusText || error?.message || (typeof error === 'string' ? error : '')
  return text ? String(text).slice(0, 400) : undefined
}

export default function RouteError() {
  const error = useRouteError()
  const status = isRouteErrorResponse(error) ? error.status : null
  const notFound = status === 404
  const outdated = isChunkError(error)

  // A page file that did not download is fixed by loading the newest version, so do that once without asking
  useEffect(() => { if (outdated) reloadOnce() }, [outdated])

  // Keep the real cause in the browser console for whoever debugs it
  if (!notFound && typeof console !== 'undefined') console.error(error)

  return (
    <ErrorPage
      icon={notFound ? 'search' : 'warning'}
      code={notFound ? '404' : status ? String(status) : ''}
      title={notFound ? 'Page not found' : outdated ? 'Updating…' : 'Something went wrong'}
      message={notFound
        ? 'The link you followed is broken or the page has moved.'
        : outdated
        ? 'A new version of InterNyay is available or the connection dropped while the page loaded. Reload to continue.'
        : 'An unexpected error stopped this page from loading. Reloading usually fixes it; if it keeps happening, please contact us.'}
      details={notFound ? undefined : describe(error)}
    >
      {notFound
        ? <a href="/" className="btn-gold">Go to home page</a>
        : <button type="button" className="btn-gold" onClick={() => window.location.reload()}>Reload this page</button>}
      {!notFound && <a href="/" className="btn-outline">Go to home page</a>}
    </ErrorPage>
  )
}
