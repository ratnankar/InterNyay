import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { isMiscOnlyHearing } from '../components/misc/miscUtils'
import { useLocation, useNavigate } from 'react-router-dom'
import { AUTH_PATHS, authTabFromPath, isAdminPath, navToPath, parseNavPath } from '../routes/paths'
import { caseCreatedDate, formatDate, hearingDateProblem } from '../utils/dateUtils'
import { indianPhoneError, emailError } from '../utils/validators'
import { passwordProblem } from '../utils/passwordPolicy'
import useWhatsApp from '../hooks/useWhatsApp'
import { isHighCourt, isJuvenileBoard, splitCaseCourt, loadCourts, resetCourts, loadCourtPreferences, resetCourtPreferences } from '../constants/courts'
import { WITHDRAWN_STATUS, WITHDRAWN_OUTCOME } from '../constants/data'
import { statusChangeQuestion } from '../utils/caseStatus'
import {
  AUTO_SUBTYPES,
  SIDE_ACCUSED,
  SIDE_COMPLAINANT,
  composeCaseTitle,
  renameInCaseTitle,
  titleOurNames,
  titleOpposingNames,
  guessOpposingParty,
  isNiAct138Complaint,
  isPoliceChallan,
  sideOfSubType,
  sideSubType,
} from '../constants/caseCatalog'
import { caseFeeSummary, cleanHearingFees, cleanStageFees } from '../utils/feeUtils'
import { hasCorporatePanelClient, caseClientNames, caseHasClient } from '../utils/caseClients'
import { toFormParty, toRequestParty, nonClientsOf } from '../utils/caseParties'
import { cnrCaseTitle, cnrOpponents, cnrOurSide, detectSide, sameName } from '../utils/cnrPrefill'
import {
  auth as authApi,
  cases as casesApi,
  clients as clientsApi,
  tasks as tasksApi,
  hearings as hearingsApi,
  documents as documentsApi,
  holidays as holidaysApi,
  noHearingDates as noHearingDatesApi,
  hearingLimits as hearingLimitsApi,
  miscApplications as miscApplicationsApi
} from '../services/api'
import { getErrorMessage } from '../utils/errorMessages'
import { onLiveRefresh } from '../utils/liveRefresh'
import { loadOptions, useOptionsVersion } from '../constants/optionsStore'
import { downloadNameOf } from '../utils/documentUtils'
import { getAccounts, rememberAccount, syncActiveAccount, forgetAccountByToken, activateAccount } from '../utils/accounts'
import { confirmDialog } from '../utils/confirmDialog'
import { clearSessionState } from '../utils/sessionStore'

// The status chip the signed-in user picked last on the Cases page (see pages/Cases.jsx). Read when the app starts, from the cached
// user, so a reload shows the right chip from the first paint instead of flashing All first
function savedCaseStatus() {
  try {
    const user = JSON.parse(localStorage.getItem('internyay_user') || 'null')
    const saved = user?.id ? localStorage.getItem(`internyay_case_status_${user.id}`) : null
    return ['Pending', 'On Hold', 'Decided', 'Withdrawn'].includes(saved) ? saved : 'All'
  } catch {
    return 'All'
  }
}

// Global app state lives here: auth, cases, clients, hearings, modals, forms and toasts are shared with every component through this context
const AppContext = createContext(null)

