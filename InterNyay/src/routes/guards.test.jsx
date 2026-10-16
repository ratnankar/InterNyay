import { Suspense } from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, Outlet, useLocation } from 'react-router-dom'

// The guards only read a few values from the app context, so the context and the heavy screens are replaced
const app = vi.hoisted(() => ({ value: {} }))
vi.mock('../context/AppContext', () => ({ useApp: () => app.value }))
vi.mock('../components/auth/ChoosePlan', () => ({ default: () => <div>CHOOSE PLAN</div> }))
vi.mock('../components/auth/ChooseCourts', () => ({ default: () => <div>CHOOSE COURTS</div> }))
vi.mock('../components/auth/AuthPage', () => ({ default: () => <div>AUTH PAGE</div> }))
vi.mock('./AppLayout', () => ({ default: () => <div>ADMIN LAYOUT<Outlet /></div> }))

import { AdminArea, PublicOnly, RequireAuth } from './guards'

// Shows where the router ended up, plus any "from" state the redirect carried
function Where({ label }) {
  const l = useLocation()
  return <div>{label}|{l.pathname}|{l.state?.from?.pathname || ''}</div>
}

function setup(path) {
  const router = createMemoryRouter([
    { path: '/', element: <Where label="HOME" /> },
    { element: <PublicOnly />, children: [{ path: 'login', element: <Where label="LOGIN" /> }] },
    { path: 'admin', element: <AdminArea />, children: [{ path: ':tab?', element: <Where label="CONSOLE" /> }] },
    { element: <RequireAuth />, children: [{ path: 'dashboard', element: <Where label="DASH" /> }, { path: 'cases/:id', element: <Where label="CASE" /> }, { path: '*', element: <Where label="UNKNOWN" /> }] },
  ], { initialEntries: [path] })
  return render(<Suspense fallback={null}><RouterProvider router={router} /></Suspense>)
}

const base = { loggedIn: false, justSignedOut: false, planPromptOpen: false, courtPromptOpen: false, currentUser: null }

beforeEach(() => { cleanup(); localStorage.clear(); app.value = { ...base } })

describe('RequireAuth', () => {
  it('sends a signed-out visitor to /login and remembers the page', async () => {
    setup('/cases/5')
    expect(await screen.findByText('LOGIN|/login|/cases/5')).toBeTruthy()
  })
  it('sends someone who just signed out to the home page', async () => {
    app.value = { ...base, justSignedOut: true }
    setup('/dashboard')
    expect(await screen.findByText('HOME|/|')).toBeTruthy()
  })
  it('shows "page not found" (not the sign-in page) for an unknown address when signed out', async () => {
    setup('/nonsense')
    expect(await screen.findByText('Page not found')).toBeTruthy()
    expect(screen.queryByText(/^LOGIN/)).toBeNull()
  })
  it('still sends a signed-out visitor from a real page to /login', async () => {
    setup('/dashboard')
    expect(await screen.findByText('LOGIN|/login|/dashboard')).toBeTruthy()
  })
  it('lets a signed-in advocate reach the in-app "not found" route', async () => {
    app.value = { ...base, loggedIn: true, currentUser: { role: 'ADVOCATE' } }
    setup('/nonsense')
    expect(await screen.findByText('UNKNOWN|/nonsense|')).toBeTruthy()
  })
  it('shows \"page not found\" to an admin who types a wrong address, instead of silently redirecting', async () => {
    app.value = { ...base, loggedIn: true, currentUser: { role: 'ADMIN' } }
    setup('/nonsense')
    expect(await screen.findByText('Page not found')).toBeTruthy()
    expect(screen.getByText('Go to admin console')).toBeTruthy()
  })
  it('offers a visitor the way home and to sign in from the \"not found\" page', async () => {
    setup('/nonsense')
    expect(await screen.findByText('Go to home page')).toBeTruthy()
    expect(screen.getByText('Sign in')).toBeTruthy()
  })
  it('lets an advocate through', async () => {
    app.value = { ...base, loggedIn: true, currentUser: { role: 'ADVOCATE' } }
    setup('/dashboard')
    expect(await screen.findByText('DASH|/dashboard|')).toBeTruthy()
  })
  it('sends an admin to the console', async () => {
    app.value = { ...base, loggedIn: true, currentUser: { role: 'ADMIN' } }
    setup('/dashboard')
    expect(await screen.findByText('CONSOLE|/admin|')).toBeTruthy()
  })
  it('knows an admin from the saved session before the profile has loaded', async () => {
    localStorage.setItem('internyay_user', JSON.stringify({ role: 'ADMIN' }))
    app.value = { ...base, loggedIn: true, currentUser: null }
    setup('/dashboard')
    expect(await screen.findByText('CONSOLE|/admin|')).toBeTruthy()
  })
  it('shows the plan picker to a new advocate, but not to an associate', async () => {
    app.value = { ...base, loggedIn: true, planPromptOpen: true, currentUser: { role: 'ADVOCATE' } }
    setup('/dashboard')
    expect(await screen.findByText('CHOOSE PLAN')).toBeTruthy()
    cleanup()
    app.value = { ...base, loggedIn: true, planPromptOpen: true, currentUser: { role: 'ASSOCIATE' } }
    setup('/dashboard')
    expect(await screen.findByText('DASH|/dashboard|')).toBeTruthy()
  })
})

