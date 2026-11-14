import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { STATUS_COLORS, isClosedCase } from '../constants/data'
import { caseWarnings } from '../utils/caseWarnings'
import { statusChangeQuestion } from '../utils/caseStatus'
import { useCourts, caseCourtLabel } from '../constants/courts'
import { caseClientNames } from '../utils/caseClients'
import { formatDisplayDate, formatShortDate } from '../utils/dateUtils'
import { caseNatureOf } from '../utils/caseClassification'
import { CASE_NATURES, reliefOptions } from '../constants/caseCatalog'
import useSeeMore from '../hooks/useSeeMore'
import usePersistedState from '../hooks/usePersistedState'
import SeeMore from '../components/common/SeeMore'
import CaseHearings from '../components/common/CaseHearings'
import CaseFields from '../components/common/CaseFields'
import CaseParties from '../components/common/CaseParties'
import CaseSummaryFields from '../components/common/CaseSummaryFields'
import { documentTitle, documentTypeLabel, isOrderDocument, isEvidenceDocument, isMiscDocument, evidenceTitle } from '../utils/documentUtils'
import MiscDocsSection from '../components/misc/MiscDocsSection'
import CaseStatusSelect from '../components/common/CaseStatusSelect'
import Dropdown from '../components/common/Dropdown'

import Icon from '../components/common/Icon'
import NextHearingBox from '../components/common/NextHearingBox'
import NoFileNumberModal, { lacksFileNumber } from '../components/modals/NoFileNumberModal'
import ModalPortal from '../components/common/ModalPortal'
import useOverlayClose from '../hooks/useOverlayClose'
import api from '../services/api'
import { getErrorMessage } from '../utils/errorMessages'
import CnrScannerModal from '../components/modals/CnrScannerModal'
import ImportCasesModal from '../components/modals/ImportCasesModal'
import { fetchImported, forgetImported, loadImported, saveImported, uploadImported } from '../utils/myCasesImport'
import DocInfoButton from '../components/common/DocInfoButton'
import ToggleSwitch from '../components/common/ToggleSwitch'
import { confirmDialog } from '../utils/confirmDialog'
import useSessionState from '../hooks/useSessionState'
import ClearableDateInput from '../components/common/ClearableDateInput'
import SearchInput from '../components/common/SearchInput'
// Status filter buttons
const STATUSES = ['All', 'Pending', 'On Hold', 'Decided', 'Withdrawn']

// The chosen status chip is remembered per user in this browser. It is restored once per user per page load,
// so opening a case from a client (which resets the chip to All) is not overridden afterwards.
const statusKeyFor = userId => `internyay_case_status_${userId}`
const restoredFor = new Set()

// Fields available in the Filter menu as [key, label]
const CASE_FILTER_FIELDS = [
  ['court', 'Court'],
  ['nature', 'Case Nature'],
  ['relief', 'Relief Sought'],
  ['caseType', 'Case Type'],
  ['dateInterval', 'Date Interval'],
]

// Sort choices as [value, label]
const SORT_OPTIONS = [
  ['courtNo', 'Case No.'],
  ['fileNo', 'File No.'],
  ['hearing', 'Next Hearing'],
  ['updated', 'Recently Updated'],
  ['newest', 'Newest First'],
  ['oldest', 'Oldest First'],
]

// Quick ranges for the hearing date filter, as [key, label]
const DATE_PRESETS = [
  ['today', 'Today'],
  ['week', 'This Week'],
  ['next7', 'Next 7 Days'],
]

const pad2 = n => String(n).padStart(2, '0')
const toIsoLocal = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

// From and To dates (YYYY-MM-DD) of a quick range, worked out from today. The week runs Monday to Sunday
function presetRange(key) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  if (key === 'week') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    end.setTime(start.getTime())
    end.setDate(start.getDate() + 6)
  } else if (key === 'next7') {
    end.setDate(start.getDate() + 6)
  }
  return [toIsoLocal(start), toIsoLocal(end)]
}

// Date a case was filed (falls back to the day it was added), for the Newest / Oldest First sorts
function filedKey(c) {
  return c.filingDate || String(c.createdAt || '').slice(0, 10) || ''
}

