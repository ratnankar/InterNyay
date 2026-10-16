import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'

import BrandMark from '../common/BrandMark'
import Icon from '../common/Icon'
import usePlanFeatures from '../../hooks/usePlanFeatures'
import { getAccounts, accountIdOf } from '../../utils/accounts'
import { ADMIN_PATH, HOME_PATH, navToPath } from '../../routes/paths'
import '../../styles/bottom-nav.css'

// Menu items that depend on a plan feature (hidden if the plan doesn't include it)
const NAV_FEATURE = {
  transactions: 'transactions',
  expenses:     'office_expenses',
  documents:    'documents',
  forms:        'legal_forms',
  calculator:   'court_fee_calculator',
}
// Menu shown to advocates and associates (id matches the page name in AppContext); Contact Us lives in the account pop-up
const NAV_ITEMS = [
  { id: 'dashboard',    icon: 'bank',  label: 'Dashboard' },
  { id: 'cases',        icon: 'folder',  label: 'Cases' },
  { id: 'clients',      icon: 'user',  label: 'Clients' },
  { id: 'transactions', icon: 'money',  label: 'Transactions' },
  { id: 'expenses',     icon: 'receipt',  label: 'Expenses' },
  { id: 'documents',    icon: 'file',  label: 'Documents' },
  { id: 'forms',        icon: 'clipboard',  label: 'Legal Forms' },
  { id: 'todos',        icon: 'note',  label: 'To-Do List' },
  { id: 'calculator',   icon: 'calculator',  label: 'Fee Calculator' },
  { id: 'judgeleave',   icon: 'beach',  label: 'Judges on Leave' },
  { id: 'quickaccess',  icon: 'bolt',  label: 'Quick Access' },
]

// Primary mobile tabs; the More tab opens the existing drawer for all other pages.
const BOTTOM_ITEMS = [
  { id: 'dashboard', icon: 'bank', label: 'Home' },
  { id: 'cases', icon: 'folder', label: 'Cases' },
  { id: 'todos', icon: 'note', label: 'To-Do' },
  { id: 'quickaccess', icon: 'bolt', label: 'Quick Access' },
]

// Admins only see the admin console
const ADMIN_NAV_ITEMS = [
  { id: 'admin', icon: 'shield', label: 'Admin Console' },
]

// Profile photo, or the default person avatar if there is no photo or it fails to load
function Avatar({ picture }) {
  // Switch to the default avatar if the image can't be loaded
  const [failed, setFailed] = useState(false)

  if (picture && !failed) {
    return (
      <div className="sidebar__avatar sidebar__avatar--photo">
        <img src={picture} alt="" onError={() => setFailed(true)} />
      </div>
    )
  }

  return <div className="sidebar__avatar"><Icon name="user" /></div>
}