describe('RequireAuth court question', () => {
  it('asks a new advocate for the courts after the plan has been chosen', async () => {
    app.value = { ...base, loggedIn: true, planPromptOpen: true, courtPromptOpen: true, currentUser: { role: 'ADVOCATE' } }
    setup('/dashboard')
    expect(await screen.findByText('CHOOSE PLAN')).toBeTruthy()
    cleanup()
    app.value = { ...base, loggedIn: true, planPromptOpen: false, courtPromptOpen: true, currentUser: { role: 'ADVOCATE' } }
    setup('/dashboard')
    expect(await screen.findByText('CHOOSE COURTS')).toBeTruthy()
  })
  it('asks a new associate for the courts too (associates skip the plan)', async () => {
    app.value = { ...base, loggedIn: true, planPromptOpen: false, courtPromptOpen: true, currentUser: { role: 'ASSOCIATE' } }
    setup('/dashboard')
    expect(await screen.findByText('CHOOSE COURTS')).toBeTruthy()
  })
  it('does not ask again once it has been answered or skipped', async () => {
    app.value = { ...base, loggedIn: true, courtPromptOpen: false, currentUser: { role: 'ADVOCATE' } }
    setup('/dashboard')
    expect(await screen.findByText('DASH|/dashboard|')).toBeTruthy()
  })
})

describe('PublicOnly', () => {
  it('shows the sign-in screen to visitors', async () => {
    setup('/login')
    expect(await screen.findByText('LOGIN|/login|')).toBeTruthy()
  })
  it('sends a signed-in user on to the app', async () => {
    app.value = { ...base, loggedIn: true, currentUser: { role: 'ADVOCATE' } }
    setup('/login')
    expect(await screen.findByText('DASH|/dashboard|')).toBeTruthy()
  })
})

describe('AdminArea', () => {
  it('shows the admin sign-in when signed out', async () => {
    setup('/admin')
    expect(await screen.findByText('AUTH PAGE')).toBeTruthy()
  })
  it('sends an admin who just signed out to the home page, not the old /admin address', async () => {
    app.value = { ...base, justSignedOut: true }
    setup('/admin/users')
    expect(await screen.findByText('HOME|/|')).toBeTruthy()
  })
  it('shows the console to an admin', async () => {
    app.value = { ...base, loggedIn: true, currentUser: { role: 'ADMIN' } }
    setup('/admin')
    expect(await screen.findByText(/ADMIN LAYOUT/)).toBeTruthy()
  })
  it('keeps an admin on the tab named in the address', async () => {
    app.value = { ...base, loggedIn: true, currentUser: { role: 'ADMIN' } }
    setup('/admin/judges')
    expect(await screen.findByText('CONSOLE|/admin/judges|')).toBeTruthy()
  })
  it('turns a non-admin away', async () => {
    app.value = { ...base, loggedIn: true, currentUser: { role: 'ADVOCATE' } }
    setup('/admin')
    expect(await screen.findByText('DASH|/dashboard|')).toBeTruthy()
  })
})