// Filed date, newest or oldest first; cases with no date go last either way
function compareFiled(a, b, dir) {
  const x = filedKey(a)
  const y = filedKey(b)
  if (!x && !y) return 0
  if (!x) return 1
  if (!y) return -1
  const diff = dir === 'newest' ? y.localeCompare(x) : x.localeCompare(y)
  // Same filing day: the case added later counts as newer
  return diff || (dir === 'newest'
    ? String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    : String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
}

// Most recently changed first; cases with no update time go last
function compareUpdated(a, b) {
  const x = String(a.updatedAt || '')
  const y = String(b.updatedAt || '')
  if (!x && !y) return 0
  if (!x) return 1
  if (!y) return -1
  return y.localeCompare(x)
}

// Sort by file number in natural order (2 before 10); cases without one go last
function compareFileNo(a, b) {
  const x = String(a.fileNo || '').trim()
  const y = String(b.fileNo || '').trim()
  if (!x && !y) return 0
  if (!x) return 1
  if (!y) return -1
  return x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' })
}

// Sort by court number in natural order (2 before 10); cases without one go last
function compareCourtNo(a, b) {
  const x = String(a.courtNo || '').trim()
  const y = String(b.courtNo || '').trim()
  if (!x && !y) return 0
  if (!x) return 1
  if (!y) return -1
  return x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' })
}

// Sort by next hearing date; cases without one go last
function compareHearing(a, b) {
  if (!a.nextHearing && !b.nextHearing) return 0
  if (!a.nextHearing) return 1
  if (!b.nextHearing) return -1
  return String(a.nextHearing).localeCompare(String(b.nextHearing))
}

// Cases page: search, filter and sort cases; expand a card to manage its documents, evidence, reminders and fees
// windowOnly: used over another page (a client's details): nothing of the Cases page shows, only the case window,
// and onWindowClose is called when that window is closed
export default function Cases({ windowOnly = false, onWindowClose }) {
  // Every court in the court table, for the Court filter
  const courtTable = useCourts()
  const {
    clients,
    cases,
    filteredCases,
    filterStatus,
    setFilterStatus,
    selectedCase,
    setSelectedCase,
    showAddCase,
    openAddCase,
    setUploadDocCaseId,
    openEditCase,
    setTransactionCaseId,
    isAssociate,
    handleDeleteCase,
    handleUpdateCase,
    handleDeleteDocument,
    handleViewDocument,
    whatsappBusy,
    toggleCaseReminders,
    caseRemindersOn,
    caseHasReminderNumber,
    setCaseReminderDays,
    sendHearingReminder,
    setShowUploadEvidence,
    setEvidenceCategory,
    setEvidenceTargetId,
    hearingCountsByCase,
    currentUser,
    addToast,
    syncCaseNextHearing,
    bumpHearings,
    todos,
    updateTodo,
    caseWindowRequest,
    setCaseWindowRequest,
  } = useApp()
  const [scannerOpen, setScannerOpen] = useState(false)
  // Window listing the open cases that have no file number, where they can be given one
  const [noFileOpen, setNoFileOpen] = useState(false)
  // Case shown in a window over the page (opened from the No File No. window); stored as an id so the window stays current after a save
  const [windowCaseId, setWindowCaseId] = useState(null)
  const windowCase = windowCaseId != null ? cases.find(x => x.id === windowCaseId) : null
  const caseWindowHandlers = useOverlayClose(() => setWindowCaseId(null))
  // In windowOnly mode, tell the page underneath once the case window that was opened has gone away
  const windowWasOpen = useRef(false)
  useEffect(() => {
    if (!windowOnly) return
    if (windowCase) windowWasOpen.current = true
    else if (windowWasOpen.current) { windowWasOpen.current = false; onWindowClose?.() }
  }, [windowOnly, windowCase])
  const noFileCount = useMemo(() => cases.filter(lacksFileNumber).length, [cases])

  // Refresh symbol on a card's next-hearing box: reads the case from eCourts again, the same as the Refresh button in Hearing History
  async function refreshCardHearing(c) {
    try {
      const res = await api.cases.refreshHearing(c.id)
      const dateChanged = res && res.nextHearing !== undefined && (res.nextHearing || null) !== (c.nextHearing || null)
      const statusChanged = res && res.status && res.status !== c.status
      if (dateChanged || statusChanged) {
        syncCaseNextHearing(c.id, res.nextHearing, statusChanged ? { status: res.status, decisionDate: res.decisionDate || null } : {})
      }
      bumpHearings(c.id)
      addToast(res?.message || 'Refreshed from eCourts')
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not refresh from eCourts'), 'error')
    }
  }

  // Import from eCourts: the cases of the uploaded My Cases file, and whether the list is open.
  // A case is added from the list one at a time; when its form closes the list opens again
  const [importItems, setImportItems] = useState(() => loadImported(currentUser?.id != null ? String(currentUser.id) : undefined))
  const importOwnerId = currentUser?.id != null ? String(currentUser.id) : ''
  const importOwnerRef = useRef(importOwnerId)

  useEffect(() => {
    if (importOwnerRef.current === importOwnerId) return
    importOwnerRef.current = importOwnerId
    setImportItems(loadImported(importOwnerId))
    setImportOpen(false)
  }, [importOwnerId])

  // The list is kept on the account: bring it in on opening the page (a new device or browser has no local copy).
  // A list uploaded before it was kept on the account is sent up once
  useEffect(() => {
    if (!importOwnerId) return undefined
    let alive = true
    fetchImported().then(list => {
      if (!alive) return
      if (list) {
        setImportItems(list)
        saveImported(list, importOwnerId)
      } else {
        const local = loadImported(importOwnerId)
        if (local) uploadImported(local)
      }
    })
    return () => { alive = false }
  }, [importOwnerId])
  const [importOpen, setImportOpen] = useState(false)
  const backToImport = useRef(false)

  useEffect(() => {
    if (showAddCase || !backToImport.current) return
    backToImport.current = false
    setImportOpen(true)
  }, [showAddCase])

  // Bring back this user's last status chip. A reload already starts with it (AppContext); this covers signing in or
  // switching account, and runs before the first paint so the chips never flash All first
  const statusUserId = currentUser?.id
  useLayoutEffect(() => {
    if (!statusUserId || restoredFor.has(statusUserId)) return
    restoredFor.add(statusUserId)
    try {
      const saved = localStorage.getItem(statusKeyFor(statusUserId))
      if (saved && STATUSES.includes(saved)) setFilterStatus(saved)
    } catch { /* storage unavailable */ }
  }, [statusUserId, setFilterStatus])

  // Chip click: show that status and remember it for this user
  const chooseStatus = status => {
    setFilterStatus(status)
    if (!statusUserId) return
    try { localStorage.setItem(statusKeyFor(statusUserId), status) } catch { /* storage unavailable */ }
  }

  // How many of ALL the advocate's cases are in each status (not affected by the filters below), for the cards at the top
  const statusCounts = useMemo(() => {
    const counts = { All: cases.length }
    STATUSES.slice(1).forEach(st => { counts[st] = 0 })
    cases.forEach(c => {
      const st = c.status || 'Pending'
      if (counts[st] !== undefined) counts[st] += 1
    })
    return counts
  }, [cases])

  // Search text, sort order and the values chosen in the Filter menu
  const [search, setSearch] = useSessionState('cases_search', '')
  const searchInputRef = useRef(null)
  const [sortBy, setSortBy] = usePersistedState('cases_sort', 'courtNo', SORT_OPTIONS.map(([v]) => v))
  // The Filter menu choices are remembered for this user (shown as chips under the toolbar, with Clear all)
  const [filterCourt, setFilterCourt] = usePersistedState('cases_filter_court', 'All')
  const [filterNature, setFilterNature] = usePersistedState('cases_filter_nature', 'All')
  const [filterRelief, setFilterRelief] = usePersistedState('cases_filter_relief', 'All')
  const [filterCaseType, setFilterCaseType] = usePersistedState('cases_filter_case_type', 'All')
  const [filterDateFrom, setFilterDateFrom] = usePersistedState('cases_filter_date_from', '')
  const [filterDateTo, setFilterDateTo] = usePersistedState('cases_filter_date_to', '')
  // Quick range chosen for the hearing date ('' when the dates were typed in)
  const [filterDatePreset, setFilterDatePreset] = usePersistedState('cases_filter_date_preset', '')
  // A remembered quick range ('Today', 'This Week'...) follows today's date, so it never keeps an old day's dates
  useEffect(() => {
    if (!filterDatePreset) return
    if (!DATE_PRESETS.some(([k]) => k === filterDatePreset)) { setFilterDatePreset(''); return }
    const [from, to] = presetRange(filterDatePreset)
    if (from !== filterDateFrom) setFilterDateFrom(from)
    if (to !== filterDateTo) setFilterDateTo(to)
  }, [filterDatePreset, filterDateFrom, filterDateTo, setFilterDateFrom, setFilterDateTo, setFilterDatePreset])
  // Filter menu state: open or closed, the field being edited, and where the panel is placed
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const [activeFilterField, setActiveFilterField] = useState(null)
  const [filterPanelPos, setFilterPanelPos] = useState(null)
  const filterMenuRef = useRef(null)
  const filterPanelRef = useRef(null)
  // Which sections (hearings, documents, evidence) are open inside an expanded case
  const [openSections, setOpenSections] = useSessionState('cases_open_sections', { hearings: false, documents: false, evidence: false })

  useEffect(() => {
    if (caseWindowRequest == null) return
    setOpenSections({ hearings: false, documents: false, evidence: false })
    setWindowCaseId(caseWindowRequest)
    setCaseWindowRequest(null)
  }, [caseWindowRequest])

  // Close the Filter menu
  function closeCaseFilterMenu() {
    setFilterMenuOpen(false)
    setActiveFilterField(null)
  }

  // Keep the filter panel inside the visible page area
  const positionFilterPanel = useCallback(() => {
    const wrap = filterMenuRef.current
    if (!wrap) return

    const wrapRect = wrap.getBoundingClientRect()
    const page = wrap.closest('.app-main')
    const pageRect = page ? page.getBoundingClientRect() : null
    const margin = 8

    const minLeft = Math.max(pageRect ? pageRect.left : 0, 0) + margin
    const maxRight = Math.min(pageRect ? pageRect.right : window.innerWidth, window.innerWidth) - margin

    const width = Math.max(160, Math.min(280, maxRight - minLeft))
    const left = Math.min(Math.max(wrapRect.right - width, minLeft), maxRight - width)

    const next = { left: Math.round(left - wrapRect.left), width }
    setFilterPanelPos(prev => (prev && prev.left === next.left && prev.width === next.width ? prev : next))
  }, [])

  // Position the panel each time it opens
  useLayoutEffect(() => {
    if (filterMenuOpen) positionFilterPanel()
  })

  // Clear the position when the menu closes, and reposition when the window is resized
  useLayoutEffect(() => {
    if (!filterMenuOpen) {
      setFilterPanelPos(null)
      return undefined
    }
    window.addEventListener('resize', positionFilterPanel)
    return () => window.removeEventListener('resize', positionFilterPanel)
  }, [filterMenuOpen, positionFilterPanel])

  // Open or close one field's options in the Filter menu
  function toggleFilterField(field) {
    setActiveFilterField(f => (f === field ? null : field))
  }

  // Open or close a section of the expanded case without collapsing the card
  function toggleSection(e, section) {
    e.stopPropagation()
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  // Ask for confirmation, then delete the case
  async function confirmDeleteCase(e, c) {
    e.stopPropagation()
    if (await confirmDialog(
      `Delete case "${c.title}"? It will be removed from your cases, along with its documents and hearing history. This cannot be undone.`
    )) {
      handleDeleteCase(c.id)
    }
  }

  // Change the case status, asking first when the change needs confirming
  async function changeStatus(c, next) {
    if (!next || next === c.status) return

    const question = statusChangeQuestion(c, next, c.nextHearing)
    if (question && !(await confirmDialog({ title: 'Change case status?', message: question, confirmLabel: 'Yes, continue' }))) return

    handleUpdateCase(c.id, { status: next })
  }

  // Cases after the search text, filters and sort order are applied
  const searchedCases = useMemo(() => {
    let list = filteredCases

    // Match the search text against title, case numbers, parties, judge, court and client names
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c => {
        return (
          (c.title || '').toLowerCase().includes(q) ||
          (c.caseNo || '').toLowerCase().includes(q) ||
          (c.fileNo || '').toLowerCase().includes(q) ||
          (c.cnrNo || '').toLowerCase().includes(q) ||
          (c.opposingParty || '').toLowerCase().includes(q) ||
          (c.judgeName || '').toLowerCase().includes(q) ||
          (c.chequeNo || '').toLowerCase().includes(q) ||
          caseCourtLabel(c).toLowerCase().includes(q) ||
          caseClientNames(c, clients).some(name => name.toLowerCase().includes(q)) ||
          (c.nonClients || []).some(n => (n.name || '').toLowerCase().includes(q))
        )
      })
    }

    // Only cases of the chosen court
    if (filterCourt !== 'All') {
      list = list.filter(c => c.court === filterCourt)
    }

    // Apply the nature, relief, case type and hearing date filters
    if (filterNature !== 'All') {
      list = list.filter(c => caseNatureOf(c) === filterNature)
    }

    if (filterRelief !== 'All') {
      list = list.filter(c => (c.reliefSought || '') === filterRelief)
    }

    if (filterCaseType !== 'All') {
      list = list.filter(c => (c.caseType || '') === filterCaseType)
    }

    if (filterDateFrom) {
      list = list.filter(c => c.nextHearing && c.nextHearing >= filterDateFrom)
    }

    if (filterDateTo) {
      list = list.filter(c => c.nextHearing && c.nextHearing <= filterDateTo)
    }

    // Sort by case number, file number, next hearing, last update or filing date
    return [...list].sort((a, b) => {
      if (sortBy === 'courtNo') return compareCourtNo(a, b) || compareHearing(a, b)
      if (sortBy === 'fileNo') return compareFileNo(a, b) || compareHearing(a, b)
      if (sortBy === 'updated') return compareUpdated(a, b) || compareHearing(a, b)
      if (sortBy === 'newest' || sortBy === 'oldest') return compareFiled(a, b, sortBy) || compareHearing(a, b)
      return compareHearing(a, b)
    })
  }, [filteredCases, search, sortBy, filterCourt, filterNature, filterRelief, filterCaseType, filterDateFrom, filterDateTo, clients])

  // Show the cases a page at a time; starts again when the status tab, search, filters or sort change
  const casesStep = 16
  const openCaseIndex = selectedCase ? searchedCases.findIndex(c => c.id === selectedCase.id) : -1
  const {
    visible: visibleCases,
    remaining: casesRemaining,
    showMore: showMoreCases,
  } = useSeeMore(
    searchedCases,
    [filterStatus, search, sortBy, filterCourt, filterNature, filterRelief, filterCaseType, filterDateFrom, filterDateTo].join('|'),
    casesStep,
    openCaseIndex + 1
  )

  // Cards sit two per row. When the opened card is the right one of its pair, the card beside it
  // would leave an empty half row above the opened card, so that card moves down to follow it instead
  const displayCases = useMemo(() => {
    const i = selectedCase ? visibleCases.findIndex(c => c.id === selectedCase.id) : -1
    if (i < 1 || i % 2 === 0) return visibleCases
    const list = visibleCases.slice()
    ;[list[i - 1], list[i]] = [list[i], list[i - 1]]
    return list
  }, [visibleCases, selectedCase])

  // Sliding cards: when a card opens or closes (it takes the full row), the other cards glide to their new place.
  // Positions are noted just before the change, then each card animates from its old spot to the new one.
  const cardEls    = useRef(new Map())
  const beforeRects = useRef(null)
  const openCardId = selectedCase?.id ?? null

  // Arriving with a case already open (e.g. "Open in Cases" on the dashboard): bring that card into view
  // so there is no scrolling to find it. Waits a moment so the page's own scroll-to-top has finished first
  useEffect(() => {
    if (openCardId == null) return
    let cancelled = false
    // Brings the opened card's top just below the pinned bar, so the case is read from its top
    const alignCard = el => {
      if (cancelled || !el.isConnected) return
      // The search / filter bar is pinned to the top and is taller on a phone (search, filters and sort wrap onto
      // several rows), so the card is scrolled to just below it instead of a fixed distance that would hide its title
      const bar = document.querySelector('.app-main .list-toolbar')
      const barStyle = bar ? getComputedStyle(bar) : null
      const clearance = barStyle && barStyle.position === 'sticky'
        ? (parseFloat(barStyle.top) || 0) + bar.offsetHeight + 12
        : 72
      el.style.scrollMarginTop = `${Math.round(clearance)}px`
      const top = el.getBoundingClientRect().top
      if (Math.abs(top - clearance) > 8) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
    const t = setTimeout(() => {
      const el = cardEls.current.get(openCardId)
      if (!el) return
      // The card is still gliding into place while it opens, which skews its measured position: wait for that to end
      const running = el.getAnimations ? el.getAnimations() : []
      if (running.length) Promise.allSettled(running.map(a => a.finished)).then(() => alignCard(el))
      else alignCard(el)
    }, 80)
    return () => { cancelled = true; clearTimeout(t) }
  }, [openCardId])

  function noteCardPositions() {
    const rects = new Map()
    cardEls.current.forEach((el, id) => rects.set(id, el.getBoundingClientRect()))
    beforeRects.current = rects
  }

  useLayoutEffect(() => {
    const before = beforeRects.current
    beforeRects.current = null
    if (!before || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const timing = { duration: 420, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
    cardEls.current.forEach((el, id) => {
      const from = before.get(id)
      if (!from || !el.animate) return
      const to = el.getBoundingClientRect()
      const dx = from.left - to.left
      const dy = from.top - to.top
      const dw = to.width - from.width
      const dh = to.height - from.height
      const resized = Math.abs(dw) > 2 || Math.abs(dh) > 2

      if (!resized) {
        // Same size: the card just glides to its new place
        if (!dx && !dy) return
        el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
          timing
        )
      } else if (dw >= -2 && dh >= -2) {
        // Growing (opening): the card is already at its final size, a clip grows from the old box to the full card,
        // so nothing re-wraps while it opens
        const right = Math.max(0, dw)
        const bottom = Math.max(0, dh)
        el.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)`, clipPath: `inset(0px ${right}px ${bottom}px 0px round 14px)` },
            { transform: 'translate(0, 0)',             clipPath: 'inset(0px 0px 0px 0px round 14px)' },
          ],
          timing
        )
      } else {
        // Shrinking (closing): the card eases from its old size down to the new one
        el.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)`, width: `${from.width}px`, height: `${from.height}px` },
            { transform: 'translate(0, 0)',             width: `${to.width}px`,   height: `${to.height}px` },
          ],
          timing
        )
      }
    })
  }, [openCardId])

  // Filter choices taken from the cases that exist
  const natureOptionsInUse = useMemo(
    () => [...new Set(filteredCases.map(c => caseNatureOf(c)).filter(Boolean))].sort(),
    [filteredCases]
  )

  // Every court of the court table (district courts, then high courts), plus any court a case still carries that is not in it
  const courtOptions = useMemo(() => {
    const all = [...courtTable.courtNames, ...courtTable.highCourts]
    const extra = [...new Set(filteredCases.map(c => c.court).filter(Boolean))].filter(n => !all.includes(n)).sort()
    return [...all, ...extra]
  }, [courtTable, filteredCases])

  // Relief values present in the filtered cases
  const reliefOptionsInUse = useMemo(
    () => [...new Set(filteredCases.map(c => c.reliefSought).filter(Boolean))].sort(),
    [filteredCases]
  )

  // Case types present in the filtered cases
  const caseTypeOptionsInUse = useMemo(
    () => [...new Set(filteredCases.map(c => c.caseType).filter(Boolean))].sort(),
    [filteredCases]
  )

  // Relief choices follow the selected nature when one is chosen
  const filterReliefChoices = filterNature !== 'All' ? reliefOptions(filterNature) : reliefOptionsInUse

  // Whether any filter is active, and how many
  const hasCaseFilters =
    filterCourt !== 'All' || filterNature !== 'All' || filterRelief !== 'All' || filterCaseType !== 'All' ||
    !!filterDateFrom || !!filterDateTo

  const activeCaseFilterCount =
    (filterCourt !== 'All' ? 1 : 0) +
    (filterNature !== 'All' ? 1 : 0) +
    (filterRelief !== 'All' ? 1 : 0) +
    (filterCaseType !== 'All' ? 1 : 0) +
    (filterDateFrom || filterDateTo ? 1 : 0)

  // The summary under the toolbar counts only the Filter menu's filters; the search text is not a filter and has its own clear button
  const totalActiveCount = activeCaseFilterCount

  // Changing the nature resets the relief filter, since relief depends on nature
  function changeFilterNature(value) {
    setFilterNature(value)
    setFilterRelief('All')
  }

  // Clear one filter
  function clearFilterField(field) {
    if (field === 'court') setFilterCourt('All')
    if (field === 'nature') changeFilterNature('All')
    if (field === 'relief') setFilterRelief('All')
    if (field === 'caseType') setFilterCaseType('All')
    if (field === 'dateInterval') {
      setFilterDateFrom('')
      setFilterDateTo('')
      setFilterDatePreset('')
    }
  }

  // From the "No File No." window: show that case in a window over it, without leaving the page or losing the list
  function openCaseFromNoFile(c) {
    setOpenSections({ hearings: false, documents: false, evidence: false })
    setWindowCaseId(c.id)
  }

  // Pick a quick range for the hearing date; picking the same one again turns it off
  function applyDatePreset(key) {
    if (filterDatePreset === key) {
      clearFilterField('dateInterval')
      return
    }
    const [from, to] = presetRange(key)
    setFilterDateFrom(from)
    setFilterDateTo(to)
    setFilterDatePreset(key)
  }

  // Chips shown under the toolbar for each active filter
  const activeFilterChips = []
  if (filterCourt !== 'All') activeFilterChips.push({ field: 'court', label: 'Court', value: filterCourt })
  if (filterNature !== 'All') activeFilterChips.push({ field: 'nature', label: 'Case Nature', value: filterNature })
  if (filterRelief !== 'All') activeFilterChips.push({ field: 'relief', label: 'Relief Sought', value: filterRelief })
  if (filterCaseType !== 'All') activeFilterChips.push({ field: 'caseType', label: 'Case Type', value: filterCaseType })
  if (filterDateFrom || filterDateTo) {
    const from = filterDateFrom ? formatDisplayDate(filterDateFrom) : '…'
    const to = filterDateTo ? formatDisplayDate(filterDateTo) : '…'
    const presetLabel = DATE_PRESETS.find(([k]) => k === filterDatePreset)?.[1]
    activeFilterChips.push({ field: 'dateInterval', label: 'Hearing Date', value: presetLabel || `${from} → ${to}` })
  }

  // Clear all filters
  function clearCaseFilters() {
    setFilterCourt('All')
    setFilterNature('All')
    setFilterRelief('All')
    setFilterCaseType('All')
    setFilterDateFrom('')
    setFilterDateTo('')
    setFilterDatePreset('')
  }

  // "Clear all" in the filter summary clears the filters only, not the search text
  function clearEverything() {
    clearCaseFilters()
  }

  // Expanded view of one case
  function renderCaseDetail(c) {
    // Case documents (without orders and evidence) and the evidence items
    // Misc. application documents have their own section, so they are kept out of the case's documents
    const documents = (c.documents || []).filter(d => !isOrderDocument(d) && !isEvidenceDocument(d) && !isMiscDocument(d))
    const miscDocuments = (c.documents || []).filter(isMiscDocument)
    const caseTodos = todos
      .filter(t => t.caseId === c.id)
      .sort((a, b) => (a.status === 'Completed') - (b.status === 'Completed') || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
    const pendingTodos = caseTodos.filter(t => t.status !== 'Completed').length
    const today = new Date(new Date().toDateString())

    // One document row, the same for the case's documents and its misc. application documents
    const renderDocRow = document => (
      <div
        key={document.id}
        className="case-detail__doc-row case-detail__doc-row--clickable"
        title="Open document"
        onClick={e => {
          e.stopPropagation()
          handleViewDocument(document)
        }}
      >
        <span className="case-detail__doc-icon">
          <Icon name="file" />
        </span>

        <div className="case-detail__doc-body">
          <p className="case-detail__doc-name">
            {documentTitle(document)}
            <DocInfoButton doc={document} />
          </p>

          <p className="case-detail__doc-meta">
            {documentTypeLabel(document) && `${documentTypeLabel(document)} • `}
            {document.size || 'Unknown size'}
            {' • '}
            {document.date || ''}
          </p>
        </div>

        {/* Buttons to open, download or delete this document */}
        <div className="case-detail__doc-actions">
          <button type="button"
            className="btn-outline btn-outline--sm"
            title="Open in this tab"
            onClick={e => {
              e.stopPropagation()
              handleViewDocument(document)
            }}
          >
            <Icon name="eye" /> Open
          </button>

          <button type="button"
            className="btn-icon btn-icon--danger"
            title="Delete document"
            onClick={async e => {
              e.stopPropagation()
              if (await confirmDialog(`Delete document "${documentTitle(document)}"?`)) {
                handleDeleteDocument(c.id, document.id)
              }
            }}
          >
            <Icon name="trash" />
          </button>
        </div>
      </div>
    )
    const evidence = (c.documents || []).filter(isEvidenceDocument)

    return (
      <>
        {/* Status dropdown and the Edit and Delete buttons */}
        <div className="case-detail__actions case-detail__actions--top">
          <CaseStatusSelect
            id={`case-status-${c.id}`}
            status={c.status}
            onChange={next => changeStatus(c, next)}
          />

          <div className="case-detail__actions-right">
            <button type="button"
              className="btn-outline"
              onClick={e => {
                e.stopPropagation()
                openEditCase(c)
              }}
            >
              <Icon name="edit" /> Edit Case
            </button>

            <button type="button"
              className="btn-outline btn-outline--danger"
              onClick={e => confirmDeleteCase(e, c)}
            >
              <Icon name="trash" /> Delete Case
            </button>
          </div>
        </div>

        {/* A case without a client has no one to send WhatsApp reminders to */}
        {!c.clientId && !(c.additionalClients?.length) && !isClosedCase(c) && (
          <p className="case-detail__note">
            No client is linked to this case, so hearing reminders cannot be sent. Use Edit Case to add one.
          </p>
        )}

        {/* Data that looks wrong or out of date (hearing date passed, filing year that does not fit the case number) */}
        {caseWarnings(c).map(n => (
          <p key={n.key} className="case-detail__note">{n.text}</p>
        ))}

        {/* Case details */}
        <CaseFields caseItem={c} clients={clients} showParties={false} withLastHearing />
        <CaseParties caseItem={c} clients={clients} />

        {/* Hearing History section (collapsible) */}
        <div className={`exp-card${openSections.hearings ? ' exp-card--open' : ''} u-mt-8`} >
          <button type="button" className="exp-card__head" onClick={e => toggleSection(e, 'hearings')}>
            <div className="exp-card__avatar"><Icon name="calendar" /></div>
            <div className="exp-card__titles">
              <p className="exp-card__primary">Hearing History</p>
              <p className="exp-card__secondary">
                {(() => {
                  const n = hearingCountsByCase.get(c.id) || 0
                  return `${n} hearing${n !== 1 ? 's' : ''}`
                })()}
              </p>
            </div>
            <span className="exp-card__arrow">{openSections.hearings ? '▲' : '▼'}</span>
          </button>
          {/* Hearing history list */}
          {openSections.hearings && (
            <div className="exp-card__body">
              <CaseHearings caseItem={c} />
            </div>
          )}
        </div>

        {/* Documents section (collapsible) */}
        <div className={`exp-card${openSections.documents ? ' exp-card--open' : ''} u-mt-8`} >
          <button type="button" className="exp-card__head" onClick={e => toggleSection(e, 'documents')}>
            <div className="exp-card__avatar"><Icon name="file" /></div>
            <div className="exp-card__titles">
              <p className="exp-card__primary">Documents</p>
              <p className="exp-card__secondary">
                {documents.length + miscDocuments.length} file{documents.length + miscDocuments.length !== 1 ? 's' : ''}
              </p>
            </div>
            <span className="exp-card__arrow">{openSections.documents ? '▲' : '▼'}</span>
          </button>

          {/* Document list and upload button */}
          {openSections.documents && (
            <div className="exp-card__body">
              {/* Empty state, otherwise one row per document */}
              {documents.length === 0 && miscDocuments.length === 0 ? (
                <p className="case-card__info">
                  No documents attached
                </p>
              ) : (
                documents.map(renderDocRow)
              )}

              {/* Documents filed with the case's misc. applications: their own expandable inside Documents */}
              <MiscDocsSection
                docs={miscDocuments}
                renderRow={renderDocRow}
                nested
                open={!!openSections.misc}
                onToggle={e => toggleSection(e, 'misc')}
              />

              {/* Upload Document button */}
              <div className="case-detail__actions">
                <button type="button"
                  className="btn-outline btn-outline--sm"
                  onClick={e => {
                    e.stopPropagation()
                    setUploadDocCaseId(c.id)
                  }}
                >
                  + Upload Document
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Evidence section (collapsible) */}
        <div className={`exp-card${openSections.evidence ? ' exp-card--open' : ''} u-mt-8`} >
          <button type="button" className="exp-card__head" onClick={e => toggleSection(e, 'evidence')}>
            <div className="exp-card__avatar"><Icon name="film" /></div>
            <div className="exp-card__titles">
              <p className="exp-card__primary">Evidence</p>
              <p className="exp-card__secondary">
                {evidence.length} item{evidence.length !== 1 ? 's' : ''}
              </p>
            </div>
            <span className="exp-card__arrow">{openSections.evidence ? '▲' : '▼'}</span>
          </button>

          {/* Evidence list and upload button */}
          {openSections.evidence && (
            <div className="exp-card__body">
              <div className="case-detail__docs-label-row">
                <button type="button"
                  className="btn-outline btn-outline--sm"
                  onClick={e => {
                    e.stopPropagation()
                    setEvidenceCategory('Case')
                    setEvidenceTargetId(c.id)
                    setShowUploadEvidence(true)
                  }}
                >
                  + Upload Evidence
                </button>
              </div>

              {/* Empty state, otherwise one row per evidence item */}
              {evidence.length === 0 ? (
                <p className="case-card__info">
                  No evidence attached
                </p>
              ) : (
                evidence.map(document => (
                  <div
                    key={document.id}
                    className="case-detail__doc-row case-detail__doc-row--clickable"
                    title="Open evidence"
                    onClick={e => {
                      e.stopPropagation()
                      handleViewDocument(document)
                    }}
                  >
                    <span className="case-detail__doc-icon">
                      <Icon name="film" />
                    </span>

                    <div className="case-detail__doc-body">
                      <p className="case-detail__doc-name">
                        {evidenceTitle(document)}
                        <DocInfoButton doc={document} />
                      </p>

                      <p className="case-detail__doc-meta">
                        {document.size || 'Unknown size'}
                        {' • '}
                        {document.date || ''}
                      </p>
                    </div>

                    <div className="case-detail__doc-actions">
                      <button type="button"
                        className="btn-outline btn-outline--sm"
                        title="Open in this tab"
                        onClick={e => {
                          e.stopPropagation()
                          handleViewDocument(document)
                        }}
                      >
                        <Icon name="eye" /> Open
                      </button>

                      <button type="button"
                        className="btn-icon btn-icon--danger"
                        title="Delete evidence"
                        onClick={async e => {
                          e.stopPropagation()
                          if (await confirmDialog(`Delete evidence "${evidenceTitle(document)}"?`)) {
                            handleDeleteDocument(c.id, document.id)
                          }
                        }}
                      >
                        <Icon name="trash" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* To-Do section: only when the case has linked to-dos */}
        {caseTodos.length > 0 && (
        <div className={`exp-card${openSections.todos ? ' exp-card--open' : ''} u-mt-8`} >
          <button type="button" className="exp-card__head" onClick={e => toggleSection(e, 'todos')}>
            <div className="exp-card__avatar"><Icon name="clipboard" /></div>
            <div className="exp-card__titles">
              <p className="exp-card__primary">To-Do</p>
              <p className="exp-card__secondary">
                {caseTodos.length} task{caseTodos.length !== 1 ? 's' : ''}
                {pendingTodos > 0 ? ` • ${pendingTodos} pending` : ''}
              </p>
            </div>
            <span className="exp-card__arrow">{openSections.todos ? '▲' : '▼'}</span>
          </button>

          {openSections.todos && (
            <div className="exp-card__body">
              {caseTodos.length === 0 ? (
                <p className="case-card__info">No to-dos linked to this case</p>
              ) : (
                caseTodos.map(todo => (
                  <div
                    key={todo.id}
                    className={`case-todo-row${todo.status === 'Completed' ? ' case-todo-row--done' : ''}`}
                    onClick={e => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      className="case-todo-row__check"
                      aria-label={`Mark "${todo.title}" as ${todo.status === 'Completed' ? 'pending' : 'completed'}`}
                      checked={todo.status === 'Completed'}
                      onChange={() => updateTodo(todo.id, { status: todo.status === 'Completed' ? 'Pending' : 'Completed' })}
                    />
                    <div className="case-todo-row__body">
                      <p className="case-todo-row__title">{todo.title}</p>
                      {todo.description && <p className="case-todo-row__desc">{todo.description}</p>}
                      <div className="case-todo-row__meta">
                        <span className="todo-status">{todo.status}</span>
                        {todo.category && <span className="todo-category-tag">{todo.category}</span>}
                        {todo.dueDate && (
                          <span className={`todo-due-date${todo.status !== 'Completed' && new Date(todo.dueDate) < today ? ' todo-due-date--overdue' : ''}`}>
                            <Icon name="calendar" /> {new Date(todo.dueDate).toLocaleDateString('en-IN')}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-icon"
                      aria-label="Unlink from this case"
                      title="Unlink from this case"
                      onClick={() => updateTodo(todo.id, { clearCase: true, caseId: null })}
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        )}

        {/* WhatsApp reminders: automatic reminder switch, send now button and how many days before the hearing to send it */}
        {!isClosedCase(c) && (
        <div
          className="case-detail__whatsapp"
          onClick={e => e.stopPropagation()}
        >
          <p className="case-detail__docs-label">
            WhatsApp reminders
          </p>

          <div className="case-detail__whatsapp-row">
            <ToggleSwitch
              checked={caseRemindersOn(c)}
              disabled={!!whatsappBusy[`case-${c.id}`]}
              title={caseHasReminderNumber(c)
                ? undefined
                : 'No phone number saved — click to add one'}
              onChange={() => toggleCaseReminders(c)}
              label="Automatic reminder"
            />

            <button
              className="btn-outline btn-outline--sm"
              data-short="Remind"
              disabled={!c.nextHearing || !!whatsappBusy[`hearing-${c.id}`]}
              title={c.nextHearing
                ? 'Send the client a WhatsApp reminder now'
                : 'Set a next hearing date first'}
              onClick={() => sendHearingReminder(c)}
            >
              <Icon name="chat" /> Send reminder now
            </button>
          </div>

          {/* Choose whether the automatic reminder goes out 1 or 2 days before the hearing */}
          <div className="case-detail__whatsapp-timing">
            <span className="case-detail__whatsapp-timing-label">Send it</span>
            <div
              className="wa-days-toggle"
              role="group"
              aria-label="Days before the hearing to send the automatic reminder"
            >
              <button
                type="button"
                className={`wa-days-toggle__btn${(c.reminderDaysBefore || 1) === 1 ? ' wa-days-toggle__btn--active' : ''}`}
                disabled={!caseRemindersOn(c) || !!whatsappBusy[`case-${c.id}`]}
                onClick={() => setCaseReminderDays(c, 1)}
              >
                1 day before
              </button>
              <button
                type="button"
                className={`wa-days-toggle__btn${(c.reminderDaysBefore || 1) === 2 ? ' wa-days-toggle__btn--active' : ''}`}
                disabled={!caseRemindersOn(c) || !!whatsappBusy[`case-${c.id}`]}
                onClick={() => setCaseReminderDays(c, 2)}
              >
                2 days before
              </button>
            </div>
          </div>
        </div>
        )}

        {/* Transactions button for this case (hidden from associates) */}
        {!isAssociate && (
          <div className="case-detail__transactions">
            <button type="button"
              className="btn-outline case-detail__transactions-btn"
              onClick={e => {
                e.stopPropagation()
                setTransactionCaseId(c.id)
              }}
            >
              <span><Icon name="money" /> Transaction Details</span>
              <span className="case-detail__transactions-meta">View ›</span>
            </button>
          </div>
        )}
      </>
    )
  }

  return (
    <div style={windowOnly ? { display: 'none' } : undefined}>
      {/* Page title and the Add Case button */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Case Management</h1>
          <p className="page-subtitle">Track your cases, hearings and case details in one place</p>
        </div>

        <div className="page-header__actions">
          <button type="button" className="btn-outline" onClick={() => setImportOpen(true)}>
            <Icon name="upload" /> Import from eCourts
          </button>
          <button type="button" className="btn-outline" onClick={() => setScannerOpen(true)}>
            <Icon name="qr-scan" /> Scan QR
          </button>
          <button type="button"
            className="btn-gold"
            onClick={() => openAddCase()}
          >
            + Add Case
          </button>
        </div>
      </div>

      {noFileOpen && (
        <NoFileNumberModal
          cases={cases}
          onClose={() => setNoFileOpen(false)}
          onOpenCase={openCaseFromNoFile}
          onSave={(id, fileNo) => handleUpdateCase(id, { fileNo })}
        />
      )}

      {windowCase && (
        <ModalPortal>
          <div className="overlay" {...caseWindowHandlers}>
            <div className="modal modal--lg case-window" onClick={e => e.stopPropagation()}>
              <div className="modal__header">
                <div className="case-window__heading">
                  <span className="case-card__status">
                    <span className="case-card__status-dot" aria-hidden="true" style={{ background: STATUS_COLORS[windowCase.status] || '#999' }} />
                    {windowCase.status}
                  </span>
                  <h2 className="modal__title case-window__title">{windowCase.title}</h2>
                </div>
                <button aria-label="Close" title="Close" type="button" className="btn-icon" onClick={() => setWindowCaseId(null)}><Icon name="close" /></button>
              </div>
              <div className="case-window__body">
                <CaseSummaryFields caseItem={windowCase} />
                <div className="case-detail">{renderCaseDetail(windowCase)}</div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {importOpen && (
        <ImportCasesModal
          items={importItems}
          onClose={() => setImportOpen(false)}
          onLoaded={list => { setImportItems(list); saveImported(list, importOwnerId); uploadImported(list) }}
          onClear={() => { setImportItems(null); forgetImported(importOwnerId) }}
          onAdd={item => {
            // Only the CNR is passed on: the Add Case window asks eCourts for the case, and the list comes back after it closes
            backToImport.current = true
            setImportOpen(false)
            openAddCase(item.cnr)
          }}
        />
      )}

      {scannerOpen && (
        <CnrScannerModal
          onClose={() => setScannerOpen(false)}
          onScan={cnr => {
            setScannerOpen(false)
            openAddCase(cnr)
          }}
        />
      )}

      {/* Count tiles: all cases and each status. Clicking one picks that status in the list below */}
      <div className="status-tiles case-filters" role="group" aria-label="Cases by status">
        {STATUSES.map(status => (
          <button
            key={status}
            type="button"
            className={`status-tile${filterStatus === status ? ' status-tile--active' : ''}`}
            style={status === 'All' ? undefined : { '--tile-accent': STATUS_COLORS[status] }}
            onClick={() => chooseStatus(status)}
            aria-pressed={filterStatus === status}
          >
            <span className="status-tile__label">
              {status !== 'All' && <span className="status-tile__dot" aria-hidden="true" />}
              {status === 'All' ? 'All Cases' : status}
            </span>
            <span className="status-tile__value">{statusCounts[status] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Search box, Filter menu and sort dropdown */}
      <div className="list-toolbar">
        <SearchInput
          ref={searchInputRef}
          placeholder="Search cases, CNR, court, judge, client…"
          title="Search by title, case no, file no, CNR, court, judge, client, or opposite party"
          value={search}
          onChange={setSearch}
        />

        {/* Filter menu button and its panel */}
        <div className="case-filter-menu" ref={filterMenuRef}>
          <button
            type="button"
            className={`btn-outline${hasCaseFilters ? ' case-filter-menu__trigger--active' : ''}`}
            onClick={() => setFilterMenuOpen(o => !o)}
          >
            <Icon name="filter" /> Filter{hasCaseFilters && <span className="case-filter-menu__count">{activeCaseFilterCount}</span>}
          </button>

          {/* Backdrop and panel with one row per filter field */}
          {filterMenuOpen && (
            <>
              <div className="case-filter-menu__backdrop" onClick={closeCaseFilterMenu} />

              <div
                className="case-filter-menu__panel"
                ref={filterPanelRef}
                style={filterPanelPos
                  ? { left: filterPanelPos.left, right: 'auto', width: filterPanelPos.width }
                  : { visibility: 'hidden' }}
              >
                {/* One row per filter field; click to show its options */}
                {CASE_FILTER_FIELDS.map(([field, label]) => {
                  let valueLabel = 'Any'
                  if (field === 'court') valueLabel = filterCourt === 'All' ? 'Any' : filterCourt
                  if (field === 'nature') valueLabel = filterNature === 'All' ? 'Any' : filterNature
                  if (field === 'relief') valueLabel = filterRelief === 'All' ? 'Any' : filterRelief
                  if (field === 'caseType') valueLabel = filterCaseType === 'All' ? 'Any' : filterCaseType
                  if (field === 'dateInterval') {
                    valueLabel = filterDateFrom || filterDateTo
                      ? (DATE_PRESETS.find(([k]) => k === filterDatePreset)?.[1]
                      || `${filterDateFrom ? formatShortDate(filterDateFrom) : '…'} → ${filterDateTo ? formatShortDate(filterDateTo) : '…'}`)
                      : 'Any'
                  }

                  const fieldActive = valueLabel !== 'Any'

                  return (
                    <div key={field} className="case-filter-menu__field">
                      <button
                        type="button"
                        className="case-filter-menu__row"
                        onClick={() => toggleFilterField(field)}
                      >
                        <span className="case-filter-menu__label">{label}</span>
                        <span className="case-filter-menu__value-wrap">
                          <span className="case-filter-menu__value">{valueLabel}</span>
                          {fieldActive && (
                            <span
                              role="button"
                              tabIndex={0}
                              className="case-filter-menu__field-clear"
                              title={`Remove ${label} filter`}
                              onClick={e => {
                                e.stopPropagation()
                                clearFilterField(field)
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  clearFilterField(field)
                                }
                              }}
                            >
                              <Icon name="close" />
                            </span>
                          )}
                        </span>
                      </button>

                      {/* Options for the selected field */}
                      {activeFilterField === field && (
                        <div className="case-filter-menu__control">
                          {field === 'court' && (
                            <Dropdown
                              className="form-input"
                              value={filterCourt}
                              onChange={e => {
                                setFilterCourt(e.target.value)
                                setActiveFilterField(null)
                              }}
                            >
                              <option value="All">All Courts</option>
                              {courtOptions.map(n => (
                                <option key={n} value={n}>{n}</option>
                              ))}
                            </Dropdown>
                          )}

                          {field === 'nature' && (
                            <Dropdown
                              className="form-input"
                              touchSearch={false}
                              value={filterNature}
                              onChange={e => {
                                changeFilterNature(e.target.value)
                                setActiveFilterField(null)
                              }}
                            >
                              <option value="All">All Case Natures</option>
                              {(natureOptionsInUse.length ? natureOptionsInUse : CASE_NATURES).map(n => (
                                <option key={n} value={n}>{n}</option>
                              ))}
                            </Dropdown>
                          )}

                          {field === 'relief' && (
                            <Dropdown
                              className="form-input"
                              value={filterRelief}
                              onChange={e => {
                                setFilterRelief(e.target.value)
                                setActiveFilterField(null)
                              }}
                            >
                              <option value="All">All Reliefs Sought</option>
                              {filterReliefChoices.map(r => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </Dropdown>
                          )}

                          {field === 'caseType' && (
                            <Dropdown
                              className="form-input"
                              value={filterCaseType}
                              onChange={e => {
                                setFilterCaseType(e.target.value)
                                setActiveFilterField(null)
                              }}
                            >
                              <option value="All">All Case Types</option>
                              {caseTypeOptionsInUse.map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </Dropdown>
                          )}

                          {/* Hearing date from / to inputs */}
                          {field === 'dateInterval' && (
                            <div className="case-filter-menu__date-range">
                              <div className="case-filter-menu__presets">
                                {DATE_PRESETS.map(([key, label]) => (
                                  <button
                                    key={key}
                                    type="button"
                                    className={`case-filter-btn${filterDatePreset === key ? ' case-filter-btn--active' : ''}`}
                                    onClick={() => applyDatePreset(key)}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                              <label className="case-filter-menu__date-row">
                                <span className="case-filter-menu__date-label">From</span>
                                <ClearableDateInput
                                  
                                  className="form-input"
                                  value={filterDateFrom}
                                  onChange={e => { setFilterDateFrom(e.target.value); setFilterDatePreset('') }}
                                />
                              </label>
                              <label className="case-filter-menu__date-row">
                                <span className="case-filter-menu__date-label">To</span>
                                <ClearableDateInput
                                  
                                  className="form-input"
                                  value={filterDateTo}
                                  onChange={e => { setFilterDateTo(e.target.value); setFilterDatePreset('') }}
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Clear Filters button */}
                {hasCaseFilters && (
                  <button
                    type="button"
                    className="btn-outline case-filter-menu__clear"
                    onClick={clearCaseFilters}
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Open cases that still need a file number (same wrapper as the Filter button so the two match) */}
        <div className="case-filter-menu case-filter-menu--nofile">
          <button type="button" className="btn-outline" onClick={() => setNoFileOpen(true)}
            title="Open cases that have no file number">
            <Icon name="file" /> No File No.{noFileCount > 0 ? ` (${noFileCount})` : ''}
          </button>
        </div>

        <div className="sort-control">
          <label htmlFor="cases-sort">Sort:</label>
          <Dropdown
            id="cases-sort"
            searchable={false}
            className="form-input"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
          >
            {/* Sort dropdown options */}
            {SORT_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Dropdown>
        </div>
      </div>

      {/* Summary of what is narrowing the list: how many filters are on, each one removable, and Clear all */}
      {totalActiveCount > 0 && (
        <div className="case-filter-chips">
          <span className="case-filter-summary" role="status">
            {totalActiveCount} filter{totalActiveCount !== 1 ? 's' : ''} on
          </span>
          {activeFilterChips.map(chip => (
            <span key={chip.field} className="case-filter-chip">
              <span className="case-filter-chip__text">
                <strong>{chip.label}:</strong> {chip.value}
              </span>
              <button
                type="button"
                className="case-filter-chip__remove"
                title={`Remove ${chip.label} filter`}
                aria-label={`Remove ${chip.label} filter`}
                onClick={() => clearFilterField(chip.field)}
              >
                <Icon name="close" />
              </button>
            </span>
          ))}
          <button type="button" className="case-filter-chips__clear" onClick={clearEverything}>
            Clear all
          </button>
        </div>
      )}

      {/* Case cards */}
      <div className="case-list">
        {/* One card per case */}
        {displayCases.map(c => {
          // Whether this card is expanded
          const expanded = selectedCase?.id === c.id

          return (
            <div
              key={c.id}
              ref={el => { if (el) cardEls.current.set(c.id, el); else cardEls.current.delete(c.id) }}
              className={`card case-card${expanded ? ' case-card--open' : ''}`}
              style={{ '--case-accent': STATUS_COLORS[c.status] || '#999', scrollMarginTop: 72 }}
              onClick={e => {
                // Clicks inside the expanded details (or in pop-ups opened from them) never toggle the card
                if (!e.currentTarget.contains(e.target) || e.target.closest('.case-detail')) return
                noteCardPositions()
                setOpenSections({ hearings: false, documents: false, evidence: false })
                setSelectedCase(expanded ? null : c)
              }}
            >
              {/* Status, title and summary details, plus next hearing and fee */}
              <div className="case-card__header">
                <div className="case-card__left">

                  <div className="case-card__meta-row">
                    <span className="case-card__status">
                      <span className="case-card__status-dot" aria-hidden="true" />
                      {c.status}
                    </span>
                  </div>

                  <h3 className="case-card__title">
                    {c.title}
                  </h3>

                  {!expanded && <CaseSummaryFields caseItem={c} />}
                </div>

                {/* Next hearing date, only when the case has one (the fee is not shown on the card).
                    Refresh symbol: on the hearing day after 5 PM; from 12 AM an undated old date is dropped and only the symbol stays */}
                {c.nextHearing && !isClosedCase(c) && (
                  <NextHearingBox
                    date={c.nextHearing}
                    refreshTitle="Refresh the next hearing date from eCourts"
                    onRefresh={() => refreshCardHearing(c)}
                    busyPath={`/cases/${c.id}/refresh-hearing`}
                  />
                )}
              </div>

              {/* Expanded case details */}
              {expanded && (
                <div className="case-detail">
                  {renderCaseDetail(c)}
                </div>
              )}
            </div>
          )
        })}

        {/* See more when the list is long */}
        <SeeMore remaining={casesRemaining} onClick={showMoreCases} />

        {/* Empty state when no cases match */}
        {searchedCases.length === 0 && (
          <div className="empty-state">
            <div className="empty-state__icon">
              <Icon name="folder" duotone />
            </div>

            {filterStatus === 'All' && filteredCases.length === 0 ? (
              <>
                <p className="empty-state__title">No cases yet</p>
                <p className="empty-state__desc">Add your first case to start tracking hearings and documents.</p>
                <div className="u-actions-center">
                  <button type="button" className="btn-gold" onClick={() => openAddCase()}>+ Add Case</button>
                </div>
              </>
            ) : (
              <>
                <p className="empty-state__title">No cases found</p>
                <p className="empty-state__desc">
                  {filterStatus !== 'All' ? `Showing ${filterStatus} cases only. ` : ''}
                  Nothing matches your current search or filters.
                </p>
                {/* One-click ways out of an empty view */}
                <div className="u-actions-center">
                  {filterStatus !== 'All' && (
                    <button type="button" className="btn-outline btn-outline--sm" onClick={() => chooseStatus('All')}>Show all cases</button>
                  )}
                  {search && (
                    <button type="button" className="btn-outline btn-outline--sm" onClick={() => setSearch('')}>Clear search</button>
                  )}
                  {hasCaseFilters && (
                    <button type="button" className="btn-outline btn-outline--sm" onClick={clearCaseFilters}>Clear filters</button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}