// Left navigation menu (becomes a slide-in drawer on mobile) with the user block and sign out button
export default function Sidebar() {
  const { activeNav, setActiveNav, currentUser, handleLogout, switchAccount, addAccount, isAdmin, isAssociate } = useApp()
  // Whether the drawer is open on small screens
  const [mobileOpen, setMobileOpen] = useState(false)

  // Sign-out confirmation dialog (built into the sidebar so it always shows on the app UI)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const signOutCancelRef = useRef(null)
  useEffect(() => {
    if (!confirmSignOut) return undefined
    signOutCancelRef.current?.focus()
    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); setConfirmSignOut(false) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [confirmSignOut])

  // Whether the account pop-up (Profile, My Plan, Contact Us) above the user row is open
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef(null)
  // Close the user menu when clicking outside it or pressing Escape
  useEffect(() => {
    if (!userMenuOpen) return undefined
    // Close the user menu on an outside click or Escape
    const onDown = e => { if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setUserMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [userMenuOpen])

  // Close the drawer with Escape and prevent background scrolling while it is open.
  useEffect(() => {
    if (!mobileOpen) return undefined
    const onKey = e => { if (e.key === 'Escape') setMobileOpen(false) }
    const prevOverflow = document.body.style.overflow
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [mobileOpen])

  // Swipe left on the drawer to close it.
  const swipeStartX = useRef(null)
  const onDrawerTouchStart = e => { swipeStartX.current = e.touches[0].clientX }
  const onDrawerTouchEnd = e => {
    if (swipeStartX.current !== null && e.changedTouches[0].clientX - swipeStartX.current < -60) setMobileOpen(false)
    swipeStartX.current = null
  }

  // Number of unread admin replies, shown on Contact Us and on the account row
  const [unreadReplies, setUnreadReplies] = useState(0)
  // Refresh the badge whenever the user changes page (admins don't have it)
  useEffect(() => {
    if (isAdmin) return undefined
    let cancelled = false
    api.contact.unreadReplies()
      .then(r => { if (!cancelled) setUnreadReplies(r?.count || 0) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [activeNav, isAdmin])

  const { can } = usePlanFeatures()
  // Menu items for this user: associates don't see transactions, only advocates see expenses, and plan features can hide items
  const navItems = isAdmin
    ? ADMIN_NAV_ITEMS
    : NAV_ITEMS.filter(item => {
        if (isAssociate && item.id === 'transactions') return false
        if (!isAssociate && item.id === 'expenses') return false
        if (NAV_FEATURE[item.id] && !can(NAV_FEATURE[item.id])) return false
        return true
      })
  // The admin item stays highlighted except when the admin opens their own profile
  const isActive = id => (id === 'admin' ? activeNav !== 'profile' : activeNav === id)

  const name    = currentUser?.name    || ''
  const barNo   = String(currentUser?.barNo || '').trim()

  // Close the drawer and the account pop-up (the links themselves do the navigating)
  const closeMenus = () => {
    setMobileOpen(false)
    setUserMenuOpen(false)
  }

  // Change page from a button and close any open menu
  const goTo = id => {
    setActiveNav(id)
    closeMenus()
  }

  // URL of a menu item
  const pathFor = id => navToPath(id, isAdmin)

  // Clicking the InterNyay logo opens the home page: the dashboard, or the admin console for admins
  const homePath = isAdmin ? ADMIN_PATH : HOME_PATH

  // Advocates and associates get the account pop-up; admins go straight to the profile
  const hasUserMenu = !isAdmin

  // Other accounts already signed in on this browser (read when the menu is open, so the list is always current)
  const otherAccounts = hasUserMenu && userMenuOpen
    ? getAccounts().filter(a => a.id !== accountIdOf(currentUser))
    : []
  // Highlight the user row on the profile, plan and contact pages
  const userRowActive = activeNav === 'profile' || activeNav === 'myplan' || activeNav === 'contact'
  // Unread replies show on the account row while the pop-up is closed
  const unreadBadge = unreadReplies > 0 && (
    <span className="nav-item__badge" aria-label={`${unreadReplies} unread repl${unreadReplies === 1 ? 'y' : 'ies'}`}>
      {unreadReplies}
    </span>
  )

  // Mobile top bar, drawer overlay, then the sidebar itself
  return (
    <>
      {/* Top bar with the hamburger button (mobile only) */}
      <div className="mobile-topbar">
        <button type="button"
          className="mobile-topbar__hamburger"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          aria-expanded={mobileOpen}
        >
          <span />
          <span />
          <span />
        </button>
        <Link to={homePath} className="mobile-topbar__brand brand-link" onClick={closeMenus} aria-label="Go to dashboard">
          <BrandMark size="sm" />
          <span>InterNyay</span>
        </Link>
      </div>

      {/* Dark overlay behind the open drawer; tapping it closes the menu */}
      {mobileOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}

      <div className={`sidebar${mobileOpen ? ' sidebar--open' : ''}`} onTouchStart={onDrawerTouchStart} onTouchEnd={onDrawerTouchEnd}>
        <button type="button"
          className="sidebar__close"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <Icon name="close" />
        </button>

        <div className="sidebar__brand">
          <Link to={homePath} className="sidebar__brand-row brand-link" onClick={closeMenus} aria-label="Go to dashboard">
            <BrandMark size="md" />
            <span className="sidebar__brand-name">InterNyay</span>
          </Link>
          <p className="sidebar__brand-tag">PRACTICE MANAGEMENT</p>
        </div>

        {/* Main navigation links */}
        <nav className="sidebar__nav">
          {navItems.map(({ id, icon, label }) => (
            <Link
              key={id}
              to={pathFor(id)}
              className={`nav-item${isActive(id) ? ' active' : ''}`}
              aria-current={isActive(id) ? 'page' : undefined}
              onClick={closeMenus}
            >
              <span className="nav-item__icon"><Icon name={icon} /></span>
              {label}
            </Link>
          ))}
        </nav>

        {/* Bottom block with the user menu, profile row and sign out */}
        <div className="sidebar__user" ref={userMenuRef}>
          {hasUserMenu && userMenuOpen && (
            <div className="sidebar__user-menu" role="menu">
              <Link
                to={pathFor('profile')}
                role="menuitem"
                className={`sidebar__user-menu-item${activeNav === 'profile' ? ' is-active' : ''}`}
                onClick={closeMenus}
              >
                <span className="nav-item__icon"><Icon name="user" /></span>
                My Profile
              </Link>
              {!isAssociate && (
                <Link
                  to={pathFor('myplan')}
                  role="menuitem"
                  className={`sidebar__user-menu-item${activeNav === 'myplan' ? ' is-active' : ''}`}
                  onClick={closeMenus}
                >
                  <span className="nav-item__icon"><Icon name="card" /></span>
                  My Plan
                </Link>
              )}
              <Link
                to={pathFor('contact')}
                role="menuitem"
                className={`sidebar__user-menu-item${activeNav === 'contact' ? ' is-active' : ''}`}
                onClick={closeMenus}
              >
                <span className="nav-item__icon"><Icon name="mail" /></span>
                Contact Us
                {unreadBadge}
              </Link>

              {/* Accounts that are already signed in: one tap to switch, no password needed */}
              <div className="sidebar__user-menu-sep" role="separator" />
              <p className="sidebar__user-menu-label">Switch account</p>
              {otherAccounts.map(account => (
                <button
                  key={account.id}
                  type="button"
                  role="menuitem"
                  className="sidebar__user-menu-item sidebar__user-menu-item--account"
                  onClick={() => switchAccount(account.id)}
                  title={`Switch to ${account.user?.name || account.user?.email || 'this account'}`}
                >
                  <Avatar
                    key={account.user?.profilePicture || 'none'}
                    picture={account.user?.profilePicture}
                  />
                  <span className="sidebar__account-text">
                    <span className="sidebar__account-name">{account.user?.name || 'Account'}</span>
                    <span className="sidebar__account-sub">
                      {String(account.user?.role || '').toUpperCase() === 'ASSOCIATE' ? 'Associate' : 'Advocate'}
                      {account.user?.email ? ` · ${account.user.email}` : ''}
                    </span>
                  </span>
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                className="sidebar__user-menu-item"
                onClick={addAccount}
              >
                <span className="nav-item__icon"><Icon name="user" /></span>
                Add another account
              </button>
            </div>
          )}
          <button
            className={`sidebar__user-row sidebar__user-row--btn${userRowActive ? ' sidebar__user-row--active' : ''}`}
            onClick={() => (hasUserMenu ? setUserMenuOpen(o => !o) : goTo('profile'))}
            aria-haspopup={hasUserMenu ? 'menu' : undefined}
            aria-expanded={hasUserMenu ? userMenuOpen : undefined}
            title={isAssociate ? 'Profile and contact us' : hasUserMenu ? 'Profile, plan and contact us' : 'View / edit advocate profile'}
          >
            <Avatar
              key={currentUser?.profilePicture || 'none'}
              picture={currentUser?.profilePicture}
            />
            <div className="sidebar__user-text">
              <div className="sidebar__user-name-row">
                <p className="sidebar__user-name">{name || (isAssociate ? 'Associate' : 'Advocate')}</p>
                {hasUserMenu && <span className={`sidebar__user-caret${userMenuOpen ? ' is-open' : ''}`} aria-hidden="true" />}
              </div>
              <p className="sidebar__user-bar">
                {isAdmin ? 'ADMINISTRATOR' : (barNo || (isAssociate ? 'ASSOCIATE' : 'ADVOCATE'))}
              </p>
            </div>
            {hasUserMenu && !userMenuOpen && unreadBadge}
          </button>
          <button type="button" className="nav-item nav-item--danger" onClick={() => setConfirmSignOut(true)}>
            <span className="nav-item__icon"><Icon name="logout" /></span>
            Sign Out
          </button>
        </div>
      </div>

      {!isAdmin && (
        <>
          <nav className="bottom-nav" aria-label="Primary">
            {BOTTOM_ITEMS.map(({ id, icon, label }) => (
              <Link key={id} to={pathFor(id)} onClick={closeMenus}
                className="bottom-nav__item"
                aria-current={activeNav === id ? 'page' : undefined}>
                <span className="bottom-nav__icon"><Icon name={icon} /></span>
                <span>{label}</span>
              </Link>
            ))}
            <button type="button" className="bottom-nav__item" onClick={() => setMobileOpen(true)}
              aria-label="More pages" aria-expanded={mobileOpen}
              aria-current={activeNav && !BOTTOM_ITEMS.some(i => i.id === activeNav) ? 'page' : undefined}>
              <span className="bottom-nav__icon" aria-hidden="true">⋯</span>
              <span>More</span>
            </button>
          </nav>
        </>
      )}

      {/* Asks before signing out; rendered on document.body so the sidebar drawer cannot clip it */}
      {confirmSignOut && createPortal(
        <div className="overlay overlay--stacked confirm-overlay" onClick={e => { if (e.target === e.currentTarget) setConfirmSignOut(false) }}>
          <div className="modal modal--sm confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="signout-title" aria-describedby="signout-message">
            <div className="confirm-dialog__head">
              <span className="confirm-dialog__icon" aria-hidden="true"><Icon name="logout" /></span>
              <h2 className="modal__title confirm-dialog__title" id="signout-title">Sign out?</h2>
            </div>
            <p className="confirm-dialog__message" id="signout-message">Are you sure you want to sign out?</p>
            <div className="form-actions confirm-dialog__actions">
              <button type="button" ref={signOutCancelRef} className="btn-outline" onClick={() => setConfirmSignOut(false)}>Cancel</button>
              <button type="button" className="btn-gold" onClick={() => { setConfirmSignOut(false); handleLogout() }}>Sign Out</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}