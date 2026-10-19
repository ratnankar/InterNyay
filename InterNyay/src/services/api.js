// Backend API address from the .env file. Only the dev server falls back to the local Spring Boot server;
// a production build without VITE_API_BASE_URL is refused by vite.config.js
const BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:8080/api' : '')

import { makeApiError, makeNetworkError, ApiError, MESSAGES } from '../utils/errorMessages'
import { forgetAccountByToken } from '../utils/accounts'
import { canEmbedPdf } from '../utils/pdfSupport'

// fetch that reports "server unreachable" as a friendly error instead of the browser's "Failed to fetch"
async function http(url, options) {
  try {
    return await fetch(url, options)
  } catch (e) {
    throw makeNetworkError(e)
  }
}

// Double-click protection: while a save (POST/PUT/DELETE) is still running, an identical second call
// (same method, URL and data) is dropped instead of being sent again. This matters on a slow PC or connection,
// where the user clicks Save twice before the first save finishes. The dropped call never settles on purpose:
// only the first caller runs its "after save" code (add to list, close form, toast), so nothing is done twice.
const inFlight = new Map()

// Builds a comparable text for a FormData (field values plus file name/size/date) so identical uploads match
function formKey(fd) {
  return [...fd.entries()]
    .map(([k, v]) => (typeof v === 'string' ? `${k}=${v}` : `${k}=file:${v.name}:${v.size}:${v.lastModified}`))
    .join('&')
}

// While any save is running the page gets the class "is-saving", so the gold Save buttons look busy and cannot be clicked again
function markSaving() {
  if (typeof document === 'undefined') return
  document.body.classList.toggle('is-saving', inFlight.size > 0)
}

// Runs `send()` once per identical in-flight call; later identical calls are ignored until the first one finishes
function dedupe(key, send) {
  if (inFlight.has(key)) return new Promise(() => {})
  const promise = send()
  inFlight.set(key, promise)
  markSaving()
  const release = () => { inFlight.delete(key); markSaving() }
  promise.then(release, release)
  return promise
}

// Several calls running together all get 401 when the session runs out: only the first one clears the login and reloads
let sessionEnding = false

// Operating system of this device as the browser reports it (Android, Windows, macOS, ...). A phone that asks for the
// "desktop site" sends a Linux browser string, so only this value says it is really Android. Sent with every JSON call
// so the login log can show the right system
const CLIENT_PLATFORM = (() => {
  try { return navigator.userAgentData?.platform || '' } catch { return '' }
})()

// Browser name as the browser itself reports it. Brave, Samsung Internet, Edge and others send a Chrome-like browser
// string, so only the browser brand list tells them apart
const CLIENT_BROWSER = (() => {
  try {
    const brands = (navigator.userAgentData?.brands || []).map(b => b.brand)
    const named = brands.filter(b => !/not.?a.?brand|^chromium$/i.test(b))
    // A specific brand (Brave, Edge, Opera, Samsung Internet ...) wins over the generic "Google Chrome"
    const pick = named.find(b => !/^google chrome$/i.test(b)) || named[0] || ''
    return pick.replace(/^Microsoft Edge$/i, 'Edge').replace(/^Google Chrome$/i, 'Chrome')
  } catch { return '' }
})()

// Core fetch wrapper for JSON calls: adds query params and the JWT token, and throws an Error with the backend's message on failure
async function rawRequest(method, path, { body, params } = {}) {
  const url = new URL(`${BASE_URL}${path}`)
  // Add query string params, skipping empty values
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v)
    })
  }

  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (CLIENT_PLATFORM) options.headers['X-Client-Platform'] = CLIENT_PLATFORM
  if (CLIENT_BROWSER) options.headers['X-Client-Browser'] = CLIENT_BROWSER

  // Attach the login token (if any) so the backend knows who is calling
  const token = localStorage.getItem('internyay_token')
  if (token) options.headers['Authorization'] = `Bearer ${token}`

  if (body) options.body = JSON.stringify(body)

  const res = await http(url.toString(), options)

  if (!res.ok) {
    // Token expired or invalid: clear the saved login and reload so the user lands on the login page (login attempts are excluded)
    if (res.status === 401 && token && !path.startsWith('/auth/login') && !sessionEnding) {
      sessionEnding = true
      // Only this account's session ran out: other saved accounts stay signed in
      forgetAccountByToken(token)
      localStorage.removeItem('internyay_token')
      localStorage.removeItem('internyay_user')
      // Lets the login page explain why the user was signed out
      try { sessionStorage.setItem('internyay_notice', MESSAGES.session) } catch { /* storage unavailable */ }
      window.location.reload()
    }

    const error = await res.json().catch(() => ({}))
    throw makeApiError(res.status, error.message, { signedIn: !!token && !path.startsWith('/auth/login') })
  }

  // 204 means success with no body
  if (res.status === 204) return null
  return res.json().catch(() => { throw new ApiError(MESSAGES.server, { status: res.status }) })
}

