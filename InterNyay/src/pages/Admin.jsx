import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { adminTabPath } from '../routes/paths'
import { useApp } from '../context/AppContext'
import api from '../services/api'
import { NOTIFICATION_SOURCES } from '../constants/notifications'
import { formatDisplayDate } from '../utils/dateUtils'
import ArchiveTree from '../components/common/ArchiveTree'
import { HOLIDAY_COURTS, holidayCourtClass, holidayCourtLabel, holidayCourtOf } from '../constants/holidays'
import { isValidIndianPhone } from '../utils/validators'
import SpecializationSelect from '../components/common/SpecializationSelect'
import useDragReorder from '../hooks/useDragReorder'
import JudgesAdmin from '../components/admin/JudgesAdmin'
import Overview from '../components/admin/AdminOverview'
import CourtsAdmin from '../components/admin/CourtsAdmin'
import BailRosterAdmin from '../components/admin/BailRosterAdmin'
import PoliceAdmin from '../components/admin/PoliceAdmin'
import JudgeLeaveAdmin from '../components/admin/JudgeLeaveAdmin'
import DutyMagistrateAdmin from '../components/admin/DutyMagistrateAdmin'
import SuccessorCourts from '../components/common/SuccessorCourts'
import DrtJurisdictionAdmin from '../components/admin/DrtJurisdictionAdmin'
import ConsumerJurisdictionAdmin from '../components/admin/ConsumerJurisdictionAdmin'
import useOverlayClose from '../hooks/useOverlayClose'
import usePdfViewer from '../hooks/usePdfViewer'
import PdfViewerModal from '../components/common/PdfViewerModal'
import Dropdown from '../components/common/Dropdown'
import PasswordInput from '../components/common/PasswordInput'
import PdfFieldEditor from '../components/admin/PdfFieldEditor'
import ContactMessagesAdmin from '../components/admin/ContactMessagesAdmin'
import LoginLogAdmin from '../components/admin/LoginLogAdmin'
import UserLoginLogsModal from '../components/admin/UserLoginLogsModal'
import PlansAdmin from '../components/admin/PlansAdmin'
import FeeCalculatorAdmin from '../components/admin/FeeCalculatorAdmin'
import OptionsAdmin from '../components/admin/OptionsAdmin'

import Icon from '../components/common/Icon'
import NotificationArchive from '../components/admin/NotificationArchive'
import SeeMore from '../components/common/SeeMore'
import SeeMoreList from '../components/common/SeeMoreList'
import useSeeMore from '../hooks/useSeeMore'
import { getErrorMessage } from '../utils/errorMessages'
import { confirmDialog } from '../utils/confirmDialog'
import ModalPortal from '../components/common/ModalPortal'
import useUnsavedGuard from '../hooks/useUnsavedGuard'
import AdminPasswordModal from '../components/modals/AdminPasswordModal'
import SearchInput from '../components/common/SearchInput'
import ClearableDateInput from '../components/common/ClearableDateInput'

// Admin sidebar: groups of tabs, each group with an icon and its tabs
const TAB_GROUPS = [
  { id: 'overview', icon: 'chart', label: 'Overview', tabs: [
    { id: 'overview', label: 'Overview' },
  ] },
  { id: 'accounts', icon: 'user', label: 'Accounts', tabs: [
    { id: 'users', label: 'Accounts' },
  ] },
  { id: 'loginlog', icon: 'shield', label: 'Login Activity', tabs: [
    { id: 'loginlog', label: 'Login Activity' },
  ] },
  { id: 'plans', icon: 'money', label: 'Plans', tabs: [
    { id: 'plans', label: 'Pricing Plans' },
  ] },
  { id: 'feecalc', icon: 'calculator', label: 'Fee Calculator', tabs: [
    { id: 'feecalc', label: 'Fee Calculator' },
  ] },
  { id: 'options', icon: 'clipboard', label: 'Dropdown Options', tabs: [
    { id: 'options', label: 'Dropdown Options' },
  ] },
  { id: 'courts', icon: 'court', label: 'Courts', tabs: [
    { id: 'courts', label: 'Courts' },
  ] },
  { id: 'quickaccess', icon: 'bolt', label: 'Quick Access', tabs: [
    { id: 'judges',   label: 'Judges List' },
    { id: 'bail',     label: 'Bail Roster' },
    { id: 'duty',     label: 'Duty Magistrate' },
    { id: 'successor', label: 'Successor Courts' },
    { id: 'calendar', label: 'Court Calendar' },
    { id: 'police',   label: 'Police Directory' },
    { id: 'consumer', label: 'Consumer Court Jurisdiction' },
    { id: 'drt',      label: 'DRT Jurisdiction' },
  ] },
  { id: 'leave', icon: 'beach', label: 'Judges on Leave', tabs: [
    { id: 'leave', label: 'Judges on Leave' },
  ] },
  { id: 'updates', icon: 'megaphone', label: 'Updates', tabs: [
    { id: 'notifications', label: 'Notifications' },
    { id: 'holidays',      label: 'Holidays' },
  ] },
  { id: 'forms', icon: 'clipboard', label: 'Legal Forms', tabs: [
    { id: 'forms', label: 'Legal Forms' },
  ] },
  { id: 'contact', icon: 'mail', label: 'Contact Messages', tabs: [
    { id: 'contact', label: 'Contact Messages' },
  ] },
]

// Every tab name that can appear in the address (/admin/:tab)
const ADMIN_TAB_IDS = TAB_GROUPS.flatMap(g => g.tabs.map(t => t.id))