// Provider that holds all state and actions; components read them with the useApp() hook at the bottom of this file
export function AppProvider({ children }) {

  // Router access: the URL is the source of truth for the page, the sign-in tab and the opened case/client
  const navigate = useNavigate()
  const location = useLocation()
  // Always the latest location, for callbacks that must keep a stable identity
  const locationRef = useRef(location)
  locationRef.current = location

  // True on /admin and below, which shows the admin sign-in instead of the normal one
  const isAdminRoute = isAdminPath(location.pathname)

  // Logged in if a token is saved in the browser from a previous login
  const [loggedIn, setLoggedIn] = useState(
    !!localStorage.getItem('internyay_token')
  )

  // Logged-in user's profile (loaded from the saved copy first, then refreshed from the backend)
  const [currentUser, setCurrentUser] = useState(null)
  // Which tab of the auth page is open (login, register or forgot): it is part of the URL (/login, /register, /forgot-password)
  const authPage = authTabFromPath(location.pathname)
  // Switch tab by changing the URL; the page the visitor originally asked for (location.state.from) is kept
  const setAuthPage = useCallback(tab => {
    navigate(AUTH_PATHS[tab] || AUTH_PATHS.login, { replace: true, state: locationRef.current.state })
  }, [navigate])
  const [authError, setAuthError] = useState(() => {
    // After a session expires the API layer leaves a note so the login page can explain why
    try {
      return sessionStorage.getItem('internyay_notice') || ''
    } catch { return '' }
  })

  // The note is shown once: clear it after the first render (done here, not in the initializer, so React's double render in dev doesn't lose it)
  useEffect(() => {
    try { sessionStorage.removeItem('internyay_notice') } catch { /* storage unavailable */ }
  }, [])

  // True when a newly registered advocate still has to choose a plan
  const [planPromptOpen, setPlanPromptOpen] = useState(false)

  // True when a newly registered advocate or associate still has to say which courts they work at (asked after the plan)
  const [courtPromptOpen, setCourtPromptOpen] = useState(false)

  // True from pressing Sign Out until the visitor reaches the home page, so the router sends them there instead of to the sign-in form
  const [justSignedOut, setJustSignedOut] = useState(false)
  useEffect(() => {
    if (justSignedOut && !loggedIn && location.pathname === '/') setJustSignedOut(false)
  }, [justSignedOut, loggedIn, location.pathname])

  // index.html hides the pre-rendered landing page while <html> has the "has-session" class (set at page load when a login token
  // exists). Keep the class in step with the real sign-in state, otherwise after Sign Out the landing page stays hidden: a white page
  useEffect(() => {
    document.documentElement.classList.toggle('has-session', !!loggedIn)
  }, [loggedIn])

  // Role flags used across the app to show or hide features
  const isAdmin =
    String(currentUser?.role || '').toUpperCase() === 'ADMIN'

  // Associates are junior advocates linked to an advocate; they can't see fees and transactions
  const isAssociate =
    String(currentUser?.role || '').toUpperCase() === 'ASSOCIATE'

  // Login form fields
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: ''
  })

  // Which kind of account the person is signing in to: one email can have both an advocate and an associate account.
  // The last choice is remembered on this device so the next sign in starts on the right one
  const [loginType, setLoginTypeState] = useState(() => {
    try {
      return localStorage.getItem('internyay_login_type') === 'ASSOCIATE' ? 'ASSOCIATE' : 'ADVOCATE'
    } catch { return 'ADVOCATE' }
  })

  function setLoginType(type) {
    setLoginTypeState(type)
    try { localStorage.setItem('internyay_login_type', type) } catch { /* storage unavailable */ }
  }

  // Registration form fields (advocate or associate account)
  const [regForm, setRegForm] = useState({
    accountType: 'ADVOCATE',
    name: '',
    barNo: '',
    email: '',
    phone: '',
    specialization: '',
    advocateCode: '',
    password: '',
    confirmPassword: ''
  })

  // Email OTP verification state for registration
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpVerifiedEmail, setOtpVerifiedEmail] = useState('')
  const [otpSending, setOtpSending] = useState(false)
  const [otpVerifying, setOtpVerifying] = useState(false)
  const [otpResendInSec, setOtpResendInSec] = useState(0)

  // The email counts as verified only if it is still the same email that was verified
  const otpVerified = !!regForm.email && regForm.email.trim() === otpVerifiedEmail

  // Countdown for the "resend OTP" button
  useEffect(() => {
    if (otpResendInSec <= 0) return
    const t = setInterval(() => setOtpResendInSec(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [otpResendInSec])

  // Forgot-password flow state
  const [isResettingPassword, setIsResettingPassword] = useState(false)

  const [forgotForm, setForgotForm] = useState({
    email: '',
    accountType: 'ADVOCATE',
    otp: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [forgotOtpSent, setForgotOtpSent] = useState(false)
  const [forgotSending, setForgotSending] = useState(false)
  const [forgotResetting, setForgotResetting] = useState(false)
  const [forgotResendInSec, setForgotResendInSec] = useState(0)

  // Countdown for resending the forgot-password OTP
  useEffect(() => {
    if (forgotResendInSec <= 0) return
    const t = setInterval(() => setForgotResendInSec(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [forgotResendInSec])

  // Change-email flow state (profile page)
  const [isChangingEmail, setIsChangingEmail] = useState(false)

  const [emailChangeForm, setEmailChangeForm] = useState({
    newEmail: '',
    password: '',
    otp: ''
  })
  const [emailChangeOtpSent, setEmailChangeOtpSent] = useState(false)
  const [emailChangeSending, setEmailChangeSending] = useState(false)
  const [emailChangeConfirming, setEmailChangeConfirming] = useState(false)
  const [emailChangeResendInSec, setEmailChangeResendInSec] = useState(0)

  // Countdown for resending the email-change OTP
  useEffect(() => {
    if (emailChangeResendInSec <= 0) return
    const t = setInterval(() => setEmailChangeResendInSec(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [emailChangeResendInSec])

  // Profile edit form
  const [isEditingProfile, setIsEditingProfile] = useState(false)

  const [profileForm, setProfileForm] = useState({
    name: '',
    barNo: '',
    phone: '',
    specialization: '',
    chamber: '',
    profilePicture: ''
  })

  // Change-password form
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

  // Page shown in the main area; it comes from the URL (e.g. /cases/12 -> 'cases')
  const activeNav = parseNavPath(location.pathname).nav

  // Go to a page by its name (the sidebar uses real links instead; this is for buttons and code)
  const setActiveNav = useCallback(id => {
    navigate(navToPath(id, isAdminPath(locationRef.current.pathname)))
  }, [navigate])

  // Case/client id from the URL that should be opened once the data has loaded
  const [pendingDetail, setPendingDetail] = useState(() => {
    const { nav, detail } = parseNavPath(location.pathname)
    return detail ? { nav, id: detail } : null
  })
  // True after cases and clients have been fetched
  const [dataLoaded, setDataLoaded] = useState(false)
  // Goes up when the admin's dropdown choices change, so screens using them draw again without a refresh
  const optionsVersion = useOptionsVersion()

  // The transactions page needs the 4-digit PIN; this stays true only while the user is on that page
  const [transactionsUnlocked, setTransactionsUnlocked] = useState(false)

  // Lock transactions again as soon as the user leaves that page
  useEffect(() => {
    if (activeNav !== 'transactions') setTransactionsUnlocked(false)
  }, [activeNav])

  // Called after the PIN check succeeds
  function unlockTransactions() {
    setTransactionsUnlocked(true)
  }

  // Merges fresh user details from the backend (for example after a PIN is created) into the signed-in user
  function updateCurrentUser(updated) {
    const merged = { ...currentUser, ...updated }
    setCurrentUser(merged)
    localStorage.setItem('internyay_user', JSON.stringify(merged))
  }

  // Main data lists
  const [clients, setClients] = useState([])
  const [cases, setCases] = useState([])
  const [todos, setTodos] = useState([])
  // True while the main data is being loaded
  const [loading, setLoading] = useState(false)

  // Date selected in the dashboard calendar
  const [calendarDate, setCalendarDate] = useState(new Date())
  // Month currently displayed in the calendar
  const [calendarViewDate, setCalendarViewDate] = useState(new Date())

  // Court holidays shown on the calendar
  const [holidays, setHolidays] = useState([])

  // Dates the advocate has crossed out as "no hearing" (kept in a Set for quick lookups)
  const [noHearingDates, setNoHearingDates] = useState(() => new Set())

  // Most hearings the advocate takes on a day: the usual limit (null = no limit) and the limits of particular dates
  const [hearingLimits, setHearingLimits] = useState({ defaultLimit: null, overrides: {} })

  // Keeps the answer of the server in the same shape whatever it contains
  function applyHearingLimits(data) {
    setHearingLimits({
      defaultLimit: data?.defaultLimit ?? null,
      overrides: data?.overrides && typeof data.overrides === 'object' ? data.overrides : {},
    })
  }

  // Load the hearing limits saved by this advocate
  async function fetchHearingLimits() {
    try {
      applyHearingLimits(await hearingLimitsApi.get())
    } catch (e) {
      applyHearingLimits(null)
    }
  }

  // Change the usual daily limit (null removes it)
  async function saveDefaultHearingLimit(limit) {
    try {
      applyHearingLimits(await hearingLimitsApi.setDefault(limit))
      addToast(limit == null ? 'Usual daily limit removed' : `Usual daily limit set to ${limit}`)
      return true
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not save the hearing limit'), 'error')
      return false
    }
  }

  // Change the limit of one date; null (or an empty value) goes back to the usual limit
  async function saveHearingLimitForDate(dateStr, limit) {
    try {
      applyHearingLimits(limit == null
        ? await hearingLimitsApi.resetDate(dateStr)
        : await hearingLimitsApi.setForDate(dateStr, limit))
      // A limit of 0 makes the date a no-hearing date and removing a limit lifts that, so the crosses are read again
      await fetchNoHearingDates()
      addToast(limit == null ? 'Limit removed for this date'
        : limit === 0 ? 'Marked as a no-hearing date (limit 0)'
        : `Limit for this date set to ${limit}`)
      return true
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not save the hearing limit'), 'error')
      return false
    }
  }

  // Load hearing history (up to 1000 records) for the calendar and dashboard
  async function fetchHearingRecords() {
    try {
      const res = await hearingsApi.list({ size: 1000 })
      setHearingRecords(Array.isArray(res) ? res : res?.content || [])
    } catch (e) {
      setHearingRecords([])
    }

    await fetchMiscHearingData()
  }

  // Misc. application hearing dates: per case (history counts) and per date (calendar counts)
  // quiet: a failed reload keeps what is shown instead of blanking it
  async function fetchMiscHearingData(quiet = false) {
    // The misc. application hearings of each case, so the history counts include them
    try {
      const counts = await miscApplicationsApi.hearingCounts()
      setMiscHearingCounts(new Map(Object.entries(counts || {}).map(([id, n]) => [Number(id), Number(n) || 0])))
    } catch (e) {
      if (!quiet) setMiscHearingCounts(new Map())
    }

    // The dates of those hearings, so the calendar counts include misc. applications
    try {
      const byDate = await miscApplicationsApi.hearingDates()
      setMiscHearingCaseIdsByDate(new Map(Object.entries(byDate || {}).map(([date, ids]) => [date, new Set(ids)])))
    } catch (e) {
      if (!quiet) setMiscHearingCaseIdsByDate(new Map())
    }
  }

  // Load court holidays
  async function fetchHolidays() {
    try {
      const data = await holidaysApi.list()
      setHolidays(Array.isArray(data) ? data : [])
    } catch (e) {
      setHolidays([])
    }
  }

  // Load the no-hearing dates saved by this advocate
  async function fetchNoHearingDates() {
    try {
      const data = await noHearingDatesApi.list()
      setNoHearingDates(new Set(Array.isArray(data) ? data : []))
    } catch (e) {
      setNoHearingDates(new Set())
    }
  }

  // Mark or unmark a date as a no-hearing date and update the local Set
  async function toggleNoHearingDate(dateStr) {
    const wasMarked = noHearingDates.has(dateStr)

    try {
      if (wasMarked) await noHearingDatesApi.unmark(dateStr)
      else           await noHearingDatesApi.mark(dateStr)

      setNoHearingDates(prev => {
        const next = new Set(prev)
        if (wasMarked) next.delete(dateStr)
        else           next.add(dateStr)
        return next
      })

      // Crossing a date out drops a limit that was set for it
      if (!wasMarked) fetchHearingLimits()

      addToast(wasMarked ? 'Cross removed — hearings can be set on this date again' : 'Marked as a no-hearing date')
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not update the calendar'), 'error')
    }
  }

  // Visibility flags and targets for the global modals
  const [showAddCase, setShowAddCase] = useState(false)
  // A CNR read from a scanned QR: the Add Case window fetches that case as soon as it opens
  const [scanCnr, setScanCnr] = useState('')
  const [showAddClient, setShowAddClient] = useState(false)
  const [uploadDocCaseId, setUploadDocCaseId] = useState(null)
  const [docPreview, setDocPreview] = useState(null)

  // Case opened in the detail view
  const [selectedCase, setSelectedCase] = useState(null)
  // Status filter on the cases page
  const [filterStatus, setFilterStatus] = useState(savedCaseStatus)

  // Case whose "next hearing" modal is open
  const [nextHearingCaseId, setNextHearingCaseId] = useState(null)

  // Counter bumped after hearing changes so hearing lists reload
  const [hearingsVersion, setHearingsVersion] = useState(0)

  // Case whose hearing history is expanded
  const [expandedHearingCaseId, setExpandedHearingCaseId] = useState(null)

  // Judge name to search for when jumping to the Judges on Leave page
  const [judgeLeaveJumpQuery, setJudgeLeaveJumpQuery] = useState(null)

  // All hearing records
  const [hearingRecords, setHearingRecords] = useState([])

  // Hearing dates of the misc. applications in each case (caseId -> count), added to the case's hearing history count
  const [miscHearingCounts, setMiscHearingCounts] = useState(() => new Map())
  // Cases that have a misc. application hearing on each date (date -> case ids), counted on the calendar
  const [miscHearingCaseIdsByDate, setMiscHearingCaseIdsByDate] = useState(() => new Map())

  // Case whose transaction drawer is open
  const [transactionCaseId, setTransactionCaseId] = useState(null)

  // Client opened in the detail modal
  const [selectedClient, setSelectedClient] = useState(null)
  // Id of a client whose detail modal should open straight in edit mode (used to add a missing WhatsApp number)
  const [clientEditRequest, setClientEditRequest] = useState(null)
  function openClientForEdit(client) {
    setClientEditRequest(client.id)
    setSelectedClient(client)
  }

  // Latest selection, read by the URL effects below without making them re-run
  const selectedCaseRef = useRef(null)
  const prevNavRef = useRef(null)
  selectedCaseRef.current = selectedCase
  const selectedClientRef = useRef(null)
  selectedClientRef.current = selectedClient

  // Once data is loaded, open the case/client from the URL, or fix the URL if it no longer exists
  useEffect(() => {
    if (!pendingDetail || !dataLoaded || !loggedIn) return
    // The URL moved on while the data was loading: nothing to open any more
    const cur = parseNavPath(location.pathname)
    if (cur.nav !== pendingDetail.nav || cur.detail !== pendingDetail.id) {
      setPendingDetail(null)
      return
    }
    // True for the case or client whose id came from the URL
    const sameId = item => String(item.id) === pendingDetail.id
    const item = (pendingDetail.nav === 'cases' ? cases : clients).find(sameId)
    if (item) {
      if (pendingDetail.nav === 'cases') setSelectedCase(item)
      else setSelectedClient(item)
    } else {
      // Same message whether it was deleted or belongs to someone else, so nothing is revealed about other accounts
      addToast(pendingDetail.nav === 'cases'
        ? 'That case could not be found in your account'
        : 'That client could not be found in your account', 'error')
      navigate('/' + pendingDetail.nav, { replace: true })
    }
    setPendingDetail(null)
  }, [pendingDetail, dataLoaded, loggedIn, cases, clients, location.pathname, navigate])

  // URL -> selection: runs when the address changes (link, back/forward button) and opens or closes the case/client to match
  useEffect(() => {
    const { nav, detail } = parseNavPath(location.pathname)
    const prevNav = prevNavRef.current
    prevNavRef.current = nav
    if (nav === 'cases') {
      if (detail) {
        if (String(selectedCaseRef.current?.id) !== detail) {
          setPendingDetail(prev => (prev && prev.nav === nav && prev.id === detail ? prev : { nav, id: detail }))
        }
      } else if (prevNav !== 'cases' && selectedCaseRef.current) {
        navigate('/cases/' + encodeURIComponent(selectedCaseRef.current.id), { replace: true })
      } else {
        setSelectedCase(null)
      }
    }
    if (nav === 'clients' && detail) {
      if (String(selectedClientRef.current?.id) !== detail) {
        setPendingDetail(prev => (prev && prev.nav === nav && prev.id === detail ? prev : { nav, id: detail }))
      }
    } else {
      setSelectedClient(null)
    }
  }, [location.pathname])

  // Selection -> URL: opening or closing a case/client adds or removes its id in the address.
  // Deliberately does not depend on the location: when the address changes first (back button) the effect above updates the selection
  useEffect(() => {
    if (!loggedIn || isAdmin || isAdminRoute || pendingDetail) return
    const { nav, detail } = parseNavPath(locationRef.current.pathname)
    if (nav !== 'cases' && nav !== 'clients') return
    const selected = nav === 'cases' ? selectedCase : selectedClient
    const want = selected?.id != null ? String(selected.id) : null
    if ((detail || null) !== want) {
      navigate('/' + nav + (want != null ? '/' + encodeURIComponent(want) : ''))
    }
  }, [selectedCase, selectedClient, pendingDetail, loggedIn, isAdmin, isAdminRoute, navigate])

  // Open a case on the Cases page (used from the dashboard and from a client's case list)
  function openCase(c) {
    setSelectedCase(c)
    navigate('/cases/' + encodeURIComponent(c.id))
  }
  // Case whose invoice modal is open
  const [invoiceCaseId, setInvoiceCaseId] = useState(null)

  // Blank state of the add/edit case form (also used to reset it)
  const EMPTY_CASE_FORM = {
    // title is used only when titleEdited is true; otherwise the title is composed from the parties
    title: '',
    titleEdited: false,
    // Key of the non-client whose name leads our side of the title (null: the main client leads)
    titleLead: null,
    // Key of the opposite party whose name leads their side of the title (null: the first one leads)
    opponentLead: null,
    clientSide: SIDE_COMPLAINANT,

    // Opposite parties, and people on our side who are not saved as clients (see utils/caseParties.js)
    opponents: [],
    nonClients: [],

    caseNo: '',

    // fileNo is what the advocate typed. While fileNoManual is false the file number field shows the suggested
    // next number (fileSeq) and the server gives the next free number when the case is saved
    fileNo: '',
    fileSeq: null,
    fileNoOrigin: 'new',
    fileNoManual: false,

    // CNR: the form was filled from eCourts using the CNR, so the next date and status come from the court; the hearing
    // dates and orders of that lookup are saved with the case.
    // MANUAL: the advocate fills the form, no hearing dates or orders are brought in
    addMode: 'MANUAL',
    // What eCourts said about the case when it was added by CNR. Only for the notes on the form, never sent
    cnrDetail: null,
    // The server side lookup (CAPTCHA session) behind a case added by CNR; sent so its history and orders are saved
    lookupToken: '',

    cnrNo: '',
    filingDate: '',
    caseStage: '',
    actsSections: '',
    registrationDate: '',
    firstHearingDate: '',
    decisionDate: '',
    disposalNature: '',
    court: '',
    district: '',
    courtNo: '',
    building: '',
    floor: '',

    caseNature: 'Civil',
    reliefSought: '',
    caseType: '',

    firNo: '',
    firSection: '',
    policeStation: '',

    chequeNo: '',
    chequeDate: '',
    memoDate: '',
    bouncingReason: '',
    claimAmount: '',
    noticeDate: '',

    nextHearing: '',
    description: '',

    feeType: 'TOTAL',
    totalFeeAmount: '',
    totalFeeAmountDate: '',
    totalFeePaid: false,
    initialAmount: '',
    initialAmountDate: '',
    initialPaid: false,
    dateWiseAmount: '',
    hearingFees: [],
    stageFees: []
  }

  // Add/edit case form values
  const [newCaseForm, setNewCaseForm] = useState({ ...EMPTY_CASE_FORM })

  // Id of the case being edited (null when adding a new one)
  const [editingCaseId, setEditingCaseId] = useState(null)

  // Clients attached to the case being created/edited (first one is the main client)
  const [caseClients, setCaseClients] = useState([])
  // Main client's id
  const caseClientId = caseClients[0]?.id ?? null

  // Role of each client in the case (Accused, Plaintiff/Petitioner, ...)
  const [caseClientSubTypes, setCaseClientSubTypes] = useState({})

  // Non-client being marked as a client: { caseId, nonClient }. caseId is null when it happens inside the case form
  const [markTarget, setMarkTarget] = useState(null)

  // Blank state of the fee form
  const EMPTY_FEE_FORM = {
    feeType: 'TOTAL',
    totalFeeAmount: '',
    totalFeeAmountDate: '',
    totalFeePaid: false,
    initialAmount: '',
    initialAmountDate: '',
    initialPaid: false,
    dateWiseAmount: '',
    hearingFees: [],
    stageFees: []
  }

  // State of the "edit fee only" modal
  const [feeOnlyCaseId, setFeeOnlyCaseId] = useState(null)
  const [feeOnlyForm, setFeeOnlyForm] = useState({ ...EMPTY_FEE_FORM })
  const [feeOnlyFocusDate, setFeeOnlyFocusDate] = useState(null)
  const [feeOnlyReadOnly, setFeeOnlyReadOnly] = useState(false)

  // Add client form values
  const [newClientForm, setNewClientForm] = useState({
    name: '',
    email: '',
    whatsappPhone: '',
    additionalPhone: '',
    address: '',
    type: 'INDIVIDUAL',
    customLabel: '',
    profilePicture: ''
  })

  // Upload form state for case documents
  const [docName, setDocName] = useState('')
  const [docType, setDocType] = useState('')
  const fileRef = useRef()

  // Upload form state for client documents
  const [uploadDocClientId, setUploadDocClientId] = useState(null)
  const [clientDocName, setClientDocName] = useState('')
  const [clientDocType, setClientDocType] = useState('')
  const [clientDocTypeCustom, setClientDocTypeCustom] = useState('')
  const clientFileRef = useRef()

  // Advocate's own documents and their upload form state
  const [advocateDocs, setAdvocateDocs] = useState([])
  const [uploadDocAdvocate, setUploadDocAdvocate] = useState(false)
  const [advocateDocName, setAdvocateDocName] = useState('')
  const advocateFileRef = useRef()

  // The document being renamed (case, client, advocate or evidence file), or null
  const [renameDocTarget, setRenameDocTarget] = useState(null)

  // Evidence upload form state
  const [showUploadEvidence, setShowUploadEvidence] = useState(false)
  const [evidenceCategory, setEvidenceCategory] = useState('')
  const [evidenceTargetId, setEvidenceTargetId] = useState(null)
  const [evidenceName, setEvidenceName] = useState('')
  const evidenceFileRef = useRef()

  // Toast notifications currently on screen
  const [toasts, setToasts] = useState([])

  // Counter for unique toast ids
  const toastSeq = useRef(0)

  // Shows a toast message for 3 seconds; identical messages are not shown twice at once
  const addToast = useCallback((msg, type = 'success') => {
    const id = ++toastSeq.current

    setToasts(t =>
      t.some(x => x.msg === msg && x.type === type)
        ? t
        : [...t, { id, msg, type }]
    )

    // Starts the exit animation just before the toast is removed
    setTimeout(() => {
      setToasts(t => t.map(x => (x.id === id ? { ...x, leaving: true } : x)))
    }, 2700)
    setTimeout(() => {
      setToasts(t => t.filter(x => x.id !== id))
    }, 3000)
  }, [])

  // The court preference belongs to the signed-in account: load it after sign-in, forget it on sign-out
  // or when another account takes over (the admin console has no court preference)
  useEffect(() => {
    if (!loggedIn || !currentUser?.id || isAdmin) {
      resetCourtPreferences()
      return
    }
    loadCourtPreferences(true).catch(() => {})
  }, [loggedIn, currentUser?.id, isAdmin])

  // Without a chosen court the default is the court with the most cases, so adding or removing a case can change it
  useEffect(() => {
    if (loggedIn && currentUser?.id && !isAdmin && dataLoaded) loadCourtPreferences(true).catch(() => {})
  }, [cases.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Quiet refresh bookkeeping: a refresh result is dropped when the person changed something while it was loading,
  // so a slow answer can never undo what they just did
  const lastLocalChange = useRef(0)
  const applyingRefresh = useRef(false)
  useEffect(() => {
    if (!applyingRefresh.current) lastLocalChange.current = Date.now()
  }, [cases, clients, todos, advocateDocs])

  // After login: load the saved user, refresh the profile, then fetch all the data
  useEffect(() => {

    if (!loggedIn) {
      return
    }

    // The court table feeds every court dropdown and label
    loadCourts().catch(() => {})

    if (!currentUser) {

      const cached = localStorage.getItem('internyay_user')

      if (cached) {
        try {
          setCurrentUser(JSON.parse(cached))
        } catch (e) {
        }
      }

      authApi
        .me()
        .then(me => {
          if (me) {
            setCurrentUser(me)
            localStorage.setItem('internyay_user', JSON.stringify(me))
            // Also covers accounts that signed in before account switching existed
            syncActiveAccount(me)
          }
        })
        .catch(() => {})
    }

    // Reads the paged /cases endpoint page by page until the last one, so no case is left out
    async function loadAllCases() {

      const size = 200
      let all = []

      for (let page = 0; page < 100; page++) {

        const res = await casesApi.list({ page, size })

        // Older/unpaged responses are a plain array
        if (Array.isArray(res)) return res

        const batch = res?.content || []
        all = all.concat(batch)

        if (res?.last || batch.length === 0 || page + 1 >= (res?.totalPages ?? 1)) break
      }

      return all
    }

    // Fetches cases, clients, tasks, documents, holidays, no-hearing dates and hearings in one go
    async function loadData() {

      setLoading(true)

      try {

        // Cases, clients and tasks load in parallel; a failure in one returns an empty list instead of breaking the rest
        const [
          casesRes,
          clientsRes,
          tasksRes
        ] = await Promise.all([

          // The backend pages the case list (20 per page by default), so read every page
          loadAllCases()
            .catch(e => {
              console.error('Could not load cases', e)
              addToast('Could not load your cases. Please refresh the page.', 'error')
              return []
            }),

          clientsApi
            .list()
            .catch(() => []),

          tasksApi
            .list()
            .catch(() => [])
        ])

        setCases(
          Array.isArray(casesRes)
            ? casesRes
            : casesRes?.content || []
        )

        const clientList = Array.isArray(clientsRes)
          ? clientsRes
          : clientsRes?.content || []

        // All documents come in one call and are split below by client / advocate
        let allDocs = []
        try {
          allDocs = await documentsApi.list()
        } catch (e) {
          allDocs = []
        }

        // Attach each client's own documents to the client object
        setClients(
          clientList.map(cl => ({
            ...cl,
            documents: (Array.isArray(allDocs) ? allDocs : [])
              .filter(d => d.clientId === cl.id)
          }))
        )

        // Documents with no case and no client belong to the advocate themselves
        setAdvocateDocs(
          (Array.isArray(allDocs) ? allDocs : [])
            .filter(d => !d.caseId && !d.clientId)
        )

        setTodos(
          Array.isArray(tasksRes)
            ? tasksRes
            : tasksRes?.content || []
        )

        // Calendar data
        await fetchHolidays()

        await fetchNoHearingDates()
        await fetchHearingLimits()

        await fetchHearingRecords()

      } catch (e) {

        // If anything fails, tell the user instead of showing an empty app
        console.error(e)

        addToast(
          'Failed to load data',
          'error'
        )

      } finally {

        setLoading(false)
        setDataLoaded(true)

      }
    }

    loadData()

    // Looks at the server again when the tab is back in view and every few minutes, so changes made on another device, or by
    // the admin (holidays, dropdown choices, the plan), show up without a refresh. Nothing flashes and nothing is blanked on failure.
    async function refreshQuietly() {
      const startedAt = Date.now()
      loadOptions().catch(() => {})

      const [casesRes, clientsRes, tasksRes, allDocs, holidayList, noHearingList, hearingRes, me, limitsRes] = await Promise.all([
        loadAllCases().catch(() => null),
        clientsApi.list().catch(() => null),
        tasksApi.list().catch(() => null),
        documentsApi.list().catch(() => null),
        holidaysApi.list().catch(() => null),
        noHearingDatesApi.list().catch(() => null),
        hearingsApi.list({ size: 1000 }).catch(() => null),
        authApi.me().catch(() => null),
        hearingLimitsApi.get().catch(() => null),
      ])

      // Calendar data and the profile do not depend on what the person is editing
      if (Array.isArray(holidayList)) setHolidays(holidayList)
      if (Array.isArray(noHearingList)) setNoHearingDates(new Set(noHearingList))
      if (limitsRes) applyHearingLimits(limitsRes)
      if (hearingRes) setHearingRecords(Array.isArray(hearingRes) ? hearingRes : hearingRes?.content || [])
      // Application hearing dates too, so the calendar and the history counts stay right when they change elsewhere
      fetchMiscHearingData(true).catch(() => {})
      if (me) {
        setCurrentUser(prev => {
          if (!prev) return prev
          if (Object.keys(me).every(k => JSON.stringify(prev[k]) === JSON.stringify(me[k]))) return prev
          const next = { ...prev, ...me }
          localStorage.setItem('internyay_user', JSON.stringify(next))
          return next
        })
      }

      // Cases, clients, tasks and documents: skip this round if the person changed any of them meanwhile
      if (lastLocalChange.current > startedAt) return
      applyingRefresh.current = true
      try {
        const docs = Array.isArray(allDocs) ? allDocs : null

        if (casesRes) {
          const fresh = Array.isArray(casesRes) ? casesRes : casesRes?.content || []
          // The case list may not carry the documents; keep the ones already loaded for a case
          setCases(prev => {
            const old = new Map(prev.map(c => [c.id, c]))
            return fresh.map(c => (c.documents == null && old.get(c.id)?.documents
              ? { ...c, documents: old.get(c.id).documents }
              : c))
          })
          setSelectedCase(prev => {
            if (!prev) return prev
            const now = fresh.find(c => c.id === prev.id)
            return now ? { ...prev, ...now, documents: now.documents ?? prev.documents } : prev
          })
        }

        if (clientsRes) {
          const list = Array.isArray(clientsRes) ? clientsRes : clientsRes?.content || []
          setClients(prev => {
            const old = new Map(prev.map(c => [c.id, c]))
            return list.map(cl => ({
              ...cl,
              documents: docs ? docs.filter(d => d.clientId === cl.id) : (old.get(cl.id)?.documents || []),
            }))
          })
        }
        if (docs) setAdvocateDocs(docs.filter(d => !d.caseId && !d.clientId))
        if (tasksRes) setTodos(Array.isArray(tasksRes) ? tasksRes : tasksRes?.content || [])
      } finally {
        setTimeout(() => { applyingRefresh.current = false }, 200)
      }
    }
    const stopLive = onLiveRefresh(() => { refreshQuietly().catch(() => {}) })
    return stopLive

  // Reload everything whenever the user logs in
  }, [loggedIn])

  // Sign in with email and password; the admin route only accepts admin accounts
  async function handleLogin() {

    setAuthError('')

    try {

      const res = await authApi.login(
        { ...loginForm, accountType: isAdminRoute ? 'ADMIN' : loginType }
      )

      // Role of the account that just logged in
      const role =
        String(res.user?.role || '').toUpperCase()

      if (isAdminRoute && role !== 'ADMIN') {
        setAuthError(
          'This account does not have administrator access'
        )
        return
      }

      setLoginForm({ email: '', password: '' })

      startSession(res)

    } catch (e) {

      setAuthError(
        getErrorMessage(e, 'Login failed')
      )
    }
  }

  // Saves the token and user in the browser and switches the app into the logged-in state (askPlan = show the plan picker to new advocates)
  function startSession(res, { askPlan = false } = {}) {

    const role =
      String(res.user?.role || '').toUpperCase()

    localStorage.setItem(
      'internyay_token',
      res.token
    )

    localStorage.setItem(
      'internyay_user',
      JSON.stringify(res.user || {})
    )

    // Remember this account so the user can switch back to it later
    rememberAccount(res.token, res.user)

    setCurrentUser(res.user)
    // New advocates must pick a plan; admins and associates skip this
    setPlanPromptOpen(askPlan && role !== 'ADMIN' && role !== 'ASSOCIATE')
    // Every new account (advocate or associate) is asked for its courts once, after the plan
    setCourtPromptOpen(askPlan && role !== 'ADMIN')
    setLoggedIn(true)
    setJustSignedOut(false)
    setLoginForm({ email: '', password: '' })

    if (res.reactivated) {
      addToast('Welcome back — your account has been reactivated')
    }
  }

  // Sign in with a Google account (not available on the admin route)
  async function handleGoogleLogin(idToken) {

    setAuthError('')

    if (isAdminRoute) return

    try {

      startSession(await authApi.googleLogin({ idToken, accountType: loginType }))

    } catch (e) {

      setAuthError(getErrorMessage(e, 'Google sign-in failed'))
    }
  }

  // A new associate who chose Google before typing the advocate code: the Google sign-in is kept here
  // (token plus the name and email to show) while the code is asked for on the same screen
  const [googlePending, setGooglePending] = useState(null)

  // Reads the name and email out of a Google ID token, only to show who is signing up (the backend verifies the token itself)
  function googleIdentityFrom(idToken) {
    try {
      const b64 = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
      const json = decodeURIComponent(
        atob(b64).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
      )
      const payload = JSON.parse(json)
      return { name: payload.name || '', email: payload.email || '' }
    } catch (e) {
      return { name: '', email: '' }
    }
  }

  // Drop the kept Google sign-in, e.g. to pick a different Google account
  function cancelGooglePending() {
    setGooglePending(null)
    setAuthError('')
  }

  // Second step for a new Google sign-up: the mobile number (and, for associates, the advocate code) is typed in a popup
  // after Google, no second Google sign-in needed (returns the sign-up request so the popup can show a busy state;
  // errors land in authError)
  function completeGoogleSignup({ phone, code }) {
    if (!googlePending) return Promise.resolve()

    const trimmedPhone = String(phone || '').trim()
    const phoneProblem = indianPhoneError(trimmedPhone, { required: true, label: 'mobile number' })
    if (phoneProblem) {
      setAuthError(phoneProblem)
      return Promise.resolve()
    }

    const registeringAssociate = regForm.accountType === 'ASSOCIATE'
    const trimmedCode = String(code || '').trim()
    if (registeringAssociate && !trimmedCode) {
      setAuthError("Enter the advocate code from your advocate's Profile page")
      return Promise.resolve()
    }

    setRegForm(f => ({ ...f, phone: trimmedPhone, ...(registeringAssociate ? { advocateCode: trimmedCode } : {}) }))
    return handleGoogleRegister(googlePending.idToken, { phone: trimmedPhone, code: trimmedCode })
  }

  // Create an account with Google. Google gives only the name and email, so a new account also needs a mobile number
  // (and associates the advocate code from their advocate's profile); an existing account is simply signed in.
  // The first attempt uses whatever is already typed on the form; if the backend says something is missing,
  // the Google sign-in is kept and a popup asks for it
  // `extra` holds the values typed in the popup (state would still hold the old ones this tick)
  async function handleGoogleRegister(idToken, extra = {}) {

    setAuthError('')

    const registeringAssociate = regForm.accountType === 'ASSOCIATE'

    // Use the phone typed on the form only when it is valid, otherwise let the popup ask for it
    const typedPhone = String(extra.phone ?? regForm.phone ?? '').trim()
    const phone = indianPhoneError(typedPhone, { required: true }) ? '' : typedPhone

    try {

      const res = await authApi.googleRegister({
        idToken,
        accountType: regForm.accountType,
        ...(phone ? { phone } : {}),
        ...(registeringAssociate
          ? { advocateCode: typeof extra.code === 'string' ? extra.code : regForm.advocateCode }
          : {})
      })

      setGooglePending(null)

      if (res.existingAccount) {
        // This Google email already has an account: just open it, no plan prompt
        startSession(res)
        addToast('You already have an account — signed you in')
      } else {
        startSession(res, { askPlan: !registeringAssociate })
        addToast('Account created — welcome to InterNyay')
      }

    } catch (e) {

      const message = getErrorMessage(e, '')

      // New account without a mobile number (or an associate without a code) yet: keep the Google sign-in and ask in a popup
      const needsPhone = /phone number is required/i.test(message)
      const needsCode  = registeringAssociate && /advocate code is required/i.test(message)

      if (needsPhone || needsCode) {
        setGooglePending({ idToken, ...googleIdentityFrom(idToken) })
        return
      }

      setAuthError(getErrorMessage(e, 'Google sign-up failed'))
    }
  }

  // Registration step 1: validate the email and send a verification code to it
  async function handleSendOtp() {

    setAuthError('')

    const email = String(regForm.email || '').trim()
    const regEmailErr = emailError(email, { required: true })
    if (regEmailErr) {
      setAuthError(regEmailErr)
      return
    }

    setOtpSending(true)

    try {

      await authApi.sendOtp({ email, name: regForm.name })

      setOtpSent(true)
      setOtpCode('')
      // Block resend for 45 seconds
      setOtpResendInSec(45)
      addToast('Verification code sent to your email')

    } catch (e) {

      setAuthError(getErrorMessage(e, 'Could not send the verification code'))

    } finally {

      setOtpSending(false)
    }
  }

  // Registration step 2: check the 6-digit code the user typed
  async function handleVerifyOtp() {

    setAuthError('')

    const email = String(regForm.email || '').trim()
    const code = String(otpCode || '').trim()

    if (!/^\d{6}$/.test(code)) {
      setAuthError('Enter the 6-digit code from your email')
      return
    }

    setOtpVerifying(true)

    try {

      await authApi.verifyOtp({ email, otp: code })

      setOtpVerifiedEmail(email)
      addToast('Email verified')

    } catch (e) {

      setAuthError(getErrorMessage(e, 'Incorrect code'))

    } finally {

      setOtpVerifying(false)
    }
  }

  // Final registration step: validates the form (name, verified email, password, phone, advocate code) and creates the account
  async function handleRegister() {

    setAuthError('')

    const email = String(regForm.email || '').trim()

    if (!String(regForm.name || '').trim()) {
      setAuthError('Full name is required')
      return
    }

    if (!email || email !== otpVerifiedEmail) {
      setAuthError('Please verify your email with the code we sent before creating your account')
      return
    }

    const regPasswordProblem = passwordProblem(regForm.password, email)
    if (regPasswordProblem) {
      setAuthError(regPasswordProblem)
      return
    }

    if (regForm.password !== regForm.confirmPassword) {
      setAuthError('Passwords do not match')
      return
    }

    const phoneError = indianPhoneError(regForm.phone, { required: true, label: 'mobile number' })
    if (phoneError) {
      setAuthError(phoneError)
      return
    }

    const registeringAssociate = regForm.accountType === 'ASSOCIATE'

    if (registeringAssociate && !String(regForm.advocateCode || '').trim()) {
      setAuthError("Enter the advocate code from your advocate's Profile page")
      return
    }

    try {

      // Only send the fields that belong to the selected account type
      const res = await authApi.register({
        ...regForm,
        ...(registeringAssociate ? { specialization: '' } : { advocateCode: '' })
      })

      // Clear every field (and the OTP state) after a successful sign up
      resetAuthForms()

      startSession(res, { askPlan: !registeringAssociate })

      addToast('Account created — welcome to InterNyay')

    } catch (e) {

      setAuthError(
        getErrorMessage(e, 'Registration failed')
      )
    }
  }

  // Another tab switched account or signed out: reload so this tab shows the same account as the saved login
  useEffect(() => {
    function onStorage(e) {
      if (e.key === 'internyay_token' && e.newValue !== e.oldValue) window.location.reload()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Switch to another account that is already signed in on this browser (the page reloads so nothing from the old account is left behind)
  function switchAccount(id) {
    if (currentUser) syncActiveAccount(currentUser)
    if (!activateAccount(id)) {
      addToast('That account is no longer signed in. Please sign in again.', 'error')
      return
    }
    window.location.assign('/')
  }

  // Sign in with another account while staying signed in on this one: opens the sign-in page, the current account stays saved
  function addAccount() {
    if (currentUser) syncActiveAccount(currentUser)
    localStorage.removeItem('internyay_token')
    localStorage.removeItem('internyay_user')
    window.location.assign('/login')
  }

  // Empties everything typed on the sign in, register and forgot-password forms (and their OTP state),
  // so nothing from the last person is left on screen after they register or sign out
  function resetAuthForms() {
    setLoginForm({ email: '', password: '' })
    setRegForm({
      accountType: 'ADVOCATE',
      name: '',
      barNo: '',
      email: '',
      phone: '',
      specialization: '',
      advocateCode: '',
      password: '',
      confirmPassword: ''
    })
    setOtpSent(false)
    setOtpCode('')
    setOtpVerifiedEmail('')
    setOtpResendInSec(0)
    setForgotForm({ email: '', accountType: 'ADVOCATE', otp: '', newPassword: '', confirmPassword: '' })
    setForgotOtpSent(false)
    setForgotResendInSec(0)
    setAuthError('')
  }

  // Signs out the account in use. Other accounts stay signed in: if there is one, the app switches to it
  function handleLogout() {

    resetAuthForms()

    resetCourts()
    resetCourtPreferences()
    clearSessionState()

    // Let the server log the sign-out (fire and forget, uses the token that is about to be cleared)
    authApi.logout()

    forgetAccountByToken(localStorage.getItem('internyay_token'))

    if (!isAdminRoute && !isAdmin) {
      const remaining = getAccounts()
      const next = remaining[remaining.length - 1]
      if (next && activateAccount(next.id)) {
        window.location.assign('/')
        return
      }
    }

    localStorage.removeItem(
      'internyay_token'
    )

    localStorage.removeItem(
      'internyay_user'
    )

    document.documentElement.classList.remove('has-session')

    setLoggedIn(false)
    setCurrentUser(null)
    setPlanPromptOpen(false)
    setCourtPromptOpen(false)
    setJustSignedOut(true)
    setPendingDetail(null)
    setDataLoaded(false)
    setSelectedCase(null)
    setSelectedClient(null)

    setCases([])
    setClients([])
    setTodos([])
    setHolidays([])
    setNoHearingDates(new Set())
    setHearingLimits({ defaultLimit: null, overrides: {} })
    setNextHearingCaseId(null)
    setExpandedHearingCaseId(null)
    setHearingRecords([])
    setMiscHearingCounts(new Map())
    setMiscHearingCaseIdsByDate(new Map())
    setTransactionCaseId(null)
    setTransactionsUnlocked(false)
  }

  // Opens the forgot-password flow; a logged-in user resets from inside the app with their email pre-filled
  function startForgotPassword() {
    setForgotForm({
      email: loggedIn ? (currentUser?.email || '') : '',
      accountType: isAssociate ? 'ASSOCIATE' : 'ADVOCATE',
      otp: '',
      newPassword: '',
      confirmPassword: ''
    })
    setForgotOtpSent(false)
    setForgotResendInSec(0)
    setAuthError('')

    if (loggedIn) {
      setIsResettingPassword(true)
    } else {
      setAuthPage('forgot')
    }
  }

  // Close the forgot-password flow and reset its form
  function cancelForgotPassword() {
    setIsResettingPassword(false)
    if (!loggedIn) setAuthPage('login')
    setAuthError('')
    setForgotForm({ email: '', accountType: 'ADVOCATE', otp: '', newPassword: '', confirmPassword: '' })
    setForgotOtpSent(false)
    setForgotResendInSec(0)
  }

  // Send the reset code (the message doesn't reveal whether the account exists)
  async function handleSendForgotOtp() {

    setAuthError('')

    const email = String(forgotForm.email || '').trim()
    const forgotEmailErr = emailError(email, { required: true })
    if (forgotEmailErr) {
      setAuthError(forgotEmailErr)
      return
    }

    setForgotSending(true)

    try {

      await authApi.forgotPasswordSendOtp({ email, accountType: forgotForm.accountType })

      setForgotOtpSent(true)
      setForgotResendInSec(45)
      addToast('If that account exists, a verification code has been sent')

    } catch (e) {

      setAuthError(getErrorMessage(e, 'Could not send the verification code'))

    } finally {

      setForgotSending(false)
    }
  }

  // Check the code and new password, then reset the password
  async function handleResetForgottenPassword() {

    setAuthError('')

    const code = String(forgotForm.otp || '').trim()
    if (!/^\d{6}$/.test(code)) {
      setAuthError('Enter the 6-digit code from your email')
      return
    }

    const forgotPasswordProblem = passwordProblem(forgotForm.newPassword, forgotForm.email)
    if (forgotPasswordProblem) {
      setAuthError(forgotPasswordProblem)
      return
    }

    if (forgotForm.newPassword !== forgotForm.confirmPassword) {
      setAuthError('Passwords do not match')
      return
    }

    setForgotResetting(true)

    try {

      await authApi.forgotPasswordReset({
        email: String(forgotForm.email || '').trim(),
        accountType: forgotForm.accountType,
        otp: code,
        newPassword: forgotForm.newPassword,
        confirmPassword: forgotForm.confirmPassword,
      })

      addToast(loggedIn ? 'Password updated successfully' : 'Password updated — please sign in')

      // A Google account that had no password now has one
      if (loggedIn && currentUser && currentUser.passwordSet === false) {
        const updated = { ...currentUser, passwordSet: true }
        setCurrentUser(updated)
        localStorage.setItem('internyay_user', JSON.stringify(updated))
      }

      cancelForgotPassword()

    } catch (e) {

      setAuthError(getErrorMessage(e, 'Could not reset password'))

    } finally {

      setForgotResetting(false)
    }
  }

  // Open the change-email form with empty fields
  function startChangeEmail() {
    setEmailChangeForm({ newEmail: '', password: '', otp: '' })
    setEmailChangeOtpSent(false)
    setEmailChangeResendInSec(0)
    setAuthError('')
    setIsChangingEmail(true)
  }

  // Close the change-email form and reset its state
  function cancelChangeEmail() {
    setIsChangingEmail(false)
    setAuthError('')
    setEmailChangeForm({ newEmail: '', password: '', otp: '' })
    setEmailChangeOtpSent(false)
    setEmailChangeResendInSec(0)
  }

  // Step 1: check the new email and the password, then send a code to the new address
  async function handleSendEmailChangeOtp() {

    setAuthError('')

    const newEmail = String(emailChangeForm.newEmail || '').trim().toLowerCase()
    const newEmailErr = emailError(newEmail, { required: true })
    if (newEmailErr) {
      setAuthError(newEmailErr)
      return
    }

    if (newEmail === String(currentUser?.email || '').toLowerCase()) {
      setAuthError("That's already the email on this account")
      return
    }

    if (!emailChangeForm.password) {
      setAuthError('Enter your current password to confirm it\u2019s you')
      return
    }

    setEmailChangeSending(true)

    try {

      await authApi.requestEmailChange({ newEmail, password: emailChangeForm.password })

      setEmailChangeForm(f => ({ ...f, newEmail }))
      setEmailChangeOtpSent(true)
      setEmailChangeResendInSec(45)
      addToast(`Verification code sent to ${newEmail}`)

    } catch (e) {

      setAuthError(getErrorMessage(e, 'Could not send the verification code'))

    } finally {

      setEmailChangeSending(false)
    }
  }

  // Step 2: confirm the code; on success the saved user gets the new email
  async function handleConfirmEmailChange() {

    setAuthError('')

    const code = String(emailChangeForm.otp || '').trim()
    if (!/^\d{6}$/.test(code)) {
      setAuthError('Enter the 6-digit code from your email')
      return
    }

    setEmailChangeConfirming(true)

    try {

      const updated = await authApi.confirmEmailChange({ otp: code })

      const merged = { ...currentUser, ...updated }
      setCurrentUser(merged)
      localStorage.setItem('internyay_user', JSON.stringify(merged))

      addToast('Email address updated successfully')
      cancelChangeEmail()

    } catch (e) {

      setAuthError(getErrorMessage(e, 'Could not confirm the code'))

    } finally {

      setEmailChangeConfirming(false)
    }
  }

  // Open the profile edit form pre-filled with the current details
  function startEditProfile() {

    setProfileForm({
      name:           currentUser?.name           || '',
      barNo:          currentUser?.barNo          || '',
      phone:          currentUser?.phone          || '',
      specialization: currentUser?.specialization || '',
      chamber:        currentUser?.chamber        || '',
      profilePicture: currentUser?.profilePicture || ''
    })

    setIsEditingProfile(true)
  }

  // Close the profile edit form without saving
  function cancelEditProfile() {
    setIsEditingProfile(false)
  }

  // Validate and save name, bar number, phone, specialization and chamber
  async function handleUpdateProfile() {

    if (!profileForm.name) {
      addToast('Name is required', 'error')
      return
    }

    const phoneError = indianPhoneError(profileForm.phone)
    if (phoneError) {
      addToast(phoneError, 'error')
      return
    }

    try {

      const updated = await authApi.updateProfile(profileForm)

      // Merge the backend's response into the user we already have so nothing is lost
      const merged = { ...currentUser, ...updated }

      setCurrentUser(merged)

      localStorage.setItem(
        'internyay_user',
        JSON.stringify(merged)
      )

      setIsEditingProfile(false)

      addToast('Profile updated successfully')

    } catch (e) {

      addToast(getErrorMessage(e, 'Could not update your profile — please try again'), 'error')
    }
  }

  // Save (or remove, if empty) the cropped profile photo
  async function handleUpdateProfilePicture(dataUrl) {

    try {

      const updated = await authApi.updateProfile({ profilePicture: dataUrl || '' })

      const merged = { ...currentUser, ...updated }

      setCurrentUser(merged)
      localStorage.setItem('internyay_user', JSON.stringify(merged))

      addToast(dataUrl ? 'Profile photo updated' : 'Profile photo removed')

    } catch (e) {

      addToast(getErrorMessage(e, 'Could not save the profile photo — please try again'), 'error')
    }
  }

  // Save (or remove) the UPI QR code image used on invoices
  async function handleUpdateQrCode(dataUrl) {

    try {

      const updated = await authApi.updateProfile({ qrImage: dataUrl || '' })

      const merged = { ...currentUser, ...updated }

      setCurrentUser(merged)
      localStorage.setItem('internyay_user', JSON.stringify(merged))

      addToast(dataUrl ? 'UPI QR code updated' : 'UPI QR code removed')

    } catch (e) {

      addToast(getErrorMessage(e, 'Could not save the QR code — please try again'), 'error')
    }
  }

  // Save (or remove) the UPI id shown on invoices
  async function handleUpdateUpiId(upiId) {

    try {

      const updated = await authApi.updateProfile({ upiId: upiId || '' })

      const merged = { ...currentUser, ...updated }

      setCurrentUser(merged)
      localStorage.setItem('internyay_user', JSON.stringify(merged))

      addToast(upiId ? 'UPI ID updated' : 'UPI ID removed')

    } catch (e) {
      addToast(getErrorMessage(e, 'Could not save the UPI ID — please try again'), 'error')
    }
  }

  // Open the change-password form
  function startChangePassword() {
    setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' })
    setIsChangingPassword(true)
  }

  // Close the change-password form and clear the typed passwords
  function cancelChangePassword() {
    setIsChangingPassword(false)
    setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' })
  }

  // Validate and change the password (needs the current password)
  async function handleChangePassword() {

    if (!passwordForm.oldPassword) {
      addToast('Enter your current password', 'error')
      return
    }

    const newPasswordProblem = passwordProblem(passwordForm.newPassword, currentUser?.email)
    if (newPasswordProblem) {
      addToast(newPasswordProblem, 'error')
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      addToast('Passwords do not match', 'error')
      return
    }

    try {
      await authApi.updateProfile({
        password: passwordForm.newPassword,
        oldPassword: passwordForm.oldPassword,
      })

      setIsChangingPassword(false)
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' })

      addToast('Password updated successfully')

    } catch (e) {
      addToast(getErrorMessage(e, 'Could not update password'), 'error')
    }
  }

  // Google sign-ups set their first password directly, no email code needed
  async function handleSetPassword() {

    const newPasswordProblem = passwordProblem(passwordForm.newPassword, currentUser?.email)
    if (newPasswordProblem) {
      addToast(newPasswordProblem, 'error')
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      addToast('Passwords do not match', 'error')
      return
    }

    try {
      const updated = await authApi.setPassword({
        password: passwordForm.newPassword,
        confirmPassword: passwordForm.confirmPassword,
      })

      // The account now has a password, so the normal change and reset options show up
      const merged = { ...currentUser, ...updated, passwordSet: true }
      setCurrentUser(merged)
      localStorage.setItem('internyay_user', JSON.stringify(merged))

      setIsChangingPassword(false)
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' })

      addToast('Password set successfully')

    } catch (e) {
      addToast(getErrorMessage(e, 'Could not set password'), 'error')
    }
  }

  // Deactivate the account (it can be reactivated by signing in again) and log out
  async function handleDeactivateAccount(password) {
    await authApi.deactivateAccount(password)
    handleLogout()
    addToast('Account deactivated — sign in again to reactivate it')
  }

  // Permanently delete the account and log out
  async function handleDeleteAccount(password) {
    await authApi.deleteAccount(password)
    handleLogout()
    addToast('Your account has been permanently deleted')
  }

  // Add a client to the case and give them a default role based on the case side and nature
  function selectClient(client) {
    // A case read from eCourts: the first client chosen tells which side we are on, when the client is named there
    const detected = newCaseForm.addMode === 'CNR' && caseClients.length === 0
      ? detectSide(newCaseForm.cnrDetail, client.name)
      : null
    const side = detected || newCaseForm.clientSide
    if (detected && detected !== newCaseForm.clientSide) changeClientSide(detected)

    setCaseClients(prev =>
      prev.some(c => Number(c.id) === Number(client.id)) ? prev : [...prev, client]
    )

    // A client picked from the names eCourts listed on our side takes that person's place; the others stay non-clients
    if (newCaseForm.addMode === 'CNR') {
      setNewCaseForm(f => {
        const gone = f.nonClients.find(n => sameName(n.name, client.name))
        if (!gone) return f
        return {
          ...f,
          nonClients: f.nonClients.filter(n => n !== gone),
          titleLead: f.titleLead === gone.key ? null : f.titleLead,
        }
      })
    }

    setCaseClientSubTypes(prev =>
      prev[client.id]
        ? prev
        : { ...prev, [client.id]: sideSubType(side, newCaseForm.caseNature) }
    )
  }

  // Make one of the case's clients the primary (main) client by moving them to the front of the list
  function setPrimaryCaseClient(id) {
    setCaseClients(prev => {
      const picked = prev.find(c => Number(c.id) === Number(id))
      if (!picked || prev[0] === picked) return prev
      return [picked, ...prev.filter(c => c !== picked)]
    })
    setNewCaseForm(f => (f.titleLead ? { ...f, titleLead: null } : f))
  }

  // Remove a client from the case and drop their role
  function removeCaseClient(id) {
    setCaseClients(prev => prev.filter(c => Number(c.id) !== Number(id)))
    setCaseClientSubTypes(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  // When the side or nature changes, update roles that were set automatically but keep roles the user typed in manually
  function remapClientSubTypes(side, nature) {
    setCaseClientSubTypes(prev =>
      Object.fromEntries(caseClients.map(cl => {
        const current = prev[cl.id] || ''
        return [cl.id, !current || AUTO_SUBTYPES.includes(current) ? sideSubType(side, nature) : current]
      }))
    )

    // Non-clients are on our side too, so their role follows the side in the same way
    setNewCaseForm(f => ({
      ...f,
      nonClients: f.nonClients.map(n =>
        !n.subType || AUTO_SUBTYPES.includes(n.subType) ? { ...n, subType: sideSubType(side, nature) } : n
      ),
    }))
  }

  // Switch our side of the case (complainant / accused) and refresh the client roles
  function changeClientSide(side) {
    if (side === newCaseForm.clientSide) return

    setNewCaseForm(f => {
      // A case read from eCourts: names still as eCourts listed them move to the other side with our client,
      // so both sides stay visible. Opposite parties that were edited, and non-clients that were edited or
      // marked as clients, stay where they are
      const plain = p => !p.fatherName && !p.address && !p.phone
      const sameNames = (list, from) => JSON.stringify(list.map(p => p.name)) === JSON.stringify(from.map(p => p.name))
      const byCnr = f.addMode === 'CNR' && f.cnrDetail

      const opponentsUntouched = byCnr && f.opponents.every(plain) && sameNames(f.opponents, cnrOpponents(f.cnrDetail, f.clientSide))
      const nonClientsUntouched = byCnr && f.nonClients.every(plain) && sameNames(f.nonClients, cnrOurSide(f.cnrDetail, f.clientSide))

      return {
        ...f,
        clientSide: side,
        ...(opponentsUntouched ? { opponents: cnrOpponents(f.cnrDetail, side), opponentLead: null } : {}),
        ...(nonClientsUntouched ? { nonClients: cnrOurSide(f.cnrDetail, side, f.caseNature), titleLead: null } : {}),
      }
    })
    remapClientSubTypes(side, newCaseForm.caseNature)
  }

  // Clear the add/edit case form and everything attached to it
  function resetCaseModal() {

    setNewCaseForm({ ...EMPTY_CASE_FORM })

    setEditingCaseId(null)
    setCaseClients([])
    setCaseClientSubTypes({})
  }

  // Fills the case form with an existing case and opens it for editing
  function openEditCase(c) {

    // Look up the full client record, falling back to what the case already has
    const findClient = (id, fallback) =>
      clients.find(cl => Number(cl.id) === Number(id)) || fallback

    // A case added by CNR may have no client at all: then there is no main client either
    const primary = c.clientId == null ? null : findClient(c.clientId, {
      id: c.clientId, name: c.clientName || 'Client', email: ''
    })
    const additional = (c.additionalClients || []).map(x => findClient(x.id, x))
    const caseClientList = [primary, ...additional].filter(Boolean)

    const { court, district } = splitCaseCourt(c)

    // Where the file number came from: auto (generated), panel (corporate panel client), legacy (typed in by hand earlier)
    // or new (the case has no file number yet, so one can still be typed)
    const fileNoOrigin =
      c.fileSeq != null ? 'auto'
        : hasCorporatePanelClient(caseClientList) ? 'panel'
          : (c.fileNo || '').trim() ? 'legacy'
            : 'new'

    const roles = c.clientSubTypes || {}
    // Older cases don't store the side, so work it out from the client's role
    const clientSide =
      c.clientSide ||
      sideOfSubType(roles[c.clientId] || roles[String(c.clientId)]) ||
      SIDE_COMPLAINANT

    // Older cases have no opposite party saved, so it is read from the title
    const formOpponents = (c.opponents?.length ? c.opponents : [{ name: guessOpposingParty(c.title, clientSide) }])
      .filter(o => (o.name || '').trim())
      .map(toFormParty)
    const formNonClients = nonClientsOf(c).map(toFormParty)

    // A saved title that differs from the one composed from the parties was typed by hand, so it is kept as it is
    const composedTitle = composeCaseTitle({
      clientSide,
      ourNames: caseClientList.map(x => x.name).concat(formNonClients.map(n => n.name)),
      opposingNames: formOpponents.map(o => o.name),
      withState: isPoliceChallan(c.reliefSought),
    })
    const savedTitle = (c.title || '').trim()

    // Copy every field of the case into the form, using safe defaults for missing values
    setNewCaseForm({
      title:          c.title          || '',
      titleEdited:    !!savedTitle && savedTitle !== composedTitle,
      clientSide,
      opponents: formOpponents,
      nonClients: formNonClients,
      caseNo:         c.caseNo         || '',
      fileNo:         c.fileNo         || '',
      fileSeq:        c.fileSeq        ?? null,
      fileNoOrigin,
      fileNoManual:   false,
      cnrNo:          c.cnrNo          || '',
      filingDate:     c.filingDate     || '',
      caseStage: c.caseStage || '',
      actsSections: c.actsSections || '',
      registrationDate: c.registrationDate || '',
      firstHearingDate: c.firstHearingDate || '',
      decisionDate: c.decisionDate || '',
      disposalNature: c.disposalNature || '',
      court,
      district,
      courtNo:        c.courtNo        || '',
      building:       c.building       || '',
      floor:          c.floor          || '',
      caseNature:     c.caseNature     || '',
      reliefSought:   c.reliefSought   || '',
      caseType:       c.caseType       || '',
      firNo:          c.firNo          || '',
      firSection:     c.firSection     || '',
      policeStation:  c.policeStation  || '',
      chequeNo:       c.chequeNo       || '',
      chequeDate:     c.chequeDate     || '',
      memoDate:       c.memoDate       || '',
      bouncingReason: c.bouncingReason || '',
      claimAmount:    c.claimAmount    ?? '',
      noticeDate:     c.noticeDate     || '',
      status:         c.status         || 'Pending',
      description:    c.description    || '',
      feeType:        c.feeType        || 'TOTAL',
      totalFeeAmount: c.totalFeeAmount ?? '',
      totalFeeAmountDate: c.totalFeeAmountDate || '',
      totalFeePaid:   !!c.totalFeePaid,
      initialAmount:  c.initialAmount  ?? '',
      initialAmountDate: c.initialAmountDate || '',
      initialPaid:    !!c.initialPaid,
      dateWiseAmount: c.dateWiseAmount ?? '',
      hearingFees:    Array.isArray(c.hearingFees) ? c.hearingFees : [],
      stageFees:            Array.isArray(c.stageFees) ? c.stageFees : []
    })

    setEditingCaseId(c.id)
    setCaseClients(caseClientList)
    setCaseClientSubTypes({ ...(c.clientSubTypes || {}) })

    setSelectedCase(null)
    setShowAddCase(true)
  }

  // Add an empty hearing fee row to the case form
  function addHearingFeeRow() {
    setNewCaseForm(f => ({
      ...f,
      hearingFees: [
        ...f.hearingFees,
        { id: Date.now(), date: '', paid: false }
      ]
    }))
  }

  // Change one field of a hearing fee row
  function updateHearingFeeRow(id, field, value) {
    setNewCaseForm(f => ({
      ...f,
      hearingFees: f.hearingFees.map(row =>
        row.id === id ? { ...row, [field]: value } : row
      )
    }))
  }

  // Delete a hearing fee row
  function removeHearingFeeRow(id) {
    setNewCaseForm(f => ({
      ...f,
      hearingFees: f.hearingFees.filter(row => row.id !== id)
    }))
  }

  // Opens the fee-only modal for a case (optionally focused on a hearing date, or read-only)
  function openEditFee(c, { focusDate = null, readOnly = false } = {}) {
    setFeeOnlyForm({
      feeType:        c.feeType        || 'TOTAL',
      totalFeeAmount: c.totalFeeAmount ?? '',
      totalFeeAmountDate: c.totalFeeAmountDate || '',
      totalFeePaid:   !!c.totalFeePaid,
      initialAmount:  c.initialAmount  ?? '',
      initialAmountDate: c.initialAmountDate || '',
      initialPaid:    !!c.initialPaid,
      dateWiseAmount: c.dateWiseAmount ?? '',
      hearingFees:    Array.isArray(c.hearingFees) ? c.hearingFees : [],
      stageFees:            Array.isArray(c.stageFees) ? c.stageFees : []
    })

    setFeeOnlyFocusDate(focusDate)
    setFeeOnlyReadOnly(readOnly)
    setFeeOnlyCaseId(c.id)
  }

  // Close the fee modal and reset it
  function closeFeeOnly() {
    setFeeOnlyCaseId(null)
    setFeeOnlyForm({ ...EMPTY_FEE_FORM })
    setFeeOnlyFocusDate(null)
    setFeeOnlyReadOnly(false)
  }

  // Fee modal: add an empty hearing fee row
  function addFeeOnlyHearingRow() {
    setFeeOnlyForm(f => ({
      ...f,
      hearingFees: [
        ...f.hearingFees,
        { id: Date.now(), date: '', paid: false }
      ]
    }))
  }

  // Fee modal: change one field of a hearing fee row
  function updateFeeOnlyHearingRow(id, field, value) {
    setFeeOnlyForm(f => ({
      ...f,
      hearingFees: f.hearingFees.map(row =>
        row.id === id ? { ...row, [field]: value } : row
      )
    }))
  }

  // Fee modal: delete a hearing fee row
  function removeFeeOnlyHearingRow(id) {
    setFeeOnlyForm(f => ({
      ...f,
      hearingFees: f.hearingFees.filter(row => row.id !== id)
    }))
  }

  // Save the fee changes through the normal case update (empty rows are cleaned first)
  async function handleSaveFeeOnly() {
    if (!feeOnlyCaseId || feeOnlyReadOnly) {
      return
    }

    const { additionalFees: _dropped, ...feeOnlyFields } = feeOnlyForm

    await handleUpdateCase(feeOnlyCaseId, {
      ...feeOnlyFields,
      stageFees: cleanStageFees(feeOnlyForm.stageFees),
      hearingFees: cleanHearingFees(feeOnlyForm.hearingFees)
    })

    closeFeeOnly()
  }

  // Returns the first problem found in the case form, or null if everything required is filled
  function caseFormError() {

    // A case added by CNR, or a case saved without a client, needs neither a client nor opposite parties;
    // every other case needs both
    const optional = (!editingCaseId && newCaseForm.addMode === 'CNR')
      || (!!editingCaseId && cases.find(c => c.id === editingCaseId)?.clientId == null)

    if (!caseClientId && !optional) {
      return 'Please select the client for this case'
    }

    if (newCaseForm.opponents.length === 0 && !optional) {
      return newCaseForm.clientSide === SIDE_ACCUSED
        ? 'Please enter the Complainant/Petitioner/Plaintiff'
        : 'Please enter the Accused/Respondent/Defendant'
    }

    // A party's phone is optional but must be valid if entered
    const partyPhones = [
      ...newCaseForm.opponents.map(p => ['Opposite party', p]),
      ...newCaseForm.nonClients.map(p => ['Non-client', p]),
    ]
    for (const [who, p] of partyPhones) {
      const phoneProblem = indianPhoneError(p.phone, { label: `${p.name}'s phone number` })
      if (phoneProblem) return `${who}: ${phoneProblem}`
    }

    // The case number is required, except for a Juvenile Justice Board case
    if (!newCaseForm.caseNo && !isJuvenileBoard(newCaseForm.court)) {
      return 'Please fill all required fields'
    }

    // Every case, new or old, added or edited, needs its 16-character CNR number, except a Juvenile Justice Board case
    // (it has none); the case number above is still required
    if (!isJuvenileBoard(newCaseForm.court)
      && !/^[A-Z0-9]{16}$/.test((newCaseForm.cnrNo || '').toUpperCase().replace(/[\s-]/g, ''))) {
      return 'Enter the 16-character CNR number'
    }

    if (!newCaseForm.court) {
      return 'Please select a court'
    }

    if (!isHighCourt(newCaseForm.court) && !newCaseForm.district) {
      return 'Please select a district'
    }

    return null
  }

  // Converts the form state into the object the backend expects
  function buildCasePayload() {

    const payload = {
      ...newCaseForm,

      // Title is generated from the client names and the opposite party, unless the advocate typed their own.
      // A case added by CNR takes the title from eCourts as it is
      title: newCaseForm.titleEdited && (newCaseForm.title || '').trim()
        ? newCaseForm.title.trim()
        : (!editingCaseId && newCaseForm.addMode === 'CNR' && cnrCaseTitle(newCaseForm.cnrDetail)) || composeCaseTitle({
          clientSide: newCaseForm.clientSide,
          ourNames: titleOurNames(caseClients, newCaseForm.nonClients, newCaseForm.titleLead),
          opposingNames: titleOpposingNames(newCaseForm.opponents, newCaseForm.opponentLead),
          withState: isPoliceChallan(newCaseForm.reliefSought)
        }),

      opponents: newCaseForm.opponents.map(toRequestParty),
      nonClients: newCaseForm.nonClients.map(toRequestParty),

      // First client is the main one, the rest are sent as additional clients with their roles
      clientId: caseClientId,
      additionalClientIds: caseClients.slice(1).map(c => c.id),

      clientSubTypes: Object.fromEntries(
        caseClients.map(c => [c.id, caseClientSubTypes[c.id] || ''])
      )
    }

    delete payload.titleEdited
    delete payload.titleLead
    delete payload.opponentLead
    delete payload.cnrDetail

    // A Juvenile Justice Board case has no CNR (the case number is optional) and is always added by hand
    if (isJuvenileBoard(newCaseForm.court)) {
      payload.cnrNo = ''
      payload.caseNo = (newCaseForm.caseNo || '').trim()
      payload.addMode = 'MANUAL'
    }
    if (payload.addMode !== 'CNR') delete payload.lookupToken

    // How the case was added only matters when it is created
    if (editingCaseId) {
      delete payload.addMode
      delete payload.lookupToken
      // The next hearing is not part of Edit Case; it changes only through the Next Hearing Update button
      delete payload.nextHearing
    }

    // Remove blank fee rows before saving
    payload.hearingFees = cleanHearingFees(newCaseForm.hearingFees)
    payload.stageFees = cleanStageFees(newCaseForm.stageFees)
    // Additional fees have been removed, so they are never sent (saved ones are left untouched)
    delete payload.additionalFees

    // Panel clients type their file number and don't use the automatic sequence. For everyone else the field starts with the
    // suggested next number; when the advocate types their own, a plain number (25) joins the sequence on the server and
    // anything else (FILE/2024/045) is kept as typed. An empty field means the next free number
    const typedFileNo = (newCaseForm.fileNo || '').trim()
    if (hasCorporatePanelClient(caseClients)) {
      payload.fileSeq = null
    } else if (newCaseForm.fileNoOrigin === 'new' && newCaseForm.fileNoManual && typedFileNo) {
      payload.fileNo = typedFileNo
      payload.fileSeq = /^[1-9]\d{0,8}$/.test(typedFileNo) ? Number(typedFileNo) : null
    } else {
      // Nothing typed: the suggested number is only a request, the server gives the next free one if it was taken
      if (newCaseForm.fileNoOrigin === 'new') payload.fileNo = ''
      payload.fileSeq = newCaseForm.fileSeq ?? null
    }
    delete payload.fileNoOrigin
    delete payload.fileNoManual

    // FIR details only apply to police challan cases
    if (!isPoliceChallan(newCaseForm.reliefSought)) {
      payload.firNo = ''
      payload.firSection = ''
      payload.policeStation = ''
    }

    // Cheque details only apply to Sec 138 NI Act complaints
    if (!isNiAct138Complaint(newCaseForm.caseType)) {
      payload.chequeNo = ''
      payload.chequeDate = ''
      payload.memoDate = ''
      payload.bouncingReason = ''
      payload.claimAmount = ''
      payload.noticeDate = ''
    }

    // Corporate panel cases are always stage wise; stage wise isn't allowed for normal cases
    if (caseClients.length > 0) {
      const panel = hasCorporatePanelClient(caseClients)
      if (panel) payload.feeType = 'STAGEWISE'
      else if (payload.feeType === 'STAGEWISE') payload.feeType = 'TOTAL'
    }

    // Associates must never send fee details
    if (isAssociate) {
      ;['feeType', 'totalFeeAmount', 'totalFeePaid',
        'initialAmount', 'initialPaid', 'dateWiseAmount', 'hearingFees',
        'stageFees']
        .forEach(k => { delete payload[k] })
    }

    return payload
  }

  // Validate the form, create the case in the backend and add it to the list
  async function handleAddCase() {

    const formError = caseFormError()

    if (formError) {
      addToast(formError, 'error')
      return
    }

    try {

      const created =
        await casesApi.create({ ...buildCasePayload(), status: 'Pending' })

      setCases(prev => [
        ...prev,
        {
          ...newCaseForm,
          ...created,
          documents:
            created.documents || []
        }
      ])

      setShowAddCase(false)

      resetCaseModal()

      // The case arrives with its past hearing dates when eCourts had them, so the hearing lists are loaded again
      if (created?.id) bumpHearings(created.id)

      addToast(
        newCaseForm.addMode === 'CNR'
          ? 'Case added with its hearing dates from eCourts'
          : 'Case added successfully'
      )

    } catch (e) {

      addToast(
        getErrorMessage(e, 'Failed to add case'),
        'error'
      )
    }
  }

  // Delete a case; if the backend is unreachable it is still removed from the screen
  async function handleDeleteCase(id) {

    try {

      await casesApi.remove(id)

      setCases(prev =>
        prev.filter(c => c.id !== id)
      )

      if (selectedCase?.id === id) {
        setSelectedCase(null)
      }

      addToast('Case deleted')

    } catch (e) {

      // The server answered and refused: keep the case and say why
      if (e?.status > 0) {
        addToast(getErrorMessage(e, 'Could not delete the case'), 'error')
        return
      }

      // Server not reachable: remove locally only
      setCases(prev =>
        prev.filter(c => c.id !== id)
      )

      if (selectedCase?.id === id) {
        setSelectedCase(null)
      }

      addToast('Case deleted locally')
    }
  }

  // Update a case in the backend and in local state; returns true/false so callers know if it was saved
  async function handleUpdateCase(id, updates) {

    // Case before the update, used to detect hearing date and status changes
    const current = cases.find(c => c.id === id)
    // Block hearing dates that fall on a Sunday or a no-hearing date
    if (updates?.nextHearing && updates.nextHearing !== current?.nextHearing) {
      const problem = hearingDateProblem(updates.nextHearing, noHearingDates, ds => dayFullProblem(ds, id))
      if (problem) {
        addToast(`${problem} — pick another date`, 'error')
        return false
      }
    }

    try {

      const updated =
        await casesApi.update(
          id,
          updates
        )

      setCases(prev =>
        prev.map(c =>
          c.id === id
            ? {
                ...c,
                ...updated
              }
            : c
        )
      )

      // A changed next hearing date adds the old date to the hearing history, so reload it
      if (updates?.nextHearing && updates.nextHearing !== current?.nextHearing) {
        bumpHearings(id)
      }

      // Withdrawing (or reopening) a case changes its hearing records, so reload them
      if (updates?.status && (updates.status === WITHDRAWN_STATUS || current?.status === WITHDRAWN_STATUS)) {
        bumpHearings(id)
      }

      addToast('Case updated')
      return true

    } catch (e) {

      // Any answer from the server (date rules, plan limits, validation) is shown, not hidden by the local save below
      if (e?.status > 0) {
        addToast(getErrorMessage(e, 'Could not save the case'), 'error')
        return false
      }

      // Backend unreachable: keep the change locally so the user doesn't lose their work
      setCases(prev =>
        prev.map(c =>
          c.id === id
            ? {
                ...c,
                ...updates,
                // Withdrawing clears the next hearing but remembers it, so reopening the case brings it back
                ...(updates?.status === WITHDRAWN_STATUS && c.status !== WITHDRAWN_STATUS
                  ? { nextHearing: null, withdrawnHearing: c.nextHearing || c.withdrawnHearing || null }
                  : {}),
                ...(c.status === WITHDRAWN_STATUS && updates?.status && updates.status !== WITHDRAWN_STATUS
                    && !updates.nextHearing && !c.nextHearing && c.withdrawnHearing
                  ? { nextHearing: c.withdrawnHearing, withdrawnHearing: null }
                  : {})
              }
            : c
        )
      )

      addToast('Case saved locally')
      return true
    }
  }

  // Save button of the case modal: update the case being edited, or add a new one
  async function handleSaveCase() {

    if (editingCaseId) {

      const formError = caseFormError()

      if (formError) {
        addToast(formError, 'error')
        return
      }

      const before = cases.find(c => c.id === editingCaseId)
      // Ask for confirmation before marking a case decided / withdrawn
      const question = statusChangeQuestion(
        before, newCaseForm.status, before?.nextHearing
      )
      if (question && !(await confirmDialog({ title: 'Change case status?', message: question, confirmLabel: 'Yes, continue' }))) return

      const saved = await handleUpdateCase(editingCaseId, buildCasePayload())

      if (saved === false) return

      setShowAddCase(false)
      resetCaseModal()

    } else {

      await handleAddCase()
    }
  }

  // Reload the documents of one case after hearing orders were added or removed
  async function refreshCaseDocuments(caseId) {
    try {
      const docs = await casesApi.getDocs(caseId)
      setCases(prev =>
        prev.map(c =>
          c.id === caseId ? { ...c, documents: Array.isArray(docs) ? docs : [] } : c
        )
      )
    } catch (e) {
      console.warn('Could not refresh the case documents:', e?.message || e)
    }
  }

  // Call after any hearing change so lists, records and documents refresh
  const bumpHearings = useCallback((caseId) => {
    setHearingsVersion(v => v + 1)
    fetchHearingRecords()
    if (caseId) refreshCaseDocuments(caseId)
  }, [])

  // Shows a case's next hearing date (or blank) everywhere at once, e.g. after its hearing entry was deleted
  function syncCaseNextHearing(caseId, nextHearing) {
    const date = nextHearing || null
    const apply = c => (c && c.id === caseId
      ? { ...c, nextHearing: date, causeListNo: null, listingDate: null }
      : c)
    setCases(prev => prev.map(apply))
    setSelectedCase(prev => apply(prev))
  }

  // Open the "next hearing" modal for a case
  function openNextHearing(c) {
    if (c?.id) setNextHearingCaseId(c.id)
  }

  // Close the "next hearing" modal
  function closeNextHearing() {
    setNextHearingCaseId(null)
  }

  // Records how the last hearing went (notes, optional order) and sets the next hearing date
  async function handleSaveNextHearing({
    caseId, closingDate, notes = '', nextHearing, orderFile, fetchOrderFromEcourts = false,
  }) {

    try {

      const res = await casesApi.updateNextHearing(caseId, {
        closingDate,
        notes,
        nextHearing,
      })

      // The order is attached to the hearing record that was just created
      if (orderFile) {
        if (res?.recorded?.id) {
          await hearingsApi.uploadOrder(res.recorded.id, orderFile)
        } else {
          addToast('Set the hearing date the order belongs to, then attach it', 'error')
        }
      }

      // Or the order is fetched from eCourts for that hearing record
      if (fetchOrderFromEcourts) {
        if (res?.recorded?.id) {
          try {
            const got = await hearingsApi.fetchOrder(res.recorded.id)
            if (got?.status === 'FETCHED' || got?.status === 'STORED') {
              addToast('Order ready')
            } else {
              addToast(got?.message || 'The order is not available from eCourts yet', 'error')
            }
          } catch (e) {
            addToast(getErrorMessage(e, 'Could not get the order from eCourts'), 'error')
          }
        } else {
          addToast('Set the hearing date the order belongs to, then get the order', 'error')
        }
      }

      // Show the new hearing date and clear the old cause list details
      if (res?.nextHearing !== undefined) {
        setCases(prev =>
          prev.map(c =>
            c.id === caseId
              ? { ...c, nextHearing: res.nextHearing, causeListNo: null, listingDate: null }
              : c
          )
        )
      }

      bumpHearings(caseId)

      addToast(
        nextHearing
          ? 'Next hearing date updated'
          : 'Hearing recorded'
      )

    } catch (e) {
      addToast(getErrorMessage(e, 'Could not update the hearing'), 'error')
    }
  }

  // "Update next date" button: asks eCourts for the new date of a case whose hearing date is over. When it moves,
  // the card shows the new date (and the button goes away); when eCourts has nothing new yet, the case is left as it is
  async function syncNextHearing(caseId) {
    try {
      const res = await casesApi.syncNextHearing(caseId)

      if (res?.status === 'UPDATED' || res?.status === 'CLOSED') {
        setCases(prev =>
          prev.map(c =>
            c.id === caseId
              ? { ...c, nextHearing: res.nextHearing ?? null, status: res.caseStatus || c.status, causeListNo: null, listingDate: null }
              : c
          )
        )
        bumpHearings(caseId)
        addToast(res.message || 'Next hearing date updated')
        return true
      }

      addToast(res?.message || 'eCourts has not given a new date yet', 'error')
      return false

    } catch (e) {
      addToast(getErrorMessage(e, 'Could not check eCourts'), 'error')
      return false
    }
  }

  // Starts marking a non-client party as a client: the Register Client form opens with their details filled in.
  // caseId is the saved case they are on, or null when they are in the case form that is open right now
  function startMarkAsClient(nonClient, caseId = null) {
    setMarkTarget({ caseId, nonClient })
    setNewClientForm({
      name: nonClient.name || '',
      email: '',
      whatsappPhone: nonClient.phone || '',
      additionalPhone: '',
      address: nonClient.address || '',
      type: 'INDIVIDUAL',
      customLabel: '',
      profilePicture: ''
    })
    setShowAddClient('markNonClient')
  }

  // The non-client has been registered as a client: the client takes their place on the case
  async function finishMarkAsClient(created) {
    const { caseId, nonClient } = markTarget
    setMarkTarget(null)

    // In the case form: the client replaces the non-client there and is saved together with the case
    if (caseId == null) {
      setNewCaseForm(f => ({ ...f, nonClients: f.nonClients.filter(n => n.key !== nonClient.key) }))
      selectClient(created)
      if (nonClient.subType) setCaseClientSubTypes(prev => ({ ...prev, [created.id]: nonClient.subType }))
      return
    }

    // On a saved case: the case is updated right away
    const c = cases.find(x => x.id === caseId)
    if (!c) return

    await handleUpdateCase(caseId, {
      additionalClientIds: [...(c.additionalClients || []).map(x => x.id), created.id],
      clientSubTypes: nonClient.subType ? { [created.id]: nonClient.subType } : undefined,
      nonClients: nonClientsOf(c).filter(n => n.id !== nonClient.id).map(toRequestParty),
    })
  }

  // Validates and creates a new client; when it was opened from the case form the new client is selected for the case
  async function handleAddClient(
    fromCase = false
  ) {

    if (!newClientForm.name) {

      addToast(
        'Client name is required',
        'error'
      )

      return
    }

    // Email is optional, but if given it must be valid
    const clientEmailError = emailError(newClientForm.email)
    if (clientEmailError) {
      addToast(clientEmailError, 'error')
      return
    }

    // WhatsApp number is optional (reminders are only sent when one is saved), but must be valid when given
    const whatsappPhoneError = indianPhoneError(
      newClientForm.whatsappPhone,
      { label: 'WhatsApp phone number' }
    )
    if (whatsappPhoneError) {
      addToast(whatsappPhoneError, 'error')
      return
    }

    // Second phone number is optional
    const additionalPhoneError = indianPhoneError(newClientForm.additionalPhone)
    if (additionalPhoneError) {
      addToast(additionalPhoneError, 'error')
      return
    }

    try {

      const created =
        await clientsApi.create(
          newClientForm
        )

      setClients(prev => [
        ...prev,
        created
      ])

      if (showAddClient === 'markNonClient' && markTarget) {

        await finishMarkAsClient(created)

      } else if (fromCase) {

        selectClient(created)
      }

      setShowAddClient(false)

      setNewClientForm({
        name: '',
        email: '',
        whatsappPhone: '',
        additionalPhone: '',
        address: '',
        type: 'INDIVIDUAL',
        customLabel: '',
        profilePicture: ''
      })

      addToast(
        'Client registered successfully'
      )

    } catch (e) {

      addToast(
        getErrorMessage(e, 'Failed to add client'),
        'error'
      )
    }
  }

  // Update a client; falls back to saving locally if the backend call fails
  async function handleUpdateClient(id, updates) {

    if (Object.prototype.hasOwnProperty.call(updates, 'whatsappPhone')) {
      const whatsappPhoneError = indianPhoneError(
        updates.whatsappPhone,
        { label: 'WhatsApp phone number' }
      )
      if (whatsappPhoneError) {
        addToast(whatsappPhoneError, 'error')
        return
      }
    }

    const additionalPhoneError = indianPhoneError(updates.additionalPhone)
    if (additionalPhoneError) {
      addToast(additionalPhoneError, 'error')
      return
    }

    // Email is optional, but if given it must be valid
    if (Object.prototype.hasOwnProperty.call(updates, 'email')) {
      const updateEmailError = emailError(updates.email)
      if (updateEmailError) {
        addToast(updateEmailError, 'error')
        return
      }
    }

    // Name before the change, used to fix the titles of this client's cases
    const oldName = clients.find(c => c.id === id)?.name

    try {

      const updated = await clientsApi.update(id, updates)

      // The backend renames the client in case titles; mirror that on the screen straight away
      if (oldName && updated?.name && updated.name !== oldName) {
        setCases(prev => prev.map(c => caseHasClient(c, id)
          ? { ...c, title: renameInCaseTitle(c.title, oldName, updated.name) }
          : c))
        setSelectedCase(prev => prev && caseHasClient(prev, id)
          ? { ...prev, title: renameInCaseTitle(prev.title, oldName, updated.name) }
          : prev)
      }

      setClients(prev =>
        prev.map(c =>
          c.id === id ? { ...c, ...updated } : c
        )
      )

      // Keep the open client modal in sync with the list
      setSelectedClient(prev =>
        prev && prev.id === id ? { ...prev, ...updated } : prev
      )

      addToast('Client updated successfully')

    } catch (e) {

      // The server answered and refused: show why and keep the old values
      if (e?.status > 0) {
        addToast(getErrorMessage(e, 'Could not save the client'), 'error')
        return
      }

      // Server not reachable: keep the change locally
      setClients(prev =>
        prev.map(c =>
          c.id === id ? { ...c, ...updates } : c
        )
      )

      setSelectedClient(prev =>
        prev && prev.id === id ? { ...prev, ...updates } : prev
      )

      addToast('Client saved locally')
    }
  }

  // Delete a client (also removed locally if the backend is unreachable)
  async function handleDeleteClient(id) {

    try {

      await clientsApi.remove(id)

      setClients(prev =>
        prev.filter(c => c.id !== id)
      )

      if (selectedClient?.id === id) {
        setSelectedClient(null)
      }

      addToast('Client deleted')

    } catch (e) {

      // The server answered and refused (for example the client still has cases): keep the client and say why
      if (e?.status > 0) {
        addToast(getErrorMessage(e, 'Could not delete the client'), 'error')
        return
      }

      // Server not reachable: remove locally only
      setClients(prev =>
        prev.filter(c => c.id !== id)
      )

      if (selectedClient?.id === id) {
        setSelectedClient(null)
      }

      addToast('Client deleted locally')
    }
  }

  // Upload a document to the selected case
  async function handleUploadDoc() {

    if (
      !docName.trim() ||
      !uploadDocCaseId
    ) {
      return
    }

    const resolvedType = docType

    try {

      const formData =
        new FormData()

      if (
        fileRef.current?.files[0]
      ) {

        formData.append(
          'file',
          fileRef.current.files[0]
        )
      }

      formData.append(
        'name',
        docName.trim()
      )

      formData.append(
        'type',
        resolvedType
      )

      const uploaded =
        await casesApi.uploadDoc(
          uploadDocCaseId,
          formData
        )

      setCases(prev =>
        prev.map(c =>
          c.id === uploadDocCaseId
            ? {
                ...c,
                documents: [
                  ...(c.documents || []),
                  { ...uploaded, type: uploaded.type || resolvedType }
                ]
              }
            : c
        )
      )

      setUploadDocCaseId(null)
      setDocName('')
      setDocType('')

      addToast(
        'Document uploaded'
      )

    } catch (e) {

      addToast(
        getErrorMessage(e, 'Upload failed — document not saved'),
        'error'
      )
    }
  }

  // Delete a case document and remove it from the case in state
  async function handleDeleteDocument(caseId, docId) {

    try {
      await documentsApi.remove(docId)
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not delete document'), 'error')
      return
    }

    setCases(prev =>
      prev.map(c =>
        c.id === caseId
          ? {
              ...c,
              documents: (c.documents || []).filter(
                d => d.id !== docId
              )
            }
          : c
      )
    )

    setHearingsVersion(v => v + 1)

    addToast('Document deleted')
  }

  // Download a document to the user's computer
  async function handleDownloadDocument(doc) {

    if (!doc?.id) return

    try {
      await documentsApi.download(
        doc.id,
        downloadNameOf(doc)
      )
    } catch (e) {
      addToast(getErrorMessage(e, 'Download failed'), 'error')
    }
  }

  // Open a document in the in-app preview modal
  async function handleViewDocument(doc) {

    if (!doc?.id) return

    try {
      const url = await documentsApi.previewBlob(doc.id)
      setDocPreview({ url, title: doc.name || doc.fileName || 'Document' })
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not open document'), 'error')
    }
  }

  // Close the preview and free the temporary blob URL
  function closeDocPreview() {
    if (docPreview) URL.revokeObjectURL(docPreview.url)
    setDocPreview(null)
  }

  // Upload a document to the selected client
  async function handleUploadClientDoc() {

    if (
      !clientDocName.trim() ||
      !clientDocType ||
      !uploadDocClientId
    ) {
      return
    }

    const resolvedType =
      clientDocType === 'Other (Type Manually)'
        ? (clientDocTypeCustom || 'Other')
        : clientDocType

    try {

      const formData = new FormData()

      if (clientFileRef.current?.files[0]) {
        formData.append('file', clientFileRef.current.files[0])
      }

      formData.append('name', clientDocName.trim())
      formData.append('type', resolvedType)

      const uploaded = await clientsApi.uploadDoc(
        uploadDocClientId,
        formData
      )

      // Make sure the new document has a type so it shows in the right group
      const withType = { ...uploaded, type: uploaded.type || resolvedType }

      setClients(prev =>
        prev.map(cl =>
          cl.id === uploadDocClientId
            ? { ...cl, documents: [...(cl.documents || []), withType] }
            : cl
        )
      )

      // Keep the open client modal up to date as well
      setSelectedClient(prev =>
        prev && prev.id === uploadDocClientId
          ? { ...prev, documents: [...(prev.documents || []), withType] }
          : prev
      )

      setUploadDocClientId(null)
      setClientDocName('')
      setClientDocType('')
      setClientDocTypeCustom('')

      addToast('Document uploaded')

    } catch (e) {

      addToast(
        getErrorMessage(e, 'Upload failed — document not saved'),
        'error'
      )
    }
  }

  // Delete a client document
  async function handleDeleteClientDocument(clientId, docId) {

    try {
      await documentsApi.remove(docId)
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not delete document'), 'error')
      return
    }

    setClients(prev =>
      prev.map(cl =>
        cl.id === clientId
          ? { ...cl, documents: (cl.documents || []).filter(d => d.id !== docId) }
          : cl
      )
    )

    setSelectedClient(prev =>
      prev && prev.id === clientId
        ? { ...prev, documents: (prev.documents || []).filter(d => d.id !== docId) }
        : prev
    )

    addToast('Document deleted')
  }

  // Upload one of the advocate's own documents (not linked to a case or client)
  async function handleUploadAdvocateDoc() {

    if (!advocateDocName.trim()) return

    const resolvedType = 'Other'

    try {

      const formData = new FormData()

      if (advocateFileRef.current?.files[0]) {
        formData.append('file', advocateFileRef.current.files[0])
      }

      formData.append('name', advocateDocName.trim())
      formData.append('type', resolvedType)

      const uploaded = await documentsApi.uploadAdvocate(formData)

      setAdvocateDocs(prev => [
        ...prev,
        { ...uploaded, type: uploaded.type || resolvedType }
      ])

      setUploadDocAdvocate(false)
      setAdvocateDocName('')

      addToast('Document uploaded')

    } catch (e) {
      addToast(getErrorMessage(e, 'Upload failed — document not saved'), 'error')
    }
  }

  // Rename a document of any kind (case, client, advocate or evidence). Returns true when it was saved.
  // Only the name shown changes, the file and its type stay as they are
  async function handleRenameDocument(doc, newName) {

    const name = String(newName || '').trim()
    if (!doc?.id || !name) return false

    try {
      const saved = await documentsApi.rename(doc.id, name)
      const shown = saved?.name || name
      const rename = d => (d.id === doc.id ? { ...d, name: shown } : d)

      setCases(prev => prev.map(c => (c.documents || []).some(d => d.id === doc.id) ? { ...c, documents: c.documents.map(rename) } : c))
      setClients(prev => prev.map(cl => (cl.documents || []).some(d => d.id === doc.id) ? { ...cl, documents: cl.documents.map(rename) } : cl))
      setSelectedClient(prev => prev && (prev.documents || []).some(d => d.id === doc.id) ? { ...prev, documents: prev.documents.map(rename) } : prev)
      setAdvocateDocs(prev => prev.map(rename))

      addToast('Document renamed')
      return true
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not rename the document'), 'error')
      return false
    }
  }

  // Delete an advocate document
  async function handleDeleteAdvocateDoc(docId) {

    try {
      await documentsApi.remove(docId)
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not delete document'), 'error')
      return
    }

    setAdvocateDocs(prev => prev.filter(d => d.id !== docId))

    addToast('Document deleted')
  }

  // Upload an evidence file for a client or a case; it's stored as a document with type "Evidence - Client/Case"
  async function handleUploadEvidence() {

    if (
      !evidenceName.trim() ||
      !['Client', 'Case'].includes(evidenceCategory) ||
      !evidenceTargetId
    ) {
      return
    }

    const resolvedType = `Evidence - ${evidenceCategory}`

    try {

      const formData = new FormData()

      if (evidenceFileRef.current?.files[0]) {
        formData.append('file', evidenceFileRef.current.files[0])
      }

      formData.append('name', evidenceName.trim())
      formData.append('type', resolvedType)

      // Evidence for a client goes into the client's documents
      if (evidenceCategory === 'Client') {

        const uploaded = await clientsApi.uploadDoc(evidenceTargetId, formData)
        const withType = { ...uploaded, type: uploaded.type || resolvedType }

        setClients(prev =>
          prev.map(cl =>
            cl.id === evidenceTargetId
              ? { ...cl, documents: [...(cl.documents || []), withType] }
              : cl
          )
        )

      // Evidence for a case goes into the case's documents
      } else if (evidenceCategory === 'Case') {

        const uploaded = await casesApi.uploadDoc(evidenceTargetId, formData)
        const withType = { ...uploaded, type: uploaded.type || resolvedType }

        setCases(prev =>
          prev.map(c =>
            c.id === evidenceTargetId
              ? { ...c, documents: [...(c.documents || []), withType] }
              : c
          )
        )

      }

      setShowUploadEvidence(false)
      setEvidenceCategory('')
      setEvidenceTargetId(null)
      setEvidenceName('')

      addToast('Evidence uploaded')

    } catch (e) {
      addToast(getErrorMessage(e, 'Upload failed — evidence not saved'), 'error')
    }
  }

  // Add a task; if the backend call fails it is kept locally
  async function addTodo(todo) {

    try {

      const created =
        await tasksApi.create(todo)

      setTodos(prev => [
        ...prev,
        created
      ])

      addToast('Task added')

    } catch (e) {

      // The server answered and refused: show why, don't add a task that was never saved
      if (e?.status > 0) {
        addToast(getErrorMessage(e, 'Could not add the task'), 'error')
        return
      }

      // Server not reachable: keep the task locally
      setTodos(prev => [
        ...prev,
        {
          ...todo,
          id: Date.now()
        }
      ])

      addToast(
        'Task added locally'
      )
    }
  }

  // Update a task (title, status, due date...)
  async function updateTodo(
    id,
    updates
  ) {

    try {

      const updated =
        await tasksApi.update(
          id,
          updates
        )

      setTodos(prev =>
        prev.map(t =>
          t.id === id
            ? {
                ...t,
                ...updated
              }
            : t
        )
      )

    } catch (e) {

      // The server answered and refused: show why and keep the old values
      if (e?.status > 0) {
        addToast(getErrorMessage(e, 'Could not update the task'), 'error')
        return
      }

      // Server not reachable: keep the change locally
      setTodos(prev =>
        prev.map(t =>
          t.id === id
            ? {
                ...t,
                ...updates
              }
            : t
        )
      )
    }
  }

  // Delete a task (removed locally even if the backend is unreachable)
  async function deleteTodo(id) {

    try {

      await tasksApi.remove(id)

      setTodos(prev =>
        prev.filter(t => t.id !== id)
      )

      addToast('Task deleted')

    } catch (e) {

      // The server answered and refused: keep the task and say why
      if (e?.status > 0) {
        addToast(getErrorMessage(e, 'Could not delete the task'), 'error')
        return
      }

      // Server not reachable: remove locally only
      setTodos(prev =>
        prev.filter(t => t.id !== id)
      )

      addToast('Task deleted locally')
    }
  }

  // Total / paid / due and the fee items of a case (calculated in feeUtils)
  function getCaseFeeSummary(c) {
    return caseFeeSummary(c)
  }

  // Flip the paid status of one fee item of a case, depending on which kind of fee it is
  async function toggleFeePaid(caseId, itemKey) {

    const c = cases.find(x => x.id === caseId)

    if (!c) {
      return
    }

    let updates = {}

    // One-time total fee
    if (itemKey === 'total') {

      updates = { totalFeePaid: !c.totalFeePaid }

    // Initial amount
    } else if (itemKey === 'initial') {

      updates = { initialPaid: !c.initialPaid }

    // Hearing fee row: marking it paid also fills the received amount
    } else if (itemKey.startsWith('hearing-')) {

      const rowId = Number(itemKey.replace('hearing-', ''))

      updates = {
        hearingFees: (c.hearingFees || []).map(row => {
          if (row.id !== rowId) return row

          const amount = row.amount !== '' && row.amount != null
            ? Number(row.amount) || 0
            : Number(c.dateWiseAmount) || 0

          const currentlyPaid = row.amountReceived !== '' && row.amountReceived != null
            ? Number(row.amountReceived) >= amount
            : !!row.paid

          return currentlyPaid
            ? { ...row, paid: false, amountReceived: 0 }
            : { ...row, paid: true, amountReceived: amount }
        })
      }

    // Stage fee row
    } else if (itemKey.startsWith('stage-')) {

      const rowId = Number(itemKey.replace('stage-', ''))

      updates = {
        stageFees: (c.stageFees || []).map(row =>
          row.id === rowId
            ? { ...row, paid: !row.paid }
            : row
        )
      }

    }

    await handleUpdateCase(caseId, updates)
  }

  // Every fee item of every case as one flat transaction list for the transactions page
  const transactions = cases.flatMap(c => {

    const client = clients.find(
      cl => Number(cl.id) === Number(c.clientId)
    )

    const { items } = getCaseFeeSummary(c)

    const recordedOn = caseCreatedDate(c)

    return items.map(item => ({
      id: `${c.id}-${item.key}`,
      caseId: c.id,
      caseTitle: c.title,
      caseNo: c.caseNo,
      clientId: c.clientId,
      clientName: c.clientName || client?.name || 'Unknown',
      // Every client on the case (main + additional), so a search finds the fee under any of them
      clientNames: caseClientNames(c, clients),
      description: item.label,
      date: item.date,
      recordedOn,
      amount: item.amount,
      status: item.paid ? 'Paid' : 'Due'
    }))
  })

  // Selected calendar date as YYYY-MM-DD
  const calendarDateKey = formatDate(calendarDate)

  // Hearing records that count on the calendar (withdrawn ones are ignored)
  const calendarHearingRecords = hearingRecords.filter(h => h.outcome !== WITHDRAWN_OUTCOME && !isMiscOnlyHearing(h))

  // The different cases that have a hearing on each date (upcoming + past)
  const hearingCaseIdsByDate = (() => {
    const caseIdsByDate = new Map()
    const caseIds = new Set(cases.map(c => c.id))
    // Counts a case once for a date
    const add = (date, caseId) => {
      if (!date) return
      if (!caseIdsByDate.has(date)) caseIdsByDate.set(date, new Set())
      caseIdsByDate.get(date).add(caseId)
    }

    cases.forEach(c => add(c.nextHearing, c.id))
    calendarHearingRecords.forEach(h => {
      if (caseIds.has(h.caseId)) add(h.date, h.caseId)
    })
    // Misc. application hearings count for their case too (once, even when the case itself is listed that day)
    miscHearingCaseIdsByDate.forEach((ids, date) => ids.forEach(id => { if (caseIds.has(id)) add(date, id) }))

    return caseIdsByDate
  })()

  // How many different cases have a hearing on each date, shown on the calendar
  const hearingCountsByDate = new Map([...hearingCaseIdsByDate].map(([date, ids]) => [date, ids.size]))

  // Most hearings allowed on a date: the limit set for that date, else the usual limit, null when there is none
  const hearingLimitFor = dateStr => hearingLimits.overrides[dateStr] ?? hearingLimits.defaultLimit ?? null

  // True when the date already holds as many hearings as its limit allows, not counting the given case
  const isDayFull = (dateStr, caseId = null) => {
    const limit = hearingLimitFor(dateStr)
    if (limit == null) return false
    const ids = hearingCaseIdsByDate.get(dateStr)
    const count = ids ? ids.size - (caseId != null && ids.has(caseId) ? 1 : 0) : 0
    return count >= limit
  }

  // Message for a date that is full, '' when more hearings fit. The server makes the same check when saving
  const dayFullProblem = (dateStr, caseId = null) => {
    if (!isDayFull(dateStr, caseId)) return ''
    const limit = hearingLimitFor(dateStr)
    return `This date already has ${limit} hearing${limit === 1 ? '' : 's'}, the daily limit`
  }

  // Number of hearings in each case's history: the case's own hearing dates plus those of its misc. applications
  const hearingCountsByCase = (() => {
    const counts = new Map()
    hearingRecords.forEach(h => {
      // Entries that only mirror an application's date are counted with the application's own hearings below
      if (h.caseId == null || isMiscOnlyHearing(h)) return
      counts.set(h.caseId, (counts.get(h.caseId) || 0) + 1)
    })
    miscHearingCounts.forEach((n, caseId) => counts.set(caseId, (counts.get(caseId) || 0) + n))
    return counts
  })()

  // Cases that have a hearing on the selected calendar date
  const todayCases = (() => {
    const heardOnDate = new Set(
      calendarHearingRecords.filter(h => h.date === calendarDateKey).map(h => h.caseId)
    )

    return cases.filter(
      c => c.nextHearing === calendarDateKey || heardOnDate.has(c.id)
    )
  })()

  // Cases after applying the status filter
  const filteredCases =
    filterStatus === 'All'
      ? cases
      : cases.filter(
          c =>
            c.status ===
            filterStatus
        )

  // WhatsApp reminder state and actions come from a separate hook
  const whatsapp = useWhatsApp({
    loggedIn, cases, setCases, clients, addToast, getCaseFeeSummary, openClientForEdit
  })

  // Everything below is exposed to the app through useApp()
  return (
    <AppContext.Provider
      value={{

        // Auth and session
        loggedIn,

        currentUser,

        authPage,
        setAuthPage,

        authError,

        planPromptOpen,
        finishPlanPrompt: () => setPlanPromptOpen(false),
        courtPromptOpen,
        finishCourtPrompt: () => setCourtPromptOpen(false),

        // Login and registration forms
        loginForm,
        setLoginForm,
        loginType,
        setLoginType,

        regForm,
        setRegForm,

        // Registration OTP
        otpSent,
        otpCode,
        setOtpCode,
        otpVerified,
        otpSending,
        otpVerifying,
        otpResendInSec,
        handleSendOtp,
        handleVerifyOtp,

        // Login, register and logout actions
        handleLogin,
        handleRegister,
        handleGoogleLogin,
        handleGoogleRegister,
        googlePending,
        completeGoogleSignup,
        cancelGooglePending,
        handleLogout,
        switchAccount,
        addAccount,

        // Forgot password
        isResettingPassword,
        forgotForm,
        setForgotForm,
        forgotOtpSent,
        forgotSending,
        forgotResetting,
        forgotResendInSec,
        startForgotPassword,
        cancelForgotPassword,
        handleSendForgotOtp,
        handleResetForgottenPassword,

        // Change email
        isChangingEmail,
        emailChangeForm,
        setEmailChangeForm,
        emailChangeOtpSent,
        emailChangeSending,
        emailChangeConfirming,
        emailChangeResendInSec,
        startChangeEmail,
        cancelChangeEmail,
        handleSendEmailChangeOtp,
        handleConfirmEmailChange,

        // Role flags
        isAdmin,
        isAdminRoute,
        isAssociate,

        // Document viewing helpers
        handleDownloadDocument,
        handleViewDocument,
        docPreview,
        setDocPreview,
        closeDocPreview,

        // Profile editing
        isEditingProfile,

        profileForm,
        setProfileForm,

        startEditProfile,
        cancelEditProfile,
        handleUpdateProfile,
        handleUpdateProfilePicture,
        handleUpdateQrCode,
        handleUpdateUpiId,

        // Change password and account removal
        isChangingPassword,
        passwordForm,
        setPasswordForm,
        startChangePassword,
        cancelChangePassword,
        handleChangePassword,
        handleSetPassword,
        handleDeactivateAccount,
        handleDeleteAccount,

        // Navigation (the URL decides the page; see routes/)
        activeNav,
        setActiveNav,
        openCase,
        justSignedOut,

        // Transactions page lock
        transactionsUnlocked,
        unlockTransactions,
        updateCurrentUser,

        // Main data and the calendar
        clients,
        cases,
        setCases,
        loading,

        calendarDate,
        setCalendarDate,

        calendarViewDate,
        setCalendarViewDate,

        todayCases,
        filteredCases,

        // Holidays and no-hearing dates
        holidays,

        noHearingDates,
        toggleNoHearingDate,

        // Modal visibility and the selected case
        showAddCase,
        setShowAddCase,
        scanCnr,
        setScanCnr,

        showAddClient,
        setShowAddClient,

        uploadDocCaseId,
        setUploadDocCaseId,

        selectedCase,
        setSelectedCase,

        filterStatus,
        setFilterStatus,

        // Next hearing modal and hearing counts
        nextHearingCaseId,
        openNextHearing,
        closeNextHearing,
        handleSaveNextHearing,
        syncNextHearing,

        hearingsVersion,
        optionsVersion,
        bumpHearings,
        syncCaseNextHearing,

        hearingCountsByDate,
        hearingCountsByCase,
        miscHearingCounts,

        // Daily hearing limit
        hearingLimits,
        hearingLimitFor,
        isDayFull,
        dayFullProblem,
        saveDefaultHearingLimit,
        saveHearingLimitForDate,

        // Judges-on-leave counts per date
        calendarDateKey,

        transactionCaseId,
        setTransactionCaseId,

        expandedHearingCaseId,
        setExpandedHearingCaseId,

        judgeLeaveJumpQuery,
        setJudgeLeaveJumpQuery,

        // Add / edit case form
        newCaseForm,
        setNewCaseForm,

        caseClients,

        selectClient,
        markTarget,
        startMarkAsClient,
        changeClientSide,
        remapClientSubTypes,
        removeCaseClient,
        setPrimaryCaseClient,
        resetCaseModal,

        editingCaseId,
        openEditCase,

        addHearingFeeRow,
        updateHearingFeeRow,
        removeHearingFeeRow,

        // Case actions and fees
        handleDeleteCase,
        handleUpdateCase,
        handleSaveCase,

        getCaseFeeSummary,
        toggleFeePaid,
        transactions,

        invoiceCaseId,
        setInvoiceCaseId,

        // Fee-only modal
        feeOnlyCaseId,
        feeOnlyForm,
        feeOnlyFocusDate,
        feeOnlyReadOnly,
        setFeeOnlyForm,
        openEditFee,
        closeFeeOnly,
        addFeeOnlyHearingRow,
        updateFeeOnlyHearingRow,
        removeFeeOnlyHearingRow,
        handleSaveFeeOnly,

        // Clients
        newClientForm,
        setNewClientForm,

        handleAddClient,
        handleUpdateClient,
        handleDeleteClient,

        selectedClient,
        setSelectedClient,
        clientEditRequest,
        setClientEditRequest,

        // Case document upload
        docName,
        setDocName,

        docType,
        setDocType,


        fileRef,

        handleUploadDoc,
        handleDeleteDocument,

        // Client document upload
        uploadDocClientId,
        setUploadDocClientId,

        clientDocName,
        setClientDocName,
        clientDocType,
        setClientDocType,
        clientDocTypeCustom,
        setClientDocTypeCustom,

        clientFileRef,

        handleUploadClientDoc,
        handleDeleteClientDocument,

        // Advocate document upload
        advocateDocs,

        uploadDocAdvocate,
        setUploadDocAdvocate,

        advocateDocName,
        setAdvocateDocName,

        advocateFileRef,

        handleUploadAdvocateDoc,
        handleDeleteAdvocateDoc,

        // Renaming a document
        renameDocTarget,
        setRenameDocTarget,
        handleRenameDocument,

        // Evidence upload
        showUploadEvidence,
        setShowUploadEvidence,

        evidenceCategory,
        setEvidenceCategory,
        evidenceTargetId,
        setEvidenceTargetId,
        evidenceName,
        setEvidenceName,

        evidenceFileRef,

        handleUploadEvidence,

        // To-do list
        todos,
        addTodo,
        updateTodo,
        deleteTodo,

        // Toasts
        toasts,
        addToast,

        // WhatsApp reminder state and actions
        ...whatsapp

      }}
    >

      {children}

    </AppContext.Provider>
  )
}

// Hook for reading the global state and actions: const { cases, addToast } = useApp()
export function useApp() {

  return useContext(
    AppContext
  )
}