// JSON calls: reads run normally, writes are protected against double submits
function request(method, path, opts = {}) {
  if (method === 'GET') return rawRequest(method, path, opts)
  const key = `${method} ${path} ${JSON.stringify(opts.params || {})} ${JSON.stringify(opts.body ?? null)}`
  return dedupe(key, () => rawRequest(method, path, opts))
}

// Short helpers for each HTTP method
const get   = (path, opts) => request('GET',    path, opts)
// Shortcuts for the other HTTP methods
const post  = (path, opts) => request('POST',   path, opts)
const put   = (path, opts) => request('PUT',    path, opts)
const del   = (path, opts) => request('DELETE', path, opts)

// Authorization header only (no Content-Type) for file uploads and downloads, since the browser sets the multipart type itself
const authHeaders = () => {
  const token = localStorage.getItem('internyay_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// POST multipart form data (used for file uploads)
function postForm(path, formData) {
  return dedupe(`POST ${path} ${formKey(formData)}`, () => sendForm('POST', path, formData))
}

async function sendForm(method, path, formData) {
  const res = await http(`${BASE_URL}${path}`, {
    method,
    headers: authHeaders(),
    body: formData,
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw makeApiError(res.status, error.message)
  }
  return res.json()
}

// PUT multipart form data (used for editing records that carry a file)
function putForm(path, formData) {
  return dedupe(`PUT ${path} ${formKey(formData)}`, () => sendForm('PUT', path, formData))
}

// Downloads a file and returns a temporary blob URL that can be shown in an iframe or viewer
async function blobUrl(path) {
  const res = await http(`${BASE_URL}${path}`, { headers: authHeaders() })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw makeApiError(res.status, error.message)
  }
  return URL.createObjectURL(await res.blob())
}

// Downloads a file and saves it with the given file name
async function saveAs(path, fileName) {
  const res = await http(`${BASE_URL}${path}`, { headers: authHeaders() })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw makeApiError(res.status, error.message)
  }
  const blob = await res.blob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = fileName || 'document'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// The courts the signed-in user works at: chosen on the profile or right after sign-up.
// get() also returns the courts to open by default (the chosen ones, or the courts with the most cases when nothing was chosen)
export const courtPreferences = {
  get:  ()           => get('/court-preferences'),
  save: (courtIds)   => put('/court-preferences', { body: { courtIds } }),
}

// Court table: courts, districts, buildings and court numbers (single source for every court dropdown)
export const courts = {
  list:   ()     => get('/courts'),
  add:    (body) => post('/courts', { body }),
  remove: (id, scope = 'row') => del(`/courts/${id}`, { params: { scope } }),
  // Mark a court room as a Mahila court (orders are not declared there) or clear the mark
  setMahila: (id, mahilaCourt) => put(`/courts/${id}/mahila`, { body: { mahilaCourt } }),
  // Moves a court no. to another building and district of the same court
  move:   (id, body) => put(`/courts/${id}/move`, { body }),
}

// Quick Access: judges on leave
export const quickAccess = {
  getJudgesOnLeave:  (params) => get('/quick-access/judges-on-leave', { params }),
}

// Quick Access: judges list (create/update use form data because of the photo)
export const judgesList = {
  list:   (params)   => get('/quick-access/judges-list', { params }),
  search: (params)   => get('/quick-access/judges-list/search', { params }),
  courtNumbers: (params) => get('/quick-access/judges-list/court-numbers', { params }),
  courtNoLog:   (params) => get('/quick-access/judges-list/court-no-log', { params }),
  addCourtNo:    (id, body)           => post(`/quick-access/judges-list/${id}/court-numbers`, { body }),
  updateCourtNo: (id, recordId, body) => put(`/quick-access/judges-list/${id}/court-numbers/${recordId}`, { body }),
  removeCourtNo: (id, recordId)       => del(`/quick-access/judges-list/${id}/court-numbers/${recordId}`),
  // Change the judge of a listing (JSON body). The listing stays, only its judge changes and the history is kept
  changeJudge:   (id, body)           => post(`/quick-access/judges-list/${id}/change-judge`, { body }),
  create: (formData) => postForm('/quick-access/judges-list', formData),
  update: (id, formData) => putForm(`/quick-access/judges-list/${id}`, formData),
  // Removes a listing: it is switched off, its court history stays
  remove: (id)       => del(`/quick-access/judges-list/${id}`),
}

// Judges (name and photo only). A listing in judgesList is where a judge sits
export const judgeProfiles = {
  list:   ()               => get('/quick-access/judge-profiles'),
  create: (formData)       => postForm('/quick-access/judge-profiles', formData),
  update: (id, formData)   => putForm(`/quick-access/judge-profiles/${id}`, formData),
  // A judge who holds no court is removed; a judge with history is switched off and the history stays
  remove: (id)             => del(`/quick-access/judge-profiles/${id}`),
}

// Quick Access: district-wise PDFs uploaded by the admin, per section
export const districtPdfs = {
  list:    (section)           => get('/quick-access/district-pdfs', { params: { section } }),
  // Blob URL of the PDF for a section and district
  fileUrl: (section, district) =>
    blobUrl(`/quick-access/district-pdfs/file?section=${encodeURIComponent(section)}&district=${encodeURIComponent(district)}`),
  // Upload (or replace) the PDF for a section and district
  upload:  (section, district, file) => {
    const body = new FormData()
    body.append('section', section)
    body.append('district', district)
    body.append('file', file)
    return postForm('/quick-access/district-pdfs', body)
  },
  remove:  (section, district) => del('/quick-access/district-pdfs', { params: { section, district } }),
}

// Quick Access: bail roster
export const bailRoster = {
  list:   (params)   => get('/quick-access/bail-roster', { params }),
  create: (formData) => postForm('/quick-access/bail-roster', formData),
  update: (id, formData) => putForm(`/quick-access/bail-roster/${id}`, formData),
  remove: (id)       => del(`/quick-access/bail-roster/${id}`),
}

// Quick Access: duty magistrate roster
export const dutyMagistrate = {
  list:   (params)   => get('/quick-access/duty-magistrate', { params }),
  create: (formData) => postForm('/quick-access/duty-magistrate', formData),
  update: (id, formData) => putForm(`/quick-access/duty-magistrate/${id}`, formData),
  remove: (id)       => del(`/quick-access/duty-magistrate/${id}`),
}

// Cases: CRUD, documents, hearing details and file numbers
export const cases = {
  list:      (params)       => get('/cases', { params }),
  // Judge / leave / court number details for the hearings on a date
  hearingLeave: (params)    => get('/cases/hearing-leave', { params }),

  // File numbers already in use, so new cases can pick a free one
  fileNumbers: ()           => get('/cases/file-numbers'),

  // Hearing history of one case
  hearings:  (id)           => get(`/cases/${id}/hearings`),

  // Set or change the next hearing date of a case
  updateNextHearing: (id, body) => put(`/cases/${id}/next-hearing`, { body }),

  // Basic create / update / delete for cases
  create:    (body)         => post('/cases', { body }),
  update:    (id, body)     => put(`/cases/${id}`, { body }),
  remove:    (id)           => del(`/cases/${id}`),
  // Documents attached to a case
  getDocs:   (id)           => get(`/cases/${id}/documents`),
  uploadDoc: (id, formData) => postForm(`/cases/${id}/documents`, formData),
}

// Clients: CRUD and client documents
export const clients = {
  list:   (params)   => get('/clients', { params }),
  create: (body)     => post('/clients', { body }),
  update: (id, body) => put(`/clients/${id}`, { body }),
  remove: (id)       => del(`/clients/${id}`),
  uploadDoc: (id, formData) => postForm(`/clients/${id}/documents`, formData),
}

// Hearings: list, edit, delete and the order uploaded for a hearing
export const hearings = {
  list:    (params)   => get('/hearings', { params }),

  update:  (id, body) => put(`/hearings/${id}`, { body }),
  remove:  (id)       => del(`/hearings/${id}`),

  // Attach the court order (file + optional name) to a hearing
  uploadOrder: (id, file, name) => {
    const body = new FormData()
    body.append('file', file)
    if (name) body.append('name', name)
    return postForm(`/hearings/${id}/order`, body)
  },

  removeOrder: (id) => del(`/hearings/${id}/order`),

  // Order from eCourts: the first call fetches and stores it, later calls use the stored copy.
  // Answers { status: STORED | FETCHED | NOT_DECLARED | UNAVAILABLE, message, hearing }
  fetchOrder: (id) => post(`/hearings/${id}/order/ecourts`),
}

// To-do list tasks
export const tasks = {
  list:     (params)   => get('/tasks', { params }),
  create:   (body)     => post('/tasks', { body }),
  update:   (id, body) => put(`/tasks/${id}`, { body }),
  remove:   (id)       => del(`/tasks/${id}`),
}

// Office expenses (list, add, mark paid, delete)
export const officeExpenses = {
  list:     ()          => get('/office-expenses'),
  create:   (body)      => post('/office-expenses', { body }),
  setPaid:  (id, paid)  => put(`/office-expenses/${id}/paid`, { body: { paid } }),
  remove:   (id)        => del(`/office-expenses/${id}`),
}

// Documents: list, upload, download and preview
export const documents = {
  list:     (params)    => get('/documents', { params }),

  // Upload a document that belongs to the advocate (not to a case or client)
  uploadAdvocate: (formData)   => postForm('/documents/advocate', formData),

  // Save the document to the user's computer
  download: (id, fileName) => saveAs(`/documents/${id}/download`, fileName),

  // Blob URL used by the in-app document preview
  previewBlob: async (id) => {
    const res = await http(`${BASE_URL}/documents/${id}/preview`, { headers: authHeaders() })
    if (!res.ok) throw makeApiError(res.status)
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  },

  // Change the name shown for a document
  rename:   (id, name)  => put(`/documents/${id}/name`, { body: { name } }),

  remove:   (id)        => del(`/documents/${id}`),
}

// Misc. applications filed in cases: list, add (in an existing case or a new one), edit, dispose off and their documents
export const miscApplications = {
  list:    (params)   => get('/misc-applications', { params }),
  get:     (id)       => get(`/misc-applications/${id}`),
  // Applications that have a hearing on a date (yyyy-MM-dd), for the dashboard
  onDate:  (date)     => get('/misc-applications/on', { params: { date } }),
  // How many hearing dates the applications of each case have (caseId -> count)
  hearingCounts: ()   => get('/misc-applications/hearing-counts'),
  create:  (body)     => post('/misc-applications', { body }),
  update:  (id, body) => put(`/misc-applications/${id}`, { body }),
  remove:  (id)       => del(`/misc-applications/${id}`),

  // Mark as disposed off as Allowed or Disallowed (the date is optional, today is used) or take it back to pending
  dispose: (id, disposedOn, outcome) => put(`/misc-applications/${id}/dispose`, { body: { outcome, ...(disposedOn ? { disposedOn } : {}) } }),
  reopen:  (id)       => put(`/misc-applications/${id}/reopen`),

  // Edit the date of one hearing history entry, or delete it (both return the updated application)
  updateHearing: (id, hearingId, date, note) => put(`/misc-applications/${id}/hearings/${hearingId}`, { body: { date, note: note || '' } }),
  removeHearing: (id, hearingId)       => del(`/misc-applications/${id}/hearings/${hearingId}`),

  // role: APPLICATION (the application itself), ORDER (once disposed off) or ADDITIONAL
  uploadDoc: (id, file, role, name) => {
    const body = new FormData()
    body.append('file', file)
    body.append('role', role)
    if (name) body.append('name', name)
    return postForm(`/misc-applications/${id}/documents`, body)
  },
  removeDoc: (id, docId) => del(`/misc-applications/${id}/documents/${docId}`),
}

// Court / bar association notifications
export const notifications = {
  list: (params) => get('/notifications', { params }),

  // Tiny "last changed" value, checked regularly to know when to reload the list
  stamp: () => get('/notifications/stamp'),

  // Important notifications the user has not seen yet (shown as popups)
  pendingImportant: () => get('/notifications/important/pending'),

  // Mark an important notification as seen
  dismiss: (id) => post(`/notifications/${id}/dismiss`),

  // Blob URL of the notification's attached PDF
  preview: (id) =>
    http(`${BASE_URL}/notifications/${id}/download`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('internyay_token')}`,
      },
    }).then(async res => {
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw makeApiError(res.status, error.message)
      }
      const blob = await res.blob()
      return URL.createObjectURL(blob)
    }),

  // Admin: add a notification (with optional PDF)
  create: (formData) => postForm('/notifications', formData),

  // Admin: edit a notification
  update: (id, formData) =>
    http(`${BASE_URL}/notifications/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: formData,
    }).then(async res => {
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw makeApiError(res.status, error.message)
      }
      return res.json()
    }),

  remove: (id) => del(`/notifications/${id}`),
}

