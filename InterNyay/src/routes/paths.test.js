import { describe, it, expect } from 'vitest'
import {
  parseNavPath, navToPath, isAdminPath, isPublicPath, authTabFromPath, destinationAfterLogin, fillFormPath, adminTabPath, NAV_SLUGS,
} from './paths'

describe('parseNavPath', () => {
  it('reads the page and the case/client id', () => {
    expect(parseNavPath('/cases/12')).toEqual({ nav: 'cases', detail: '12' })
    expect(parseNavPath('/Clients/AB%20C/')).toEqual({ nav: 'clients', detail: 'AB C' })
    expect(parseNavPath('/cases')).toEqual({ nav: 'cases', detail: null })
  })
  it('does not treat other pages\' second segment as an id', () => {
    expect(parseNavPath('/forms/fill/3')).toEqual({ nav: 'forms', detail: null })
  })
  it('understands the admin area', () => {
    expect(parseNavPath('/admin')).toEqual({ nav: 'admin', detail: null })
    expect(parseNavPath('/admin/profile')).toEqual({ nav: 'profile', detail: null })
  })
  it('knows the readable page URLs, and only those', () => {
    expect(parseNavPath('/quick-access')).toEqual({ nav: 'quickaccess', detail: null })
    expect(parseNavPath('/judges-on-leave')).toEqual({ nav: 'judgeleave', detail: null })
    expect(parseNavPath('/my-plan')).toEqual({ nav: 'myplan', detail: null })
    expect(parseNavPath('/misc-applications')).toEqual({ nav: 'miscapps', detail: null })
    // the old run-together addresses are redirected by the router, so they are no page of their own
    expect(parseNavPath('/quickaccess')).toEqual({ nav: '', detail: null })
    expect(parseNavPath('/myplan')).toEqual({ nav: '', detail: null })
  })
  it('gives no page for unknown URLs', () => {
    expect(parseNavPath('/nope')).toEqual({ nav: '', detail: null })
    expect(parseNavPath('/')).toEqual({ nav: '', detail: null })
  })
})

describe('navToPath', () => {
  it('maps page names to URLs', () => {
    expect(navToPath('cases')).toBe('/cases')
    expect(navToPath('admin')).toBe('/admin')
    expect(navToPath('weird')).toBe('/dashboard')
  })
  it('uses the readable URL for renamed pages', () => {
    expect(navToPath('quickaccess')).toBe('/quick-access')
    expect(navToPath('judgeleave')).toBe('/judges-on-leave')
    expect(navToPath('myplan')).toBe('/my-plan')
    expect(navToPath('miscapps')).toBe('/misc-applications')
  })
  it('round-trips every page name through its URL', () => {
    for (const id of ['dashboard', 'cases', 'clients', 'quickaccess', 'judgeleave', 'myplan', 'miscapps', 'contact']) {
      expect(parseNavPath(navToPath(id)).nav).toBe(id)
    }
    expect(Object.keys(NAV_SLUGS).sort()).toEqual(['judgeleave', 'miscapps', 'myplan', 'quickaccess'])
  })
  it('puts the admin profile under /admin', () => {
    expect(navToPath('profile', true)).toBe('/admin/profile')
    expect(navToPath('profile', false)).toBe('/profile')
  })
})

describe('path predicates', () => {
  it('isAdminPath', () => {
    expect(isAdminPath('/admin')).toBe(true)
    expect(isAdminPath('/Admin/profile/')).toBe(true)
    expect(isAdminPath('/administrator')).toBe(false)
  })
  it('isPublicPath', () => {
    expect(isPublicPath('/')).toBe(true)
    expect(isPublicPath('/login')).toBe(true)
    expect(isPublicPath('/cases')).toBe(false)
  })
  it('authTabFromPath', () => {
    expect(authTabFromPath('/register')).toBe('register')
    expect(authTabFromPath('/forgot-password/')).toBe('forgot')
    expect(authTabFromPath('/login')).toBe('login')
    expect(authTabFromPath('/admin')).toBe('login')
  })
})

describe('destinationAfterLogin', () => {
  it('returns to the page that was asked for', () => {
    expect(destinationAfterLogin({ pathname: '/cases/5', search: '?a=1' }, 'ADVOCATE')).toBe('/cases/5?a=1')
  })
  it('never returns to a sign-in or admin page', () => {
    expect(destinationAfterLogin({ pathname: '/login' }, 'ADVOCATE')).toBe('/dashboard')
    expect(destinationAfterLogin({ pathname: '/admin' }, 'ADVOCATE')).toBe('/dashboard')
  })
  it('sends admins to the console and everyone else home', () => {
    expect(destinationAfterLogin({ pathname: '/cases/5' }, 'ADMIN')).toBe('/admin')
    expect(destinationAfterLogin(undefined, 'ASSOCIATE')).toBe('/dashboard')
  })
})

describe('fillFormPath', () => {
  it('builds the form-fill URL', () => {
    expect(fillFormPath(3, 7)).toBe('/forms/fill/3?caseId=7')
    expect(fillFormPath(3)).toBe('/forms/fill/3')
  })
})

describe('adminTabPath', () => {
  it('gives each admin tab its own URL, and the overview the plain console URL', () => {
    expect(adminTabPath('overview')).toBe('/admin')
    expect(adminTabPath()).toBe('/admin')
    expect(adminTabPath('judges')).toBe('/admin/judges')
    expect(adminTabPath('a b')).toBe('/admin/a%20b')
  })
  it('stays inside the admin area', () => {
    expect(isAdminPath(adminTabPath('bail'))).toBe(true)
    expect(parseNavPath(adminTabPath('bail'))).toEqual({ nav: 'admin', detail: null })
  })
})