// Turn a byte count into B, KB or MB text
function formatBytes(n) {
  if (!n && n !== 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// Read the fillable fields saved on a legal form, or an empty list if none or unreadable
function detectedFormFields(row) {
  if (!row?.fillable || !row.fieldConfig) return []
  try {
    const parsed = typeof row.fieldConfig === 'string' ? JSON.parse(row.fieldConfig) : row.fieldConfig
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// Fields of the account editor: label, input type, choices and hint text
const USER_FIELDS = [
  { key: 'name',           label: 'Full name' },
  { key: 'email',          label: 'Email', type: 'email' },
  { key: 'phone',          label: 'Phone', type: 'tel',
    hint: '10-digit mobile number, optionally with +91' },
  { key: 'barNo',          label: 'Bar council no.' },
  { key: 'specialization', label: 'Specialization' },
  { key: 'chamber',        label: 'Chamber' },
  { key: 'role',           label: 'Role', type: 'select', options: ['ADVOCATE', 'ADMIN'] },
  { key: 'planCode',       label: 'Plan', type: 'select', options: [] }, // filled from the plans table at render time (see planOptions)
  { key: 'associateLimit', label: 'Associate limit', type: 'number',
    hint: 'How many associates this advocate can add. Leave blank to follow the plan; -1 means unlimited.' },
  { key: 'active',         label: 'Status', type: 'select', options: ['true', 'false'],
    hint: "Disabling an advocate also blocks all of their associates." },
  { key: 'password',       label: 'Password', type: 'password',
    hint: 'Min 8 characters with upper, lower, number & symbol. To change it later, use Reset password on the account.' },
]

// Role as shown in the table
const roleLabel = role => role

// Fields an associate account can have
const ASSOCIATE_FIELD_KEYS = ['name', 'email', 'phone', 'barNo', 'active', 'password']

// Drop the password field, used when editing an existing account
const withoutPassword = fields => fields.filter(f => f.key !== 'password')

// Account type filter choices
const ROLE_FILTERS = [
  { value: 'ALL',       label: 'All accounts' },
  { value: 'ADVOCATE',    label: 'Advocates'    },
  { value: 'ASSOCIATE', label: 'Associates'   },
  { value: 'ADMIN',     label: 'Admins'       },
]

// Password rule: 8+ characters with upper case, lower case, a number and a symbol
const STRONG_PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/
// Basic email shape check
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Return an error message for an invalid email, phone or password, or null if the field is fine
function validateUserField(key, rawValue, isNew) {
  const value = (rawValue ?? '').trim()

  if (key === 'email' && value && !EMAIL_PATTERN.test(value)) {
    return 'Enter a valid email address'
  }

  if (key === 'phone' && value && !isValidIndianPhone(value)) {
    return 'Enter a valid 10-digit mobile number (optionally with +91)'
  }

  if (key === 'associateLimit' && value) {
    const n = Number(value)
    if (!Number.isInteger(n) || n < -1 || n > 1000) return 'Enter -1 (unlimited) or a whole number from 0 to 1000'
  }

  if (key === 'password') {
    if (isNew && !value) return 'Password is required'
    if (value && !STRONG_PASSWORD_PATTERN.test(value)) {
      return 'Min 8 characters, with upper & lower case, a number and a symbol'
    }
  }

  return null
}

// Contact messages: the alert on the Overview stays until the admin opens the Contact Messages tab.
// The highest message id the admin has seen is kept per admin in this browser, so reading a message is not what clears the alert
const contactSeenKey = userId => `internyay_contact_seen_${userId ?? 'admin'}`
function readContactSeen(userId) {
  try {
    const raw = localStorage.getItem(contactSeenKey(userId))
    return raw === null ? null : Number(raw)
  } catch {
    return null
  }
}
function writeContactSeen(userId, list) {
  const maxId = list.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0)
  try {
    const prev = readContactSeen(userId)
    if (prev === null || maxId > prev) localStorage.setItem(contactSeenKey(userId), String(maxId))
  } catch {
    return
  }
}
// Messages the admin has not seen yet. Before the tab was ever opened, the messages still marked New are counted
function countUnseenContact(list, userId) {
  const seen = readContactSeen(userId)
  return seen === null
    ? list.filter(m => m.status === 'NEW').length
    : list.filter(m => Number(m.id) > seen).length
}

// Admin page: dashboard stats, accounts, plans, Quick Access data, court updates, legal forms and contact messages
// Holiday date used to group the holidays list by year and month
const holidayDate = h => h.date

export default function Admin() {

  // Shared app state and helpers
  const { currentUser, isAdmin, addToast, setActiveNav } = useApp()

  // The selected tab lives in the URL (/admin/judges), so a refresh, the back button and a shared link all land on the same tab.
  // An unknown tab name falls back to the overview and the address is corrected
  const navigate = useNavigate()
  // Account whose login activity popup is open (null when closed)
  const [logUser, setLogUser] = useState(null)
  const { tab: tabParam } = useParams()
  const tab = ADMIN_TAB_IDS.includes(tabParam) ? tabParam : 'overview'
  const setTab = useCallback(id => navigate(adminTabPath(id)), [navigate])
  useEffect(() => {
    if (tabParam && !ADMIN_TAB_IDS.includes(tabParam)) navigate(adminTabPath('overview'), { replace: true })
  }, [tabParam, navigate])

  // Overview and accounts: stats, users, plans, filters and the account being edited
  const [stats,    setStats]    = useState(null)
  const [users,    setUsers]    = useState([])
  const [planList, setPlanList] = useState([])
  // Contact messages that came in since the admin last opened the Contact Messages tab, shown on the Overview (null until loaded)
  const [newMessages, setNewMessages] = useState(null)
  // Options for the account Plan dropdown, taken from the plans table (coming soon plans are left out unless the account is already on one)
  // Only plans shown to this kind of account are offered: ADVOCATE plans for advocates, BUSINESS plans for business
  // accounts, BOTH plans for either. The plan the account is already on always stays in the list
  const planOptions = (current, role) => {
    const wanted = role === 'BUSINESS' ? 'BUSINESS' : 'ADVOCATE'
    const fromDb = planList
      .filter(p => p.code === current || (p.enabled !== false && !p.comingSoon && [wanted, 'BOTH'].includes(p.audience || 'ADVOCATE')))
      .map(p => ({ value: p.code, label: p.name }))
    if (fromDb.length) return fromDb
    // Plans could not be loaded: offer only the account's current plan (or Free) instead of a hard-coded list
    const fallback = current || 'FREE'
    return [{ value: fallback, label: fallback.charAt(0) + fallback.slice(1).toLowerCase() }]
  }
  const [search,   setSearch]   = useState('')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [loading,  setLoading]  = useState(false)
  const [editing,  setEditing]  = useState(null)
  const [userFormErrors, setUserFormErrors] = useState({})

  // Court calendar list and the calendar being edited
  const [calendars,        setCalendars]        = useState([])
  const [calendarLoading,  setCalendarLoading]  = useState(false)
  const [calendarEditing,  setCalendarEditing]  = useState(null)
  // Court calendar PDF opened for viewing, and the year being fetched
  const calendarViewer = usePdfViewer()
  const [calendarOpening, setCalendarOpening] = useState(null)

  // Legal forms list, the form being edited and the form being marked for fillable fields
  const [forms,            setForms]            = useState([])
  const [formsLoading,     setFormsLoading]     = useState(false)
  const [formEditing,      setFormEditing]      = useState(null)
  const [markingForm,      setMarkingForm]      = useState(null)

  // Notifications list and the notification form
  const [notifs,           setNotifs]           = useState([])
  const [notifsLoading,    setNotifsLoading]    = useState(false)
  const [notifForm,        setNotifForm]        = useState(null)

  // Holidays list and the holiday being edited
  const [holidays,         setHolidaysList]     = useState([])
  const [holidaysLoading,  setHolidaysLoading]  = useState(false)
  const [holidayEditing,   setHolidayEditing]   = useState(null)

  // Close handlers for each editor popup
  const closeUserEditor     = useCallback(() => setEditing(null),         [])
  // Close handlers for the editors, kept stable so child components don't re-render
  const closeCalendarEditor = useCallback(() => setCalendarEditing(null), [])
  const closeFormEditor     = useCallback(() => setFormEditing(null),     [])
  const closeNotifForm      = useCallback(() => setNotifForm(null),       [])
  const closeHolidayEditor  = useCallback(() => setHolidayEditing(null),  [])

  // Close each popup when its backdrop is clicked
  const userOverlay     = useOverlayClose(closeUserEditor, { backdrop: false })
  const calendarOverlay = useOverlayClose(closeCalendarEditor, { backdrop: false })
  const formOverlay     = useOverlayClose(closeFormEditor, { backdrop: false })
  const notifOverlay    = useOverlayClose(closeNotifForm, { backdrop: false })
  const holidayOverlay  = useOverlayClose(closeHolidayEditor, { backdrop: false })

  // Admin only: load stats, users and plans together.
  // A request that fails keeps the data already on screen (it is never replaced by an empty list) and the admin is told.
  // Returns true when all three loaded.
  const load = useCallback(async () => {
    if (!isAdmin) return true
    setLoading(true)
    try {
      const [statsRes, usersRes, plansRes] = await Promise.allSettled([
        api.admin.stats(),
        api.admin.users.list(),
        api.admin.plans.list(),
      ])
      const failed = []
      if (statsRes.status === 'fulfilled') setStats(statsRes.value)
      else failed.push('overview numbers')
      if (usersRes.status === 'fulfilled') setUsers(Array.isArray(usersRes.value) ? usersRes.value : [])
      else failed.push('accounts')
      if (plansRes.status === 'fulfilled') setPlanList(Array.isArray(plansRes.value) ? plansRes.value : [])
      else failed.push('plans')
      if (failed.length) {
        const reason = [statsRes, usersRes, plansRes].find(r => r.status === 'rejected')?.reason
        addToast(getErrorMessage(reason, `Could not load ${failed.join(', ')}. Showing the last data.`), 'error')
      }
      return failed.length === 0
    } finally {
      setLoading(false)
    }
  }, [isAdmin, addToast])

  // Load admin data on first render
  useEffect(() => { load() }, [load])

  // On a phone the tab bars scroll sideways: bring the open tab into view (a link or refresh can land on a tab that is off screen)
  // Only the bar itself slides, and only when the open tab is not fully visible; the page never moves and a visible tab never makes the bar jump
  useEffect(() => {
    document.querySelectorAll('.admin__tab--active, .admin__subtab--active').forEach(el => {
      const bar = el.parentElement
      if (!bar) return
      const b = bar.getBoundingClientRect(), r = el.getBoundingClientRect()
      if (r.left >= b.left && r.right <= b.right) return
      bar.scrollTo?.({ left: bar.scrollLeft + (r.left + r.width / 2) - (b.left + b.width / 2) })
    })
  }, [tab])

  // Re-read the plans and the new contact messages when the Overview opens, so its numbers follow changes made in other tabs
  useEffect(() => {
    if (!isAdmin || tab !== 'overview') return
    api.admin.plans.list().then(r => { if (Array.isArray(r)) setPlanList(r) }).catch(() => {})
    api.admin.contactMessages.list()
      .then(r => setNewMessages(Array.isArray(r) ? countUnseenContact(r, currentUser?.id) : null))
      .catch(() => setNewMessages(null))
  }, [isAdmin, tab, currentUser?.id])

  // Auto-refresh the Overview every 5 minutes while it is open and the browser tab is visible. It runs quietly (no loading state,
  // no blinking), only re-reads stats, plans and new messages, and keeps the old numbers if a request fails.
  // Coming back to a tab that was hidden for longer than 5 minutes refreshes straight away. The Refresh button still reloads everything.
  useEffect(() => {
    if (!isAdmin || tab !== 'overview') return
    const EVERY_MS = 5 * 60 * 1000
    let last = Date.now()
    const refreshQuietly = () => {
      last = Date.now()
      api.admin.stats().then(r => { if (r) setStats(r) }).catch(() => {})
      api.admin.plans.list().then(r => { if (Array.isArray(r)) setPlanList(r) }).catch(() => {})
      api.admin.contactMessages.list()
        .then(r => { if (Array.isArray(r)) setNewMessages(countUnseenContact(r, currentUser?.id)) })
        .catch(() => {})
    }
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refreshQuietly()
    }, EVERY_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last >= EVERY_MS) refreshQuietly()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [isAdmin, tab, currentUser?.id])

  // Admin only: load court calendars
  const loadCalendars = useCallback(async () => {
    if (!isAdmin) return true
    setCalendarLoading(true)
    try {
      const res = await api.courtCalendar.list()
      setCalendars(Array.isArray(res) ? res : [])
      return true
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not load court calendars'), 'error')
      return false
    } finally {
      setCalendarLoading(false)
    }
  }, [isAdmin, addToast])

  // Admin only: load legal forms
  const loadForms = useCallback(async () => {
    if (!isAdmin) return true
    setFormsLoading(true)
    try {
      const res = await api.legalForms.list()
      setForms(Array.isArray(res) ? res : [])
      return true
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not load legal forms'), 'error')
      return false
    } finally {
      setFormsLoading(false)
    }
  }, [isAdmin, addToast])

  // Admin only: load notifications
  const loadNotifs = useCallback(async () => {
    if (!isAdmin) return true
    setNotifsLoading(true)
    try {
      const res = await api.notifications.list()
      setNotifs(Array.isArray(res) ? res : [])
      return true
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not load notifications'), 'error')
      return false
    } finally {
      setNotifsLoading(false)
    }
  }, [isAdmin, addToast])

  // Admin only: load holidays
  const loadHolidays = useCallback(async () => {
    if (!isAdmin) return true
    setHolidaysLoading(true)
    try {
      const res = await api.holidays.list()
      setHolidaysList(Array.isArray(res) ? res : [])
      return true
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not load holidays'), 'error')
      return false
    } finally {
      setHolidaysLoading(false)
    }
  }, [isAdmin, addToast])

  // Load each tab's data the first time that tab opens
  useEffect(() => {
    if (tab === 'calendar' && calendars.length === 0 && !calendarLoading) loadCalendars()
    if (tab === 'forms' && forms.length === 0 && !formsLoading) loadForms()
    if (tab === 'notifications' && notifs.length === 0 && !notifsLoading) loadNotifs()
    if (tab === 'holidays' && holidays.length === 0 && !holidaysLoading) loadHolidays()
  }, [tab])

  // Refresh button: reloads the account data and the open tab. Tabs that load their own data are re-created,
  // which makes them fetch again (an unsaved edit inside such a tab is discarded)
  const [refreshKey, setRefreshKey] = useState(0)
  const refreshBusy = loading
    || (tab === 'calendar' && calendarLoading) || (tab === 'forms' && formsLoading)
    || (tab === 'notifications' && notifsLoading) || (tab === 'holidays' && holidaysLoading)
  const refreshAll = useCallback(async () => {
    setRefreshKey(k => k + 1)
    const jobs = [load()]
    if (tab === 'calendar') jobs.push(loadCalendars())
    if (tab === 'forms') jobs.push(loadForms())
    if (tab === 'notifications') jobs.push(loadNotifs())
    if (tab === 'holidays') jobs.push(loadHolidays())
    const results = await Promise.all(jobs)
    if (results.every(Boolean)) addToast('Refreshed')
  }, [tab, load, loadCalendars, loadForms, loadNotifs, loadHolidays, addToast])

  // Password popup for permanent actions (null when closed)
  const [passwordPrompt, setPasswordPrompt] = useState(null)

  // Delete an account (or remove an associate): asks for the acting admin's own password first, then reloads
  function remove(row) {

    const label = row.name || `#${row.id}`

    const message = row.role === 'ASSOCIATE'
      ? `Remove ${label}? They lose access immediately. Nothing is deleted from ${row.advocateName || "the advocate"}'s practice.`
      : row.role === 'ADVOCATE'
        ? `Delete ${label}? Every case, client, task and document owned by this advocate` +
          `${associateCounts.get(row.id) ? `, and their ${associateCounts.get(row.id)} associate account(s),` : ''} will also be removed.`
        : `Delete ${label}?`

    setPasswordPrompt({
      title: row.role === 'ASSOCIATE' ? 'Remove account?' : 'Delete account?',
      message: `${message} This cannot be undone.`,
      confirmLabel: row.role === 'ASSOCIATE' ? 'Remove' : 'Delete permanently',
      onConfirm: async password => {
        await api.admin.users.remove(row.id, password)
        addToast(row.role === 'ASSOCIATE' ? 'Removed' : 'Deleted')
        setEditing(cur => (cur?.id === row.id ? null : cur))
        load()
      },
    })
  }

  // Activate or deactivate an account after confirming. Deactivating an advocate also blocks their associates
  async function toggleActive(row) {

    const activate = row.active === false
    const label = row.name || `#${row.id}`

    const message = activate
      ? `Activate ${label}? They can sign in again.`
      : row.role === 'ADVOCATE'
        ? `Deactivate ${label}? They and all of their associates are blocked from signing in until reactivated.`
        : `Deactivate ${label}? They are blocked from signing in until reactivated.`

    if (!(await confirmDialog({ title: activate ? 'Activate account?' : 'Deactivate account?', message, confirmLabel: activate ? 'Activate' : 'Deactivate', danger: !activate }))) return

    try {
      await api.admin.users.update(row.id, { active: activate })
      addToast(activate ? 'Account activated' : 'Account deactivated')
      setEditing(null)
      load()
    } catch (e) {
      addToast(getErrorMessage(e, 'Update failed'), 'error')
    }
  }

  // Account whose password reset is in progress
  const [resettingId, setResettingId] = useState(null)

  // Email a temporary password to the account after confirming
  async function resetPassword(row) {

    const label = row.name || row.email || `#${row.id}`

    if (!await confirmDialog(
      `Reset the password for ${label}?\n\nA temporary password will be emailed to ${row.email}. ` +
      `Their current password stops working immediately.`
    )) return

    setResettingId(row.id)
    try {
      await api.admin.users.resetPassword(row.id)
      addToast(`Temporary password sent to ${row.email}`)
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not reset the password'), 'error')
    } finally {
      setResettingId(null)
    }
  }

  // Open the account editor, blank for a new account or filled from an existing one
  function startEdit(row) {

    const form = {}
    USER_FIELDS.forEach(f => {
      const v = row?.[f.key]
      form[f.key] = v === null || v === undefined ? '' : String(v)
    })

    setUserFormErrors({})
    // Re-read the plans so changes made in the Pricing Plans tab show up in the Plan dropdown
    api.admin.plans.list().then(r => { if (Array.isArray(r)) setPlanList(r) }).catch(() => {})
    setEditing({
      id: row?.id ?? null,
      form,
      baseline: JSON.stringify(form),
      isNew: !row,
      role: row?.role || null,
      advocateName: row?.advocateName || null,
    })
  }

  // Update a field in the account form and re-validate it
  function updateUserField(key, value) {
    setEditing(s => ({ ...s, form: { ...s.form, [key]: value } }))
    setUserFormErrors(errs => ({
      ...errs,
      [key]: validateUserField(key, value, editing?.isNew),
    }))
  }

  // Validate the account form, then create or update the account
  async function save(adminPassword) {

    if (!editing) return

    const { id, form, isNew } = editing

    // An advocate becoming an administrator needs the acting admin's password first (asked inside this window)
    const makingAdmin = !isNew && editing.role === 'ADVOCATE' && form.role === 'ADMIN'

    const errors = {}
    editFields.forEach(f => {
      const err = validateUserField(f.key, form[f.key], isNew)
      if (err) errors[f.key] = err
    })

    if (Object.keys(errors).length > 0) {
      setUserFormErrors(errors)
      addToast('Fix the highlighted fields before saving', 'error')
      return
    }

    const body = {}

    editFields.forEach(f => {
      const v = form[f.key]
      if (v === '' || v === undefined) return
      if (f.key === 'active') body.active = v === 'true'
      else if (f.key === 'associateLimit') body.associateLimit = Number(v)
      else body[f.key] = v
    })

    // A blank associate limit on an existing advocate hands control back to the plan
    if (!isNew && editFields.some(f => f.key === 'associateLimit') && String(form.associateLimit ?? '').trim() === '') {
      body.clearAssociateLimit = true
    }

    if (makingAdmin) {
      if (adminPassword === undefined) {
        setEditing(s => ({ ...s, adminConfirm: { password: '', error: '', busy: false } }))
        return
      }
      body.adminPassword = adminPassword
    }

    try {
      if (isNew) await api.admin.users.create(body)
      else       await api.admin.users.update(id, body)

      addToast(makingAdmin ? `${form.name || form.email} is now an administrator` : 'Saved')
      setEditing(null)
      load()
    } catch (e) {
      const message = getErrorMessage(e, 'Save failed')
      // Keep the password step open and show the problem under the field
      if (makingAdmin) setEditing(s => s && ({ ...s, adminConfirm: { password: adminPassword, error: message, busy: false } }))
      else addToast(message, 'error')
    }
  }

  // Password step for making an administrator: update the field, or send it
  function setAdminConfirm(patch) {
    setEditing(s => s && ({ ...s, adminConfirm: { ...s.adminConfirm, ...patch } }))
  }
  async function submitAdminConfirm() {
    const c = editing?.adminConfirm
    if (!c || c.busy) return
    if (!c.password) { setAdminConfirm({ error: 'Enter your password to continue' }); return }
    setAdminConfirm({ busy: true, error: '' })
    await save(c.password)
  }

  // Open the calendar editor, defaulting to the current year for a new one
  function startCalendarEdit(row) {
    setCalendarEditing({
      year: row ? String(row.year) : String(new Date().getFullYear()),
      isNew: !row,
      file: null,
    })
  }

  // Check the year and PDF, then upload the court calendar
  async function saveCalendar() {
    if (!calendarEditing) return
    const { year, file } = calendarEditing

    if (!year || !/^\d{4}$/.test(String(year))) {
      addToast('Enter a valid 4-digit year', 'error')
      return
    }
    if (!file) {
      addToast('Choose a PDF file to upload', 'error')
      return
    }

    try {
      const formData = new FormData()
      formData.append('file', file)
      await api.courtCalendar.upload(year, formData)
      addToast('Saved')
      setCalendarEditing(null)
      loadCalendars()
    } catch (e) {
      addToast(getErrorMessage(e, 'Upload failed'), 'error')
    }
  }

  // Open a year's court calendar PDF in the viewer, the same way advocates see it in Quick Access
  async function viewCalendar(year) {
    setCalendarOpening(year)
    try {
      await calendarViewer.open(async () => URL.createObjectURL(await api.courtCalendar.get(year)), `${year} Court Calendar`)
    } catch (e) {
      addToast(getErrorMessage(e, `Could not open the ${year} calendar`), 'error')
    } finally {
      setCalendarOpening(null)
    }
  }

  // Delete a year's court calendar after confirming
  async function removeCalendar(year) {
    if (!await confirmDialog(`Delete the ${year} court calendar?`)) return
    try {
      await api.courtCalendar.remove(year)
      addToast('Deleted')
      loadCalendars()
    } catch (e) {
      addToast(getErrorMessage(e, 'Delete failed'), 'error')
    }
  }

  // Blank legal form
  const EMPTY_FORM_FIELDS = { name: '', description: '', fillable: false }

  // Open the legal form editor, blank for a new form or filled from an existing one
  function startFormEdit(row) {
    setFormEditing({
      id: row?.id ?? null,
      isNew: !row,
      file: null,
      origFillable: !!row?.fillable,
      detected: detectedFormFields(row),
      form: row
        ? {
            name: row.name || '',
            description: row.description || '',
            fillable: !!row.fillable,
          }
        : { ...EMPTY_FORM_FIELDS },
    })
  }

  // Validate and save a legal form, optionally opening the field marker afterwards
  async function saveForm(markAfter = false) {
    if (!formEditing) return
    const { id, isNew, file, form, origFillable } = formEditing

    if (isNew && !form.name.trim()) {
      addToast('Form name is required', 'error')
      return
    }
    if (isNew && !file) {
      addToast('Choose a PDF file to upload', 'error')
      return
    }

    const body = new FormData()
    if (form.name.trim())        body.append('name', form.name.trim())
    if (form.description != null) body.append('description', form.description.trim())
    if (file)                    body.append('file', file)
    if (markAfter && (isNew || file)) {
      body.append('fillable', 'false')
    } else if (isNew || file || form.fillable !== origFillable) {
      body.append('fillable', form.fillable ? 'true' : 'false')
    }

    try {
      const saved = isNew ? await api.legalForms.upload(body)
                          : await api.legalForms.update(id, body)

      addToast('Saved')
      setFormEditing(null)
      loadForms()
      if (markAfter && saved?.id) setMarkingForm(saved)
    } catch (e) {
      addToast(getErrorMessage(e, 'Save failed'), 'error')
    }
  }

  // Press and hold the grip of a form and drag it to any place; the order is saved once, on release
  const formDrag = useDragReorder(forms.map(f => f.id), async (_start, finalKeys) => {
    const byId = new Map(forms.map(f => [String(f.id), f]))
    if (finalKeys.some(k => !byId.has(k))) return
    setForms(finalKeys.map(k => byId.get(k)))
    try {
      await api.legalForms.reorder(finalKeys.map(k => byId.get(k).id))
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not save the order'), 'error')
      loadForms()
    }
  })

  // Move a form up or down in the list and save the new order, reloading if saving fails
  async function moveForm(id, dir) {
    const i = forms.findIndex(f => f.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= forms.length) return
    const next = [...forms]
    ;[next[i], next[j]] = [next[j], next[i]]
    setForms(next)
    try {
      await api.legalForms.reorder(next.map(f => f.id))
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not save the order'), 'error')
      loadForms()
    }
  }

  // Delete a legal form after confirming
  async function removeForm(id, label) {
    if (!await confirmDialog(`Delete "${label}"?`)) return
    try {
      await api.legalForms.remove(id)
      addToast('Deleted')
      loadForms()
    } catch (e) {
      addToast(getErrorMessage(e, 'Delete failed'), 'error')
    }
  }

  // Blank notification, dated today
  const EMPTY_NOTIF_FORM = {
    id: null,
    source: NOTIFICATION_SOURCES.find(s => s !== 'All') || '',
    title: '',
    message: '',
    date: new Date().toISOString().slice(0, 10),
    file: null,
    hasExistingPdf: false,
    removeFile: false,
    important: false,
  }

  // Open the notification form for a new notification
  function startPushNotification() {
    setNotifForm({ ...EMPTY_NOTIF_FORM })
  }

  // Open the notification form filled from an existing notification
  function startEditNotification(n) {
    setNotifForm({
      id: n.id,
      source: n.source,
      title: n.title,
      message: n.message || '',
      date: n.date ? String(n.date).slice(0, 10) : new Date().toISOString().slice(0, 10),
      file: null,
      hasExistingPdf: !!n.hasPdf,
      removeFile: false,
      important: !!n.important,
    })
  }

  // Validate and save the notification, creating or updating it
  async function pushNotification() {
    if (!notifForm) return
    const { id, source, title, message, date, file, removeFile, important } = notifForm

    if (!source) { addToast('Choose a source', 'error'); return }
    if (!title.trim()) { addToast('Title is required', 'error'); return }

    const body = new FormData()
    body.append('source', source)
    body.append('title', title.trim())
    if (message) body.append('message', message)
    if (date)    body.append('date', date)
    if (file)    body.append('file', file)
    body.append('important', String(!!important))

    try {
      if (id) {
        if (removeFile) body.append('removeFile', 'true')
        await api.notifications.update(id, body)
        addToast('Notification updated')
      } else {
        await api.notifications.create(body)
        addToast('Notification pushed')
      }
      setNotifForm(null)
      loadNotifs()
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not save notification'), 'error')
    }
  }

  // Delete a notification after confirming
  async function removeNotification(id, label) {
    if (!await confirmDialog(`Delete "${label}"?`)) return
    try {
      await api.notifications.remove(id)
      addToast('Deleted')
      loadNotifs()
    } catch (e) {
      addToast(getErrorMessage(e, 'Delete failed'), 'error')
    }
  }

  // Blank holiday, applying to both courts
  const EMPTY_HOLIDAY_FORM = { date: '', label: '', description: '', courtType: 'BOTH' }

  // Open the holiday editor, blank for a new holiday or filled from an existing one
  function startHolidayEdit(row) {
    setHolidayEditing({
      id: row?.id ?? null,
      isNew: !row,
      form: row
        ? {
            date: row.date || '',
            label: row.label || '',
            description: row.description || '',
            courtType: holidayCourtOf(row),
          }
        : { ...EMPTY_HOLIDAY_FORM },
    })
  }

  // Validate and save the holiday, creating or updating it
  async function saveHoliday() {
    if (!holidayEditing) return
    const { id, isNew, form } = holidayEditing

    if (!form.date)  { addToast('Date is required', 'error'); return }
    if (!form.label.trim()) { addToast('Label is required', 'error'); return }

    const body = {
      date: form.date,
      label: form.label.trim(),
      description: form.description || '',
      courtType: form.courtType || 'BOTH',
    }

    try {
      if (isNew) await api.holidays.create(body)
      else       await api.holidays.update(id, body)

      addToast('Saved')
      setHolidayEditing(null)
      loadHolidays()
    } catch (e) {
      addToast(getErrorMessage(e, 'Save failed'), 'error')
    }
  }

  // Delete a holiday after confirming. It disappears from every advocate's hearing calendar
  async function removeHoliday(id, label) {
    if (!await confirmDialog(`Delete the holiday "${label}"? It will disappear from every advocate's hearing calendar.`)) return
    try {
      await api.holidays.remove(id)
      addToast('Deleted')
      loadHolidays()
    } catch (e) {
      addToast(getErrorMessage(e, 'Delete failed'), 'error')
    }
  }

  // Accounts matching the selected account type and the search text
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter(r =>
      (roleFilter === 'ALL' || r.role === roleFilter) &&
      (!q || JSON.stringify(r).toLowerCase().includes(q))
    )
  }, [users, search, roleFilter])

  // Show the accounts a page at a time; starts again when the search or account type changes
  const accountsStep = 25
  const {
    visible: visibleAccounts,
    remaining: accountsRemaining,
    showMore: showMoreAccounts, step: showMoreAccountsStep,
  } = useSeeMore(visible, `${search}|${roleFilter}`, accountsStep)

  // Number of associates under each advocate, keyed by advocate id
  const associateCounts = useMemo(() => {
    const counts = new Map()
    users.forEach(u => {
      if (u.role === 'ASSOCIATE' && u.advocateId != null) {
        counts.set(u.advocateId, (counts.get(u.advocateId) || 0) + 1)
      }
    })
    return counts
  }, [users])

  // Fields shown in the account editor: associates get fewer, and the password field only appears for a new account
  const editFields = useMemo(() => {
    const base = editing?.role === 'ASSOCIATE'
      ? USER_FIELDS.filter(f => ASSOCIATE_FIELD_KEYS.includes(f.key))
      : USER_FIELDS
    // Admins have no plan limits: the associate limit only applies to advocates
    const forRole = editing?.form?.role === 'ADMIN' ? base.filter(f => f.key !== 'associateLimit') : base
    return editing?.isNew ? forRole : withoutPassword(forRole)
  }, [editing])

  // The account being edited, looked up from the users list
  const editedRow = useMemo(
    () => (editing?.id != null ? users.find(u => u.id === editing.id) || null : null),
    [editing?.id, users]
  )

  // Associates of the advocate being edited
  const editedAssociates = useMemo(
    () => (editedRow?.role === 'ADVOCATE' ? users.filter(u => u.role === 'ASSOCIATE' && u.advocateId === editedRow.id) : []),
    [editedRow, users]
  )

  // The advocate an associate being edited works for
  const editedAdvocate = useMemo(
    () => (editedRow?.role === 'ASSOCIATE' ? users.find(u => u.id === editedRow.advocateId) || null : null),
    [editedRow, users]
  )

  // Tab group that contains the selected tab
  const activeGroup = TAB_GROUPS.find(g => g.tabs.some(t => t.id === tab)) || TAB_GROUPS[0]

  // The tab bar is one row that slides sideways; keep the open tab in view when it changes (or on a direct link to a tab)
  const tabBarRef = useRef(null)
  useEffect(() => {
    const bar = tabBarRef.current
    const active = bar?.querySelector('.admin__tab--active')
    if (!bar || !active) return
    const b = bar.getBoundingClientRect(), r = active.getBoundingClientRect()
    if (r.left >= b.left && r.right <= b.right) return
    bar.scrollTo?.({ left: bar.scrollLeft + (r.left + r.width / 2) - (b.left + b.width / 2), behavior: 'smooth' })
  }, [activeGroup.id])

  // Soft fade on the side of a tab bar that still has hidden tabs (replaces the old scrollbar)
  const subTabBarRef = useRef(null)
  useEffect(() => {
    const bars = [tabBarRef.current, subTabBarRef.current].filter(Boolean)
    const update = bar => {
      const max = bar.scrollWidth - bar.clientWidth
      bar.dataset.fadeLeft = bar.scrollLeft > 4 ? 'true' : 'false'
      bar.dataset.fadeRight = max > 4 && bar.scrollLeft < max - 4 ? 'true' : 'false'
    }
    const cleanups = bars.map(bar => {
      const on = () => update(bar)
      on()
      bar.addEventListener('scroll', on, { passive: true })
      window.addEventListener('resize', on)
      const timer = setTimeout(on, 400) // after the smooth scroll to the open tab
      return () => { bar.removeEventListener('scroll', on); window.removeEventListener('resize', on); clearTimeout(timer) }
    })
    return () => cleanups.forEach(fn => fn())
  }, [activeGroup.id, tab])

  // Block anyone who isn't an admin
  if (!isAdmin) {
    return (
      <div className="empty-state">
        <h3>Administrator access required</h3>
        <p>This area is restricted to accounts with the ADMIN role.</p>
      </div>
    )
  }

  // Closing the account editor with unsaved changes asks Save / Discard / Cancel
  const { requestClose: requestCloseUser, dialog: userDialog } = useUnsavedGuard({
    dirty: !!editing && !editing.adminConfirm && JSON.stringify(editing.form) !== editing.baseline,
    onSave: () => save(),
    onDiscard: closeUserEditor,
  })

  return (
    <div className="admin">

      {/* Title, who is signed in and a refresh button */}
      <div className="admin__header">
        <div>
          <h1 className="admin__title">Admin Console</h1>
          <p className="admin__subtitle">
            Signed in as {currentUser?.name || currentUser?.email} · advocate-account management
          </p>
        </div>
        <div className="admin__header-actions">
          <button type="button" className="btn-outline btn-outline--sm admin__refresh"
            onClick={refreshAll} disabled={refreshBusy} aria-busy={refreshBusy}>
            {/* Both labels share one grid cell, so the button keeps the width of the longer one and its edge never moves */}
            <span className="admin__refresh-label">
              <span className={refreshBusy ? 'is-hidden' : ''} aria-hidden={refreshBusy}>Refresh</span>
              <span className={refreshBusy ? '' : 'is-hidden'} aria-hidden={!refreshBusy}>Refreshing…</span>
            </span>
          </button>
        </div>
      </div>

      {/* Main tabs, one per group. Clicking one opens its first sub tab */}
      <div className="admin__tabs" ref={tabBarRef}>
        {TAB_GROUPS.map(g => (
          <button type="button"
            key={g.id}
            className={`admin__tab${activeGroup.id === g.id ? ' admin__tab--active' : ''}`}
            onClick={() => { setTab(g.tabs[0].id); setSearch('') }}
          >
            <span className="admin__tab-icon"><Icon name={g.icon} /></span>
            {g.label}
          </button>
        ))}
      </div>

      {/* Sub tabs, only for groups with more than one */}
      {activeGroup.tabs.length > 1 && (
        <div className="admin__subtabs" ref={subTabBarRef}>
          {activeGroup.tabs.map(t => (
            <button type="button"
              key={t.id}
              className={`admin__subtab${tab === t.id ? ' admin__subtab--active' : ''}`}
              onClick={() => { setTab(t.id); setSearch('') }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Overview tab */}
      {tab === 'overview' && <Overview stats={stats} plans={planList} newMessages={newMessages} loading={loading}
        onOpenTab={id => { setTab(id); setSearch('') }} />}

      {/* Accounts tab */}
      {tab === 'users' && (
        <>
          {/* Search, account type filter, new advocate button and record count */}
          <div className="admin__toolbar">

            <SearchInput placeholder="Search…" value={search} onChange={setSearch} />

            <Dropdown
              className="form-input"
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              aria-label="Filter by account type"
            >
              {ROLE_FILTERS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Dropdown>

            <button type="button" className="btn-gold" onClick={() => startEdit(null)}>
              + New advocate
            </button>

            <span className="admin__count">
              {loading ? 'Loading…' : `${visible.length} record${visible.length === 1 ? '' : 's'}`}
            </span>
          </div>

          {/* Accounts table */}
          <div className="admin__table-wrap">
            <table className="admin__table">
              <thead>
                <tr>
                  <th>Name</th><th>Email</th><th>Bar no.</th><th>Works with</th>
                  <th>Role</th><th>Plan</th><th>Status</th><th className="admin__open-col" aria-label="Open"></th>
                </tr>
              </thead>

              <tbody>
                {/* Empty row when there are no records */}
                {visible.length === 0 && !loading && (
                  <tr>
                    <td colSpan={8} className="admin__empty">No records</td>
                  </tr>
                )}

                {visibleAccounts.map(r => {
                  const isSelf = r.id === currentUser?.id

                  // Clicking (or pressing Enter on) a row opens the profile. Admins open their own account from Profile
                  const openProfile = () => (isSelf ? setActiveNav('profile') : startEdit(r))

                  return (
                    <tr
                      key={r.id}
                      className="admin__row--open"
                      tabIndex={0}
                      role="button"
                      title={isSelf ? 'Open your profile' : `Open ${r.name}'s profile`}
                      onClick={openProfile}
                      onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) openProfile() }}
                    >
                      <td>
                        {r.name}
                        {/* Associate count under an advocate's name */}
                        {r.role === 'ADVOCATE' && associateCounts.get(r.id) > 0 && (
                          <div className="u-faint-xs">
                            {associateCounts.get(r.id)} associate{associateCounts.get(r.id) === 1 ? '' : 's'}
                          </div>
                        )}
                      </td>
                      <td>{r.email}</td>
                      <td>{r.barNo || '—'}</td>
                      <td>{r.role === 'ASSOCIATE' ? (r.advocateName || '—') : '—'}</td>
                      <td>
                        <span className={`admin__pill${r.role === 'ADMIN' ? ' admin__pill--gold' : ''}`}>
                          {roleLabel(r.role)}
                        </span>
                      </td>
                      <td>
                        {/* Advocate's plan with associate seats used out of the plan limit, shown in red when over */}
                        {r.role === 'ADVOCATE' ? (() => {
                          const plan = planList.find(pl => pl.code === (r.planCode || 'FREE'))
                          const used = associateCounts.get(r.id) || 0
                          // A limit an admin set for this advocate wins over the plan's limit
                          const custom = r.associateLimit != null
                          const limit = custom ? r.associateLimit : (plan ? plan.associateLimit : null)
                          const over = limit != null && limit >= 0 && used > limit
                          return (
                            <>
                              {plan ? plan.name : (r.planCode || 'Free')}
                              {limit != null && (
                                <div className={`u-faint-xs${over ? ' u-faint-xs--over' : ''}`}
                                     title={over ? 'More associates than the limit allows' : custom ? 'Associates used (limit set by an admin)' : 'Associates used'}>
                                  {used}/{limit < 0 ? '∞' : limit} associates{custom ? ' (custom)' : ''}
                                </div>
                              )}
                            </>
                          )
                        })() : '—'}
                      </td>
                      <td>{r.active === false ? (r.selfDeactivated ? 'Deactivated by user' : 'Disabled') : 'Active'}</td>
                      {/* Arrow showing that the row opens the profile */}
                      <td className="admin__open-col" aria-hidden="true"><span className="admin__open-icon"><Icon name="arrow-right" /></span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <SeeMore remaining={accountsRemaining} onClick={showMoreAccounts} step={showMoreAccountsStep} />
        </>
      )}

      {/* Court calendar tab */}
      {tab === 'calendar' && (
        <>
          {/* Add year button and count */}
          <div className="admin__toolbar">
            <button type="button" className="btn-gold" onClick={() => startCalendarEdit(null)}>
              + Add year
            </button>
            <span className="admin__count">
              {calendarLoading ? 'Loading…' : `${calendars.length} year${calendars.length === 1 ? '' : 's'}`}
            </span>
          </div>

          {/* Calendars table */}
          <div className="admin__table-wrap">
            <table className="admin__table">
              <thead>
                <tr><th>Year</th><th>File</th><th>Size</th><th>Uploaded</th><th /></tr>
              </thead>
              <tbody>
                {calendars.length === 0 && !calendarLoading && (
                  <tr><td colSpan={5} className="admin__empty">No calendars uploaded yet</td></tr>
                )}
                {[...calendars].sort((x, y) => y.year - x.year).map(c => (
                  <tr key={c.id}>
                    <td>
                      <button type="button" className="qa-link qa-link--reset"
                        title={`View the ${c.year} calendar`} onClick={() => viewCalendar(c.year)}>
                        {c.year}
                      </button>
                    </td>
                    <td>{c.fileName || '—'}</td>
                    <td>{formatBytes(c.sizeBytes)}</td>
                    <td>{c.uploadedAt ? formatDisplayDate(c.uploadedAt.slice(0, 10)) : '—'}</td>
                    <td className="admin__actions">
                      <button type="button" className="btn-outline btn-outline--sm" disabled={calendarOpening === c.year} onClick={() => viewCalendar(c.year)}>
                        {calendarOpening === c.year ? 'Opening…' : 'View'}
                      </button>
                      <button type="button" className="btn-outline btn-outline--sm" onClick={() => startCalendarEdit(c)}>
                        Edit
                      </button>
                      <button type="button"
                        className="btn-outline btn-outline--sm btn-outline--danger"
                        onClick={() => removeCalendar(c.year)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Legal forms tab */}
      {tab === 'forms' && (
        <>
          {/* New form button and count */}
          <div className="admin__toolbar">
            <button type="button" className="btn-gold" onClick={() => startFormEdit(null)}>
              + New form
            </button>
            <span className="admin__count">
              {formsLoading ? 'Loading…' : `${forms.length} form${forms.length === 1 ? '' : 's'}`}
            </span>
          </div>

          {/* Forms table with move up and down buttons, fillable or plain PDF type, and mark fields, edit and delete actions */}
          <div className="admin__table-wrap">
            <table className="admin__table">
              <thead>
                <tr><th style={{ width: 120 }}>Order</th><th>Name</th><th>Type</th><th>File</th><th /></tr>
              </thead>
              <tbody>
                {forms.length === 0 && !formsLoading && (
                  <tr><td colSpan={5} className="admin__empty">No legal forms uploaded yet</td></tr>
                )}
                {formDrag.ordered(forms, f => f.id).map((f, idx) => (
                  <tr key={f.id} ref={formDrag.rowRef(f.id)} style={formDrag.rowStyle(f.id)}>
                    <td className="u-nowrap">
                      <span {...formDrag.gripProps(f.id)}
                            style={{ ...formDrag.gripProps(f.id).style, display: 'inline-block', padding: '2px 8px 2px 0', fontSize: 18, lineHeight: 1 }}>⠿</span>
                      <button type="button" className="btn-outline btn-outline--sm" title="Move up"
                              disabled={idx === 0} onClick={() => moveForm(f.id, -1)}>▲</button>
                      <button type="button" className="btn-outline btn-outline--sm u-ml-4" title="Move down" 
                              disabled={idx === forms.length - 1} onClick={() => moveForm(f.id, +1)}>▼</button>
                    </td>
                    <td>{f.name}</td>
                    <td>
                      {f.fillable ? (
                        <>
                          <span className="admin__pill admin__pill--gold">Fillable</span>
                          <span className="admin__hint u-ml-8">
                            {f.fieldCount} field{f.fieldCount === 1 ? '' : 's'}
                            {(() => {
                              const auto = detectedFormFields(f).filter(x => x.autoFill).length
                              return auto ? ` · ${auto} auto-fill` : ''
                            })()}
                          </span>
                        </>
                      ) : (
                        <span className="admin__pill">Plain PDF</span>
                      )}
                    </td>
                    <td>{f.fileName || '—'}</td>
                    <td className="admin__actions">
                      {f.fillable && (
                        <button type="button" className="btn-outline btn-outline--sm" onClick={() => setMarkingForm(f)}>
                          Mark fields
                        </button>
                      )}
                      <button type="button" className="btn-outline btn-outline--sm" onClick={() => startFormEdit(f)}>
                        Edit
                      </button>
                      <button type="button"
                        className="btn-outline btn-outline--sm btn-outline--danger"
                        onClick={() => removeForm(f.id, f.name)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Notifications tab */}
      {tab === 'notifications' && (
        <>
          {/* Push notification button and count */}
          <div className="admin__toolbar">
            <button type="button" className="btn-gold" onClick={startPushNotification}>
              + Push notification
            </button>
            <span className="admin__count">
              {notifsLoading ? 'Loading…' : `${notifs.length} sent`}
            </span>
          </div>

          <NotificationArchive
            items={notifs}
            loading={notifsLoading}
            onEdit={startEditNotification}
            onRemove={removeNotification}
          />
        </>
      )}

      {/* Holidays tab */}
      {tab === 'holidays' && (
        <>
          {/* Add holiday button and count */}
          <div className="admin__toolbar">
            <button type="button" className="btn-gold" onClick={() => startHolidayEdit(null)}>
              + Add holiday
            </button>
            <span className="admin__count">
              {holidaysLoading ? 'Loading…' : `${holidays.length} holiday${holidays.length === 1 ? '' : 's'}`}
            </span>
          </div>

          {/* Explains how holidays show on the Dashboard calendar */}
          <p className="admin__hint u-mb-12">
            Holidays added here appear on every advocate's hearing calendar on the Dashboard —
            green for a District Court holiday, red for a High Court holiday, and both colours
            when both courts are closed.
          </p>

          {/* Holidays grouped year -> month, each with a colour swatch for the court */}
          {holidays.length === 0 ? (
            <div className="admin__table-wrap">
              <p className="admin__empty">{holidaysLoading ? 'Loading…' : 'No holidays added yet'}</p>
            </div>
          ) : (
            <ArchiveTree
  stateKey="holidays"
              items={holidays}
              getDate={holidayDate}
              renderItems={monthItems => (
                <SeeMoreList items={monthItems} step={25}>
                {shown => (
                <div className="admin__table-wrap">
                  <table className="admin__table">
                    <thead>
                      <tr><th>Date</th><th>Label</th><th>Court</th><th>Description</th><th /></tr>
                    </thead>
                    <tbody>
                      {shown.map(h => (
                        <tr key={h.id}>
                          <td>{formatDisplayDate(h.date)}</td>
                          <td>{h.label}</td>
                          <td>
                            <span className={`holiday-swatch holiday-swatch--${holidayCourtClass(h)}`} />
                            {holidayCourtLabel(h)}
                          </td>
                          <td>{h.description || '—'}</td>
                          <td className="admin__actions">
                            <button type="button" className="btn-outline btn-outline--sm" onClick={() => startHolidayEdit(h)}>
                              Edit
                            </button>
                            <button type="button"
                              className="btn-outline btn-outline--sm btn-outline--danger"
                              onClick={() => removeHoliday(h.id, h.label)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}
                </SeeMoreList>
              )}
            />
          )}
        </>
      )}

      {/* Quick Access, court update and plan tabs are separate admin components */}
      {tab === 'courts' && <CourtsAdmin key={refreshKey} />}

      {tab === 'judges' && <JudgesAdmin key={refreshKey} />}

      {tab === 'leave' && <JudgeLeaveAdmin key={refreshKey} />}

      {tab === 'bail' && <BailRosterAdmin key={refreshKey} />}

      {tab === 'duty' && <DutyMagistrateAdmin key={refreshKey} />}

      {/* Successor courts tab: court history by court, district and building; periods are added, edited and deleted here, the current one too (the judge follows it) */}
      {tab === 'successor' && <SuccessorCourts key={refreshKey} admin />}

      {tab === 'police' && <PoliceAdmin key={refreshKey} />}

      {tab === 'consumer' && <ConsumerJurisdictionAdmin key={refreshKey} />}

      {tab === 'drt' && <DrtJurisdictionAdmin key={refreshKey} />}

      {tab === 'plans' && <PlansAdmin key={refreshKey} />}

      {/* Fee calculator tab: filings, fee scales and notes used by the Court Fee Calculator */}
      {tab === 'feecalc' && <FeeCalculatorAdmin key={refreshKey} />}

      {/* Dropdown choices */}
      {tab === 'options' && <OptionsAdmin key={refreshKey} />}

      {tab === 'contact' && <ContactMessagesAdmin key={refreshKey} onLoaded={list => { writeContactSeen(currentUser?.id, list); setNewMessages(0) }} />}

      {/* Sign-in history */}
      {tab === 'loginlog' && <LoginLogAdmin key={refreshKey} />}

      {/* Login activity of one account, opened from its profile */}
      {logUser && <UserLoginLogsModal user={logUser} onClose={() => setLogUser(null)} />}
      {userDialog}

      {/* Password popup for permanent actions such as deleting an account */}
      {passwordPrompt && (
        <AdminPasswordModal {...passwordPrompt} onClose={() => setPasswordPrompt(null)} />
      )}

      {/* Account editor popup */}
      {editing && (
        <ModalPortal>
          <div className="overlay" {...userOverlay}>
            <div className="modal modal--md" onClick={e => e.stopPropagation()}>

              <h3 className="section-title">
                {editing.isNew ? 'New advocate' : editing.role === 'ASSOCIATE' ? 'Edit associate' : 'Edit record'}
              </h3>

              {/* Note that an associate's advocate and role can't be changed */}
              {editing.role === 'ASSOCIATE' && (
                <p className="admin__hint u-mb-12">
                  Works with {editing.advocateName || 'an advocate'}. An associate's advocate and
                  role are fixed — remove the account to unlink it.
                </p>
              )}

              {/* One input per field: specialization dropdown with an 'Other' text box, selects, password or plain input */}
              <div className="admin__form">
                {editFields.map(f => (
                  <div className="form-group" key={f.key}>
                    <label className="form-label">{f.label}</label>

                    {f.key === 'specialization' ? (
                      <SpecializationSelect
                        inputClassName="form-input admin__follow-input"
                        value={editing.form.specialization ?? ''}
                        onChange={value => updateUserField('specialization', value)}
                      />
                    ) : f.type === 'select' ? (
                      <Dropdown
                        className="form-input"
                        value={editing.form[f.key] ?? ''}
                        onChange={e => updateUserField(f.key, e.target.value)}
                      >
                        <option value="">—</option>
                        {/* Plan options come from the plans table (Admin -> Pricing Plans). Each plan is offered by its "Shown to" setting (Advocates, Business or Both); an account already on a plan keeps showing it so saving never clears it */}
                        {(f.key === 'planCode'
                          ? planOptions(editing.form.planCode, editing.form.role || editing.role)
                          : f.options.map(o => ({ value: o, label: o }))
                        ).map(({ value, label }) => (
                          <option key={value} value={value}>
                            {f.key === 'active'
                              ? (value === 'true' ? 'Active' : 'Disabled')
                              : f.key === 'role' ? roleLabel(value)
                              : label}
                          </option>
                        ))}
                      </Dropdown>
                    ) : f.type === 'password' ? (
                      <PasswordInput
                        className={`form-input${userFormErrors[f.key] ? ' form-input--error' : ''}`}
                        autoComplete="new-password"
                        value={editing.form[f.key] ?? ''}
                        onChange={e => updateUserField(f.key, e.target.value)}
                        onBlur={e => updateUserField(f.key, e.target.value)}
                      />
                    ) : (
                      <input
                        className={`form-input${userFormErrors[f.key] ? ' form-input--error' : ''}`}
                        type={f.type || 'text'}
                        value={editing.form[f.key] ?? ''}
                        onChange={e => updateUserField(f.key, f.type === 'email' ? e.target.value.toLowerCase() : e.target.value)}
                        onBlur={e => updateUserField(f.key, f.type === 'email' ? e.target.value.toLowerCase() : e.target.value)}
                        {...(f.key === 'phone' ? { inputMode: 'tel', maxLength: 16 } : {})}
                        {...(f.key === 'associateLimit' ? {
                          min: -1, max: 1000, step: 1, inputMode: 'numeric',
                          placeholder: (() => {
                            const planLimit = planList.find(pl => pl.code === (editing.form.planCode || 'FREE'))?.associateLimit
                            return planLimit == null ? "Plan's limit" : `Plan's limit: ${planLimit < 0 ? 'unlimited' : planLimit}`
                          })(),
                        } : {})}
                      />
                    )}

                    {/* Validation error, or the hint text when there is no error */}
                    {userFormErrors[f.key]
                      ? <p className="admin__hint admin__hint--error">{userFormErrors[f.key]}</p>
                      : (f.hint && <p className="admin__hint">{f.hint}</p>)}
                  </div>
                ))}
              </div>

              {/* Associates of this advocate, each with a Remove button */}
              {editedRow && editedRow.role === 'ADVOCATE' && (
                <div className="admin__related">
                  <h4 className="admin__related-title">Associates ({editedAssociates.length})</h4>
                  {editedAssociates.length === 0 ? (
                    <p className="admin__hint">No associates are linked to this advocate.</p>
                  ) : (
                    <ul className="admin__related-list">
                      {editedAssociates.map(a => (
                        <li key={a.id} className="admin__related-row">
                          <div className="admin__related-info">
                            <p className="admin__related-name">{a.name}</p>
                            <p className="admin__hint">
                              {a.email}{a.active === false ? ' · Disabled' : ''}
                            </p>
                          </div>
                          <button type="button"
                            className="btn-outline btn-outline--sm btn-outline--danger"
                            onClick={() => remove(a)}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* The advocate this associate works for */}
              {editedRow && editedRow.role === 'ASSOCIATE' && (
                <div className="admin__related">
                  <h4 className="admin__related-title">Advocate</h4>
                  <div className="admin__related-row">
                    <div className="admin__related-info">
                      <p className="admin__related-name">{editedRow.advocateName || '—'}</p>
                      <p className="admin__hint">
                        {[editedAdvocate?.email, editedRow.advocateBarNo && `Bar no. ${editedRow.advocateBarNo}`]
                          .filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <button type="button"
                      className="btn-outline btn-outline--sm btn-outline--danger"
                      onClick={() => remove(editedRow)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}

              {/* Opens a popup with this account's login activity only */}
              {editedRow && (
                <div className="admin__related">
                  <h4 className="admin__related-title">Login activity</h4>
                  <p className="admin__hint">See when {editedRow.name} signed in, failed to sign in or signed out.</p>
                  <button type="button"
                    className="btn-outline btn-outline--sm"
                    onClick={() => setLogUser(editedRow)}
                  >
                    <Icon name="shield" /> Login log
                  </button>
                </div>
              )}

              {/* Account actions in three groups: deactivate with delete, reset password on its own, make admin on its own */}
              {editedRow && (
                <div className="admin__related">
                  <h4 className="admin__related-title">Account</h4>
                  <div className="admin__account-actions">
                    <div className="admin__account-group">
                      <button type="button"
                        className="btn-outline btn-outline--sm u-nowrap"
                      
                        onClick={() => toggleActive(editedRow)}
                      >
                        {editedRow.active === false ? 'Activate account' : 'Deactivate account'}
                      </button>
                      <button type="button"
                        className="btn-outline btn-outline--sm btn-outline--danger u-nowrap"
                      
                        onClick={() => remove(editedRow)}
                      >
                        {editedRow.role === 'ASSOCIATE' ? 'Remove account' : 'Delete account'}
                      </button>
                    </div>

                    <div className="admin__account-group admin__account-group--single">
                      <button
                        className="btn-outline btn-outline--sm admin__account-actions-reset"
                        disabled={resettingId === editedRow.id}
                        title={`Email a temporary password to ${editedRow.email}`}
                        onClick={() => resetPassword(editedRow)}
                      >
                        {resettingId === editedRow.id ? 'Sending…' : <><Icon name="key" /> Reset password</>}
                      </button>
                    </div>

                    {editedRow.role === 'ADVOCATE' && (
                      <div className="admin__account-group admin__account-group--single">
                        <button type="button"
                          className="btn-outline btn-outline--sm btn-outline--danger u-nowrap"
                          title="Give this advocate administrator access (asks for your password)"
                          onClick={() => setEditing(s => ({
                            ...s,
                            form: { ...s.form, role: 'ADMIN' },
                            adminConfirm: { password: '', error: '', busy: false },
                          }))}
                        >
                          Make admin
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Password step: shown when Save would make this advocate an administrator */}
              {editing.adminConfirm && (
                <div className="admin__related admin__confirm" role="alertdialog" aria-label="Confirm administrator access">
                  <h4 className="admin__related-title">Make {editedRow?.name || 'this advocate'} an administrator?</h4>
                  <p className="admin__hint">
                    They get full access to this console and stop being an advocate: their advocate code is removed
                    and their plan no longer applies. Enter your own password to confirm.
                  </p>
                  <PasswordInput
                    className="form-input"
                    autoComplete="current-password"
                    placeholder="Your admin password"
                    value={editing.adminConfirm.password}
                    onChange={e => setAdminConfirm({ password: e.target.value, error: '' })}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitAdminConfirm() } }}
                    autoFocus
                  />
                  {editing.adminConfirm.error && (
                    <p className="account-modal__error" role="alert">{editing.adminConfirm.error}</p>
                  )}
                  <div className="form-actions">
                    <button type="button"
                      className="btn-outline"
                      disabled={editing.adminConfirm.busy}
                      onClick={() => setEditing(s => ({ ...s, form: { ...s.form, role: s.role || s.form.role }, adminConfirm: null }))}
                    >
                      Back
                    </button>
                    <button type="button"
                      className="btn-danger"
                      disabled={editing.adminConfirm.busy || !editing.adminConfirm.password}
                      onClick={submitAdminConfirm}
                    >
                      {editing.adminConfirm.busy ? 'Please wait…' : 'Confirm and make administrator'}
                    </button>
                  </div>
                </div>
              )}

              {/* Cancel and save */}
              {!editing.adminConfirm && (
                <div className="form-actions">
                  <button type="button" className="btn-outline" onClick={requestCloseUser}>Cancel</button>
                  <button type="button" className="btn-gold" onClick={() => save()}>Save</button>
                </div>
              )}
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Court calendar PDF viewer */}
      <PdfViewerModal viewer={calendarViewer.viewer} onClose={calendarViewer.close} />

      {/* Court calendar popup: year and PDF upload */}
      {calendarEditing && (
        <ModalPortal>
          <div className="overlay" {...calendarOverlay}>
            <div className="modal modal--md" onClick={e => e.stopPropagation()}>
              <h3 className="section-title">
                {calendarEditing.isNew ? 'Add court calendar' : `Replace ${calendarEditing.year} calendar`}
              </h3>

              <div className="admin__form admin__form--single">
                <div className="form-group">
                  <label className="form-label">Year</label>
                  <input
                    className="form-input"
                    type="number"
                    disabled={!calendarEditing.isNew}
                    value={calendarEditing.year}
                    onChange={e => setCalendarEditing(s => ({ ...s, year: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">PDF file</label>
                  <input
                    className="form-input"
                    type="file"
                    accept="application/pdf"
                    onChange={e => setCalendarEditing(s => ({ ...s, file: e.target.files?.[0] || null }))}
                  />
                  <p className="admin__hint">
                    {calendarEditing.isNew
                      ? 'Uploading a PDF for a year that already exists will replace it.'
                      : 'Choose a new PDF to replace the one currently stored for this year.'}
                  </p>
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-outline" onClick={() => setCalendarEditing(null)}>Cancel</button>
                <button type="button" className="btn-gold" onClick={saveCalendar}>Save</button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Editor for marking the fillable fields on a legal form PDF */}
      {markingForm && (
        <PdfFieldEditor
          form={markingForm}
          addToast={addToast}
          onClose={() => setMarkingForm(null)}
          onSaved={() => { setMarkingForm(null); loadForms() }}
        />
      )}

      {/* Legal form popup: name, description and form type */}
      {formEditing && (
        <ModalPortal>
          <div className="overlay" {...formOverlay}>
            <div className="modal modal--md" onClick={e => e.stopPropagation()}>
              <h3 className="section-title">
                {formEditing.isNew ? 'New legal form' : 'Edit legal form'}
              </h3>

              <div className="admin__form">
                <div className="form-group">
                  <label className="form-label">Name</label>
                  <input
                    className="form-input"
                    value={formEditing.form.name}
                    onChange={e => setFormEditing(s => ({ ...s, form: { ...s.form, name: e.target.value } }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-input"
                    rows={2}
                    value={formEditing.form.description}
                    onChange={e => setFormEditing(s => ({ ...s, form: { ...s.form, description: e.target.value } }))}
                  />
                </div>

                <div className="form-group admin__form-group--full">
                  <label className="form-label">Form type</label>
                  <label className="u-row-8">
                    <input
                      type="checkbox"
                      checked={!!formEditing.form.fillable}
                      onChange={e => setFormEditing(s => ({ ...s, form: { ...s.form, fillable: e.target.checked } }))}
                    />
                    Fillable form
                  </label>
                  <p className="admin__hint">
                    Ticked: the blanks (____ / ….) and empty table cells in the PDF are detected automatically
                    and turned into clickable fields. Advocates then get <strong>Auto-fill from case</strong> on this form; case details are matched
                    to fields from their labels (FIR no., case no., section, police station).
                    A PDF that already has form fields keeps them. Unticked: plain PDF (open / download / print only).
                  </p>
                </div>

                {/* Table of the fields detected on the saved PDF and what each auto-fills from */}
                {formEditing.form.fillable && !formEditing.isNew && !formEditing.file
                  && formEditing.origFillable && (
                  <div className="form-group admin__form-group--full">
                    <label className="form-label">
                      Detected fields ({formEditing.detected.length})
                    </label>
                    {formEditing.detected.length === 0 ? (
                      <p className="admin__hint">No field details stored for this form.</p>
                    ) : (
                      <div className="u-scroll-140">
                        <table className="admin__table">
                          <thead><tr><th>Field</th><th>Auto-fills from</th></tr></thead>
                          <tbody>
                            {formEditing.detected.map(d => (
                              <tr key={d.name}>
                                <td>{d.label || d.name}</td>
                                <td>{d.autoFill || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Button to mark fields by hand on the PDF */}
                {!formEditing.isNew && formEditing.form.fillable && (
                  <div className="form-group admin__form-group--full">
                    <label className="form-label">Fields</label>
                    <button
                      type="button"
                      className="btn-gold"
                      onClick={() => {
                        const row = forms.find(x => x.id === formEditing.id)
                        setFormEditing(null)
                        if (row) setMarkingForm(row)
                      }}
                    >
                      <Icon name="sign" /> Mark fields manually
                    </button>
                    <p className="admin__hint">
                      Draw a box for every fillable place on the PDF and set its label, alignment, font size and auto-fill source.
                    </p>
                  </div>
                )}

                {/* PDF upload. Leave it empty on edit to keep the existing file */}
                <div className="form-group admin__form-group--full">
                  <label className="form-label">PDF file</label>
                  <input
                    className="form-input"
                    type="file"
                    accept="application/pdf"
                    onChange={e => setFormEditing(s => ({ ...s, file: e.target.files?.[0] || null }))}
                  />
                  {!formEditing.isNew && (
                    <p className="admin__hint">
                      Leave blank to keep the existing PDF. Uploading a new one re-detects the fields.
                    </p>
                  )}
                  {formEditing.form.fillable && (
                    <p className="admin__hint">
                      If no blanks or table cells are found the upload is rejected — upload it as a plain form instead.
                    </p>
                  )}
                </div>
              </div>

              {/* Fillable forms can also save and go straight to marking fields */}
              <div className="form-actions">
                <button type="button" className="btn-outline" onClick={() => setFormEditing(null)}>Cancel</button>
                {formEditing.form.fillable ? (
                  <>
                    <button type="button" className="btn-outline" onClick={() => saveForm(false)}>Save</button>
                    <button type="button" className="btn-gold" onClick={() => saveForm(true)}>Save &amp; mark fields <Icon name="sign" /></button>
                  </>
                ) : (
                  <button type="button" className="btn-gold" onClick={() => saveForm(false)}>Save</button>
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Notification popup: source, date, title, message, optional PDF and the important flag */}
      {notifForm && (
        <ModalPortal>
          <div className="overlay" {...notifOverlay}>
            <div className="modal modal--md" onClick={e => e.stopPropagation()}>
              <h3 className="section-title">{notifForm.id ? 'Edit notification' : 'Push notification'}</h3>

              <div className="admin__form">
                <div className="form-group">
                  <label className="form-label">Source</label>
                  <Dropdown
                    className="form-input"
                    value={notifForm.source}
                    onChange={e => setNotifForm(s => ({ ...s, source: e.target.value }))}
                  >
                    {NOTIFICATION_SOURCES.filter(s => s !== 'All').map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Dropdown>
                </div>

                <div className="form-group">
                  <label className="form-label">Date</label>
                  <ClearableDateInput
                    className="form-input"
                    
                    value={notifForm.date}
                    onChange={e => setNotifForm(s => ({ ...s, date: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Title</label>
                  <input
                    className="form-input"
                    value={notifForm.title}
                    onChange={e => setNotifForm(s => ({ ...s, title: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Message (optional)</label>
                  <textarea
                    className="form-input"
                    rows={2}
                    value={notifForm.message}
                    onChange={e => setNotifForm(s => ({ ...s, message: e.target.value }))}
                  />
                </div>

                {/* Attach or replace the PDF, or remove the current one */}
                <div className="form-group">
                  <label className="form-label">
                    {notifForm.hasExistingPdf ? 'Replace attached PDF (optional)' : 'Attach PDF (optional)'}
                  </label>
                  <input
                    className="form-input"
                    type="file"
                    accept="application/pdf"
                    onChange={e => setNotifForm(s => ({ ...s, file: e.target.files?.[0] || null, removeFile: false }))}
                  />
                  {notifForm.hasExistingPdf && !notifForm.file && (
                    <label className="checkbox-label u-mt-8">
                      <input
                        type="checkbox"
                        checked={notifForm.removeFile}
                        onChange={e => setNotifForm(s => ({ ...s, removeFile: e.target.checked }))}
                      />
                      Remove the currently attached PDF
                    </label>
                  )}
                </div>

                {/* Important notifications pop up full screen for every user until closed */}
                <div className="form-group admin__form-group--full">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={notifForm.important}
                      onChange={e => setNotifForm(s => ({ ...s, important: e.target.checked }))}
                    />
                    <strong>Important</strong> — pop up full screen for every user
                  </label>
                  <p className="admin__hint">
                    Each user sees it on their screen until they close it, and never again after that.
                  </p>
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-outline" onClick={() => setNotifForm(null)}>Cancel</button>
                <button type="button" className="btn-gold" onClick={pushNotification}>
                  {notifForm.id ? 'Save changes' : 'Push'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Holiday popup: date, label, which court is closed and description */}
      {holidayEditing && (
        <ModalPortal>
          <div className="overlay" {...holidayOverlay}>
            <div className="modal modal--md" onClick={e => e.stopPropagation()}>
              <h3 className="section-title">
                {holidayEditing.isNew ? 'Add holiday' : 'Edit holiday'}
              </h3>

              <div className="admin__form admin__form--single">
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <ClearableDateInput
                    className="form-input"
                    
                    value={holidayEditing.form.date}
                    onChange={e => setHolidayEditing(s => ({ ...s, form: { ...s.form, date: e.target.value } }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Label</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Diwali, Court Winter Vacation"
                    value={holidayEditing.form.label}
                    onChange={e => setHolidayEditing(s => ({ ...s, form: { ...s.form, label: e.target.value } }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Court closed</label>
                  <Dropdown
                    className="form-input"
                    value={holidayEditing.form.courtType}
                    onChange={e => setHolidayEditing(s => ({ ...s, form: { ...s.form, courtType: e.target.value } }))}
                  >
                    {HOLIDAY_COURTS.map(c => (
                      <option key={c.value} value={c.value}>
                        {c.label}{c.value === 'DISTRICT' ? ' (green)' : c.value === 'HIGH' ? ' (red)' : ' (green + red)'}
                      </option>
                    ))}
                  </Dropdown>
                </div>

                <div className="form-group">
                  <label className="form-label">Description (optional)</label>
                  <textarea
                    className="form-input"
                    rows={2}
                    value={holidayEditing.form.description}
                    onChange={e => setHolidayEditing(s => ({ ...s, form: { ...s.form, description: e.target.value } }))}
                  />
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-outline" onClick={() => setHolidayEditing(null)}>Cancel</button>
                <button type="button" className="btn-gold" onClick={saveHoliday}>Save</button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}