// WhatsApp reminders
export const whatsapp = {
  status: () => get('/whatsapp/status'),

  // Turn automatic reminders on/off for a case and set how many days before the hearing
  setCase: (caseId, enabled, daysBefore) =>
    put(`/whatsapp/cases/${caseId}/auto`, { body: { enabled, daysBefore } }),

  // Send a hearing reminder now
  sendHearingReminder: (caseId) => post(`/whatsapp/cases/${caseId}/hearing-reminder`),
  sendPaymentReminder: (caseId) => post(`/whatsapp/cases/${caseId}/payment-reminder`),
}

// Yearly court calendar PDFs
export const courtCalendar = {
  list: () => get('/court-calendar'),

  // Download the calendar PDF for a year
  get: (year) =>
    http(`${BASE_URL}/court-calendar/${year}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('internyay_token')}`,
      },
    }).then(async res => {
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw makeApiError(res.status, error.message)
      }
      return res.blob()
    }),

  // Admin: upload the calendar PDF for a year
  upload: (year, formData) =>
    http(`${BASE_URL}/court-calendar/${year}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('internyay_token')}`,
      },
      body: formData,
    }).then(async res => {
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw makeApiError(res.status, error.message)
      }
      return res.json()
    }),

  remove: (year) => del(`/court-calendar/${year}`),
}

