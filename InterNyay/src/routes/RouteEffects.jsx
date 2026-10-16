// Small behaviours tied to navigation: browser tab title and scroll position.
import { useEffect, useLayoutEffect } from 'react'
import { useLocation, useMatches } from 'react-router-dom'

const DEFAULT_TITLE = 'InterNyay — Practice Management for Delhi Advocates'

// Sets the browser tab title from the matched route's handle.title.
// A route with handle.keepTitle sets its own title and is left alone.
export function RouteTitle() {
  const matches = useMatches()
  const handle = matches.length ? matches[matches.length - 1].handle : null
  const title = handle?.title
  const keep = !!handle?.keepTitle
  useEffect(() => {
    if (keep) return
    document.title = title ? `${title} · InterNyay` : DEFAULT_TITLE
  }, [title, keep])
  return null
}

// Back to the top when the page changes. Opening a case (/cases -> /cases/12) keeps the scroll position.
export function ScrollToTop() {
  const { pathname } = useLocation()
  const section = pathname.split('/')[1] || ''
  useEffect(() => {
    window.scrollTo(0, 0)
    document.querySelector('.app-main')?.scrollTo?.({ top: 0, left: 0, behavior: 'instant' })
  }, [section])
  return null
}

// index.html hides the pre-rendered landing page with the "not-home" class when the page was first opened on any address other than "/"
// (so /dashboard does not flash the landing page). That class has to follow the address afterwards: after Sign Out the app moves to "/"
// without reloading, and with the class left on, the landing page was hidden and the visitor saw a blank white page
export function HomeClass() {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('not-home', pathname.replace(/\/+$/, '') !== '')
  }, [pathname])
  return null
}