// Court holidays (admin managed)
export const holidays = {
  list:   ()         => get('/holidays'),
  create: (body)      => post('/holidays', { body }),
  update: (id, body)  => put(`/holidays/${id}`, { body }),
  remove: (id)        => del(`/holidays/${id}`),
}

// Dates on which the advocate doesn't want hearings scheduled
export const noHearingDates = {
  list:   ()     => get('/no-hearing-dates'),
  mark:   (date) => post('/no-hearing-dates', { body: { date } }),
  unmark: (date) => del(`/no-hearing-dates/${date}`),
}

// How many hearings the advocate takes on one day: a usual limit plus a limit for particular dates.
// Every answer is { defaultLimit, overrides: { 'YYYY-MM-DD': limit } }, an empty limit means no limit / the usual limit
export const hearingLimits = {
  get:        ()            => get('/hearing-limits'),
  setDefault: (limit)       => put('/hearing-limits/default', { body: { limit } }),
  setForDate: (date, limit) => put(`/hearing-limits/${date}`, { body: { limit } }),
  resetDate:  (date)        => del(`/hearing-limits/${date}`),
}

// Login, registration, profile and account management
export const auth = {
  login:      (body) => post('/auth/login', { body }),
  // Registration step 1: send an OTP to the email
  sendOtp:    (body) => post('/auth/register/send-otp', { body }),
  // Registration step 2: verify the OTP
  verifyOtp:  (body) => post('/auth/register/verify-otp', { body }),
  register:   (body) => post('/auth/register', { body }),

  // Sign in / sign up with a Google account
  googleLogin:    (body) => post('/auth/google/login',    { body }),
  googleRegister: (body) => post('/auth/google/register', { body }),
  // Current user's profile
  me:       ()     => get('/auth/me'),
  updateProfile: (body) => put('/auth/me', { body }),
  // Account deactivation and deletion both need the password
  deactivateAccount: (password) => post('/auth/me/deactivate', { body: { password } }),
  deleteAccount:     (password) => post('/auth/me/delete',     { body: { password } }),

  // 4-digit PIN that unlocks the transactions page: check it, change it with the old PIN,
  // or create / reset it by entering the account password
  verifyTxnPin: (pin)                   => post('/auth/txn-pin/verify', { body: { pin } }),
  changeTxnPin: (currentPin, newPin)    => post('/auth/txn-pin/change', { body: { currentPin, newPin } }),
  resetTxnPin:  (password, newPin, googleIdToken) => post('/auth/txn-pin/reset',  { body: { password, newPin, googleIdToken } }),

  // Forgot password: send OTP, then reset with it
  forgotPasswordSendOtp: (body) => post('/auth/forgot-password/send-otp', { body }),
  forgotPasswordReset:   (body) => post('/auth/forgot-password/reset',    { body }),

  // Change email: send OTP to the new address, then confirm
  // Google sign-ups set their first password directly (no code)
  setPassword: (body) => post('/auth/me/set-password', { body }),

  requestEmailChange: (body) => post('/auth/me/email/send-otp', { body }),
  confirmEmailChange: (body) => post('/auth/me/email/confirm',  { body }),

  // Tells the server this account signed out so the admin login log can show it. Never throws and never triggers the
  // "session expired" reload: an expired token is simply ignored, the sign-out goes ahead either way
  logout: () => {
    const token = localStorage.getItem('internyay_token')
    if (!token) return Promise.resolve()
    return fetch(`${BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true,
    }).catch(() => {})
  },

  // Associate advocates linked to this account
  associates:      ()   => get('/auth/associates'),
  removeAssociate: (id) => del(`/auth/associates/${id}`),
}

// Legal forms: list, page images, field editor, fill, print and download
export const legalForms = {
  list: () => get('/legal-forms'),

  // Page count, size, field positions and ordering used by the form editor and fill window
  pages:      (id)                    => get(`/legal-forms/${id}/pages`),
  viewSize:   (id)                    => get(`/legal-forms/${id}/view-size`),
  fieldSpecs: (id, redetect = false)  => get(`/legal-forms/${id}/field-specs`, { params: { redetect: redetect ? 'true' : 'false' } }),
  saveFields: (id, specs)             => put(`/legal-forms/${id}/fields`, { body: specs }),
  reorder:    (ids)                   => put('/legal-forms/reorder', { body: ids }),
  // Image of one form page (blob URL)
  pageImage:  async (id, n) => {
    const res = await http(`${BASE_URL}/legal-forms/${id}/pages/${n}/image?scale=1.6`, {
      headers: authHeaders(),
    })
    if (!res.ok) {
      const error = await res.json().catch(() => ({}))
      throw makeApiError(res.status, error.message)
    }
    return URL.createObjectURL(await res.blob())
  },

  // Download the blank form PDF
  download: (id, fileName) =>
    http(`${BASE_URL}/legal-forms/${id}/download?plain=true`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('internyay_token')}`,
      },
    }).then(async res => {
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw makeApiError(res.status, error.message)
      }

      const blob = await res.blob()

      const url = URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      a.download = fileName || `legal-form-${id}.pdf`

      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      URL.revokeObjectURL(url)
    }),

  // Blob URL of the form PDF for the preview modal
  // plain=true gives the form without its editable fields; the fill window leaves it off so the fields can be typed into
  previewBlob: async (id, plain = false) => {
    const res = await http(`${BASE_URL}/legal-forms/${id}/download${plain ? '?plain=true' : ''}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('internyay_token')}`,
      },
    })
    if (!res.ok) {
      const error = await res.json().catch(() => ({}))
      throw makeApiError(res.status, error.message)
    }
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  },

  // Loads the PDF into a hidden iframe and opens the print dialog
  print: (id) =>
    http(`${BASE_URL}/legal-forms/${id}/download?plain=true`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('internyay_token')}`,
      },
    }).then(async res => {
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw makeApiError(res.status, error.message)
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)

      // Phones and tablets cannot print from a hidden frame: save the PDF so it can be printed from the PDF app
      if (!canEmbedPdf()) {
        const a = document.createElement('a')
        a.href = url
        a.download = `form-${id}.pdf`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 60000)
        return
      }

      const iframe = document.createElement('iframe')
      iframe.style.position = 'fixed'
      iframe.style.right = '0'
      iframe.style.bottom = '0'
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.style.border = '0'
      iframe.src = url

      iframe.onload = () => {
        setTimeout(() => {
          iframe.contentWindow.focus()
          iframe.contentWindow.print()
        }, 250)
      }

      document.body.appendChild(iframe)

      setTimeout(() => {
        document.body.removeChild(iframe)
        URL.revokeObjectURL(url)
      }, 60000)
    }),

  // Admin: add a new form PDF
  upload: (formData) =>
    http(`${BASE_URL}/legal-forms/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('internyay_token')}`,
      },
      body: formData,
    }).then(async res => {
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))

        throw makeApiError(res.status, error.message)
      }

      return res.json()
    }),

  // Admin: edit a form
  update: (id, formData) => putForm(`/legal-forms/${id}`, formData),

  // Sends the filled-in values and gets back the completed PDF as a blob URL
  fillBlob: async (id, values) => {
    const res = await http(`${BASE_URL}/legal-forms/${id}/fill`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('internyay_token')}`,
      },
      body: JSON.stringify(values || {}),
    })
    if (!res.ok) {
      const error = await res.json().catch(() => ({}))
      throw makeApiError(res.status, error.message)
    }
    return URL.createObjectURL(await res.blob())
  },

  remove: (id) => del(`/legal-forms/${id}`),
}

// Quick Access: police directory (districts, sub-divisions, stations)
export const police = {
  directory: () => get('/quick-access/police/directory'),

  districts: {
    create: (body)     => post('/quick-access/police/districts', { body }),
    update: (id, body) => put(`/quick-access/police/districts/${id}`, { body }),
    remove: (id)       => del(`/quick-access/police/districts/${id}`),
  },
  subDivisions: {
    create: (body)     => post('/quick-access/police/sub-divisions', { body }),
    update: (id, body) => put(`/quick-access/police/sub-divisions/${id}`, { body }),
    remove: (id)       => del(`/quick-access/police/sub-divisions/${id}`),
  },
  stations: {
    create: (body)     => post('/quick-access/police/stations', { body }),
    update: (id, body) => put(`/quick-access/police/stations/${id}`, { body }),
    remove: (id)       => del(`/quick-access/police/stations/${id}`),
  },
  updateSettings: (body) => put('/quick-access/police/settings', { body }),
}

// Quick Access: DRT and consumer commission jurisdiction directories
export const jurisdiction = {
  drt: {
    directory: () => get('/quick-access/jurisdiction/drt'),
    create:    (body)     => post('/quick-access/jurisdiction/drt/tribunals', { body }),
    update:    (id, body) => put(`/quick-access/jurisdiction/drt/tribunals/${id}`, { body }),
    remove:    (id)       => del(`/quick-access/jurisdiction/drt/tribunals/${id}`),
  },
  consumer: {
    directory: () => get('/quick-access/jurisdiction/consumer'),
    create:    (body)     => post('/quick-access/jurisdiction/consumer/commissions', { body }),
    update:    (id, body) => put(`/quick-access/jurisdiction/consumer/commissions/${id}`, { body }),
    remove:    (id)       => del(`/quick-access/jurisdiction/consumer/commissions/${id}`),
  },
}

// Admin console endpoints
export const admin = {
  stats: () => get('/admin/stats'),

  // Judges on leave, including hiding an entry and refreshing from the source
  judgesOnLeave: {
    list:      (params)       => get('/admin/judges-on-leave', { params }),
    create:    (body)         => post('/admin/judges-on-leave', { body }),
    update:    (id, body)     => put(`/admin/judges-on-leave/${id}`, { body }),
    remove:    (id)           => del(`/admin/judges-on-leave/${id}`),
    setHidden: (id, hidden)   => put(`/admin/judges-on-leave/${id}/hidden`, { body: { hidden } }),
    refresh:   ()             => post('/admin/judges-on-leave/refresh'),
  },

  // Messages sent through the Contact Us form
  contactMessages: {
    list:        (status)      => get('/admin/contact-messages', { params: { status } }),
    setStatus:   (id, status)  => put(`/admin/contact-messages/${id}/status`, { body: { status } }),
    reply:       (id, body, channel = 'BOTH') => post(`/admin/contact-messages/${id}/replies`, { body: { body, channel } }),
    remove:      (id)          => del(`/admin/contact-messages/${id}`),
  },

  // Subscription plans
  plans: {
    list:   ()         => get('/admin/plans'),
    catalog: ()        => get('/admin/plans/catalog'),
    update: (id, body) => put(`/admin/plans/${id}`, { body }),
    create: (body)     => post('/admin/plans', { body }),
    remove: (id, moveTo) => del(`/admin/plans/${id}`, { params: { moveTo } }),
    migrate: (body)    => post('/admin/plans/migrate', { body }),
  },

  // Dropdown choices (case catalogue, document types, ...)
  options: {
    list:   ()         => get('/admin/options'),
    create: (body)     => post('/admin/options', { body }),
    update: (id, body) => put(`/admin/options/${id}`, { body }),
    remove: (id)       => del(`/admin/options/${id}`),
    move:   (id, dir)  => post(`/admin/options/${id}/move`, { params: { dir } }),
    // Moves a choice straight to a place in its list (0 = first)
    moveTo: (id, position) => post(`/admin/options/${id}/move-to`, { params: { position } }),
  },

  // Court fee calculator rules (filings, fee scales, notes)
  feeCalculator: {
    get:    ()     => get('/admin/fee-calculator'),
    save:   (body) => put('/admin/fee-calculator', { body }),
    reset:  ()     => post('/admin/fee-calculator/reset'),
  },

  // Sign-in history: params are type (LOGIN, LOGIN_FAILED, LOGOUT), q, page and size
  loginLogs: {
    list: (params) => get('/admin/login-logs', { params }),
  },

  // User accounts
  users: {
    list:   ()         => get('/admin/users'),
    create: (body)     => post('/admin/users', { body }),
    update: (id, body) => put(`/admin/users/${id}`, { body }),
    resetPassword: (id) => post(`/admin/users/${id}/reset-password`),
    remove: (id, password) => del(`/admin/users/${id}`, { body: { password } }),
  },
}

// Endpoints that work without logging in (landing page plans, contact form)
export const publicApi = {
  plans:     ()     => get('/public/plans'),
  options:   ()     => get('/public/options'),
  contact:   (body) => post('/public/contact', { body }),
}

// Court fee calculator rules as saved by the admin 
export const feeCalculator = {
  config: () => get('/fee-calculator/config'),
}

// The logged-in user's plan and its features
export const plansApi = {
  mine:     () => get('/plans/my'),
  features: () => get('/plans/features'),
  select:   (code, period) => post('/plans/select', { body: { code, period } }),
}

// Contact Us for logged-in users, including admin replies
export const contact = {
  send: (body) => post('/contact', { body }),
  mine: ()     => get('/contact/mine'),
  unreadReplies: () => get('/contact/unread-replies'),
  markSeen: (id)    => post(`/contact/${id}/seen`),
}

// Chat assistant. Every chat is saved on the server: send() and addToHistory() put messages into the chat named by
// conversationId (empty starts a new chat) and the reply says which chat that is
export const chat = {
  status: ()         => get('/chat/status'),
  send:   (messages, conversationId) => post('/chat', { body: { messages, conversationId: conversationId ?? null } }),
  // The chat list (latest first), one chat with its messages, deleting one chat and deleting all of them
  conversations:      ()   => get('/chat/conversations'),
  conversation:       (id) => get(`/chat/conversations/${id}`),
  deleteConversation: (id) => del(`/chat/conversations/${id}`),
  clearAll:           ()   => del('/chat/conversations'),
  // Adds messages to a chat without asking the AI (the built-in support answer)
  addToHistory: (messages, conversationId) => post('/chat/history', { body: { messages, conversationId: conversationId ?? null } }),
}

// Everything grouped into one object so components can call api.cases.list() etc.
const api = { publicApi, contact, chat, courts, courtPreferences, quickAccess, police, jurisdiction, judgesList, judgeProfiles, districtPdfs, bailRoster, dutyMagistrate, cases, clients, hearings, tasks, documents, miscApplications, notifications, whatsapp, courtCalendar, holidays, noHearingDates, hearingLimits, auth, legalForms, admin, officeExpenses, feeCalculator }
export default api