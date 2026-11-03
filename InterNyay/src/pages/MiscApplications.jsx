import AutoLoad from '../components/common/AutoLoad'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import api from '../services/api'
import { onLiveRefresh } from '../utils/liveRefresh'
import { MISC_ALLOWED, MISC_APP_NAME, MISC_DISALLOWED, MISC_DISPOSED, MISC_PENDING } from '../constants/data'
import { getErrorMessage } from '../utils/errorMessages'
import { statusText } from '../components/misc/miscUtils'
import MiscSummaryFields from '../components/misc/MiscSummaryFields'
import AddMiscApplicationModal from '../components/modals/AddMiscApplicationModal'
import MiscApplicationDetailModal from '../components/modals/MiscApplicationDetailModal'
import FitLabel from '../components/common/FitLabel'
import Icon from '../components/common/Icon'
import NextHearingBox from '../components/common/NextHearingBox'
import useClockTick from '../hooks/useClockTick'
import { hearingBoxPhase } from '../utils/dateUtils'
import MiscNextHearingModal from '../components/misc/MiscNextHearingModal'

// Status filter buttons as [filter value, label]
const FILTERS = [['', 'All'], [MISC_PENDING, 'Pending'], [MISC_DISPOSED, 'Disposed Off']]
// Under "Disposed Off": all of them, or only the allowed or the disallowed ones, as [outcome value, label]
const OUTCOME_FILTERS = [['', 'All'], [MISC_ALLOWED, 'Allowed'], [MISC_DISALLOWED, 'Disallowed']]
// Which total goes on which chip (keys of the counts the server sends)
const STATUS_COUNT_KEY = { '': 'all', [MISC_PENDING]: 'pending', [MISC_DISPOSED]: 'disposed' }
// Chip colours, the same as the Cases page and the application cards (All has none)
const CHIP_COLORS = { [MISC_PENDING]: '#0B7A75', [MISC_DISPOSED]: '#C62828', [MISC_ALLOWED]: '#E67E22', [MISC_DISALLOWED]: '#6b7385' }
const OUTCOME_COUNT_KEY = { '': 'disposed', [MISC_ALLOWED]: 'allowed', [MISC_DISALLOWED]: 'disallowed' }
const PAGE_SIZE = 20
// Card accent per status (pending, or how a disposed off application ended)
const ACCENTS = { Pending: '#0B7A75', Disposed: '#C62828', [MISC_ALLOWED]: '#E67E22', [MISC_DISALLOWED]: '#6b7385' }

// Misc. Application page: applications filed in cases, with search, a status filter, and the add and detail windows
export default function MiscApplications() {
  const { addToast } = useApp()
  const location = useLocation()
  const navigate = useNavigate()

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  // Allowed or Disallowed, only used while Disposed Off is chosen
  const [outcome, setOutcome] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  // Totals shown on the chips (not affected by the search): { all, pending, disposed, allowed, disallowed }
  const [counts, setCounts] = useState(null)
  const [openId, setOpenId] = useState(null)
  // Application whose Update Next Hearing window is open (from the refresh symbol on its card)
  const [updateApp, setUpdateApp] = useState(null)

  // The connector under the status chips starts at the middle of the Disposed Off chip, wherever that chip sits
  const chipsRef = useRef(null)
  const subChipsRef = useRef(null)
  const [elbowX, setElbowX] = useState(null)
  const [childX, setChildX] = useState(null)
  useLayoutEffect(() => {
    const row = chipsRef.current
    const measure = () => {
      const chip = row?.querySelector('[data-chip="disposed"]')
      if (!row || !chip) return
      const r = row.getBoundingClientRect()
      const c = chip.getBoundingClientRect()
      setElbowX(Math.round(c.left - r.left + c.width / 2))
      const first = subChipsRef.current?.querySelector('button')
      if (first) {
        const f = first.getBoundingClientRect()
        setChildX(Math.round(f.left - r.left + f.width / 2))
      }
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    row?.addEventListener('scroll', measure)
    document.fonts?.ready?.then(measure)
    // The chips can change size without the window resizing (font load, zoom, a long label), so the row itself is watched too
    const observer = typeof ResizeObserver !== 'undefined' && row ? new ResizeObserver(measure) : null
    if (observer) observer.observe(row)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
      row?.removeEventListener('scroll', measure)
      observer?.disconnect()
    }
  }, [status])

  // Reloads the chip totals quietly; a failure leaves the numbers as they were
  const loadCounts = useCallback(() => {
    api.miscApplications.counts().then(res => { if (res) setCounts(res) }).catch(() => {})
  }, [])
  useEffect(() => { loadCounts() }, [loadCounts])

  // Only the answer to the newest search is used, so a slow earlier answer cannot replace it
  const latest = useRef(0)

  const load = useCallback(async (pageNo, replace) => {
    const ticket = ++latest.current
    setLoading(true)
    try {
      const res = await api.miscApplications.list({ search: search.trim(), status, outcome: status === MISC_DISPOSED ? outcome : '', page: pageNo, size: PAGE_SIZE })
      if (ticket !== latest.current) return
      const rows = res?.content || []
      setItems(prev => (replace ? rows : [...prev, ...rows.filter(r => !prev.some(p => p.id === r.id))]))
      // The server sends either a `last` flag or a `page` block (number and totalPages); without both, a short page is the last one
      const info = res?.page
      const isLast = typeof res?.last === 'boolean'
        ? res.last
        : info && Number.isFinite(info.totalPages)
          ? info.number + 1 >= info.totalPages
          : rows.length < PAGE_SIZE
      setHasMore(!isLast && rows.length > 0)
      setPage(pageNo)
    } catch (e) {
      if (ticket === latest.current) {
        addToast(getErrorMessage(e, 'Could not load the applications'), 'error')
        // A failed next page stops the automatic loading, so one error does not repeat in a loop; changing the search or filter starts again
        if (!replace) setHasMore(false)
      }
    } finally {
      if (ticket === latest.current) setLoading(false)
    }
  }, [search, status, outcome, addToast])

  // Background reload of the pages already on screen (another device may have added, changed or deleted applications).
  // No spinner; skipped while a normal load is running, and a failure leaves the list as it is
  const loadedPages = useRef(0)
  loadedPages.current = page
  const refreshQuietly = useCallback(async () => {
    const ticket = latest.current
    try {
      const params = { search: search.trim(), status, outcome: status === MISC_DISPOSED ? outcome : '', size: PAGE_SIZE }
      const results = await Promise.all(Array.from({ length: loadedPages.current + 1 }, (_, n) => api.miscApplications.list({ ...params, page: n })))
      if (ticket !== latest.current) return
      const rows = results.flatMap(r => r?.content || [])
      setItems(rows.filter((r, i) => rows.findIndex(x => x.id === r.id) === i))
    } catch { /* keep the list as it is */ }
  }, [search, status, outcome])
  useEffect(() => onLiveRefresh(() => { loadCounts(); if (!loading) refreshQuietly() }), [refreshQuietly, loading, loadCounts])

  // Starts again from the first page when the search or the filter changes (the search waits for a pause in typing)
  useEffect(() => {
    const timer = setTimeout(() => load(0, true), search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [load, search])

  // An application changed in its window: keep the list in step
  const replaceItem = useCallback(updated => {
    setItems(prev => prev.map(a => (a.id === updated.id ? updated : a)))
    setExtra(prev => (prev && prev.id === updated.id ? updated : prev))
    loadCounts()
  }, [loadCounts])

  // An application opened from the dashboard may not be on the first page, so it is fetched by itself
  const [extra, setExtra] = useState(null)
  const wantedId = location.state?.openId
  useEffect(() => {
    if (!wantedId) return
    setOpenId(wantedId)
    api.miscApplications.get(wantedId).then(setExtra).catch(() => {})
    // The request is used up: clear it so a refresh or Back does not open the window again
    navigate(location.pathname, { replace: true, state: null })
  }, [wantedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const opened = items.find(a => a.id === openId) || (extra && extra.id === openId ? extra : null)

  return (
    <div className="misc-page">
      <div className="page-header">
        <div>
          <h1 className="page-title"><FitLabel full={MISC_APP_NAME.full} short={MISC_APP_NAME.short} /></h1>
          <p className="page-subtitle">Applications filed in your cases, with their hearing dates, orders and documents</p>
        </div>
        <button type="button" className="btn-gold" onClick={() => setShowAdd(true)}>+ Add Application</button>
      </div>

      {/* Status chips, the same as on the Cases page */}
      <div className="case-filters" ref={chipsRef}>
        {FILTERS.map(([value, label]) => (
          <button
            key={label}
            data-chip={value === MISC_DISPOSED ? 'disposed' : undefined}
            type="button"
            className={`case-filter-btn${CHIP_COLORS[value] ? ' case-filter-btn--tinted' : ''}${status === value ? ' case-filter-btn--active' : ''}`}
            style={CHIP_COLORS[value] ? { '--chip-accent': CHIP_COLORS[value] } : undefined}
            onClick={() => { setStatus(value); if (value !== MISC_DISPOSED) setOutcome('') }}
          >
            {CHIP_COLORS[value] && <span className="case-filter-btn__dot" aria-hidden="true" />}
            {label}
            {counts && <span className="case-filter-btn__count">{counts[STATUS_COUNT_KEY[value]] ?? 0}</span>}
          </button>
        ))}
      </div>

      {/* Disposed Off can be narrowed to the allowed or the disallowed applications */}
      {status === MISC_DISPOSED && (
        <div className="case-filters misc-subfilters" role="group" aria-label="Disposed off applications" ref={subChipsRef}
          style={elbowX != null ? { '--elbow-x': `${elbowX}px`, '--child-x': `${childX ?? 0}px` } : undefined}>
          {OUTCOME_FILTERS.map(([value, label]) => (
            <button
              key={label}
              type="button"
              className={`case-filter-btn${CHIP_COLORS[value] ? ' case-filter-btn--tinted' : ''}${outcome === value ? ' case-filter-btn--active' : ''}`}
              style={CHIP_COLORS[value] ? { '--chip-accent': CHIP_COLORS[value] } : undefined}
              onClick={() => setOutcome(value)}
            >
              {CHIP_COLORS[value] && <span className="case-filter-btn__dot" aria-hidden="true" />}
              {label}
              {counts && <span className="case-filter-btn__count">{counts[OUTCOME_COUNT_KEY[value]] ?? 0}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="list-toolbar">
        <div className="doc-search-wrap">
          <span className="doc-search-icon"><Icon name="search" /></span>
          <input
            className="form-input doc-search-input"
            placeholder="Search by application, case, case number or client…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="doc-search-clear" aria-label="Clear search" onClick={() => setSearch('')}><Icon name="close" /></button>
          )}
        </div>
      </div>

      {items.length === 0 && !loading && (
        <div className="misc-empty">
          <Icon name="folders" />
          <p>{search || status ? 'No applications match your search.' : 'No applications yet.'}</p>
          {!search && !status && <button type="button" className="btn-gold" onClick={() => setShowAdd(true)}>+ Add your first application</button>}
        </div>
      )}

      {/* Same cards as the Cases page: status pill, title, details and the next hearing box */}
      <div className="case-list">
        {items.map(a => {
          const disposed = a.status === MISC_DISPOSED
          return (
            <div key={a.id} className="card case-card" role="button" tabIndex={0}
              style={{ '--case-accent': ACCENTS[disposed ? (a.disposalOutcome || 'Disposed') : 'Pending'] }}
              onClick={() => setOpenId(a.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(a.id) } }}>
              <div className="case-card__header">
                <div className="case-card__left">
                  <div className="case-card__meta-row">
                    <span className="case-card__status">
                      <span className="case-card__status-dot" aria-hidden="true" />
                      {statusText(a)}
                    </span>
                  </div>

                  <h3 className="case-card__title">{a.applicationType}</h3>

                  <MiscSummaryFields app={a} />
                </div>

                {!disposed && a.hearingDate && (a.portalSynced ? (
                  <NextHearingBox
                    date={a.hearingDate}
                    refreshTitle="Update the next hearing date"
                    onRefresh={() => setUpdateApp(a)}
                  />
                ) : (
                  <UpcomingHearingBox date={a.hearingDate} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {loading && <p className="doc-group__meta misc-loading">Loading…</p>}

      <AutoLoad onLoad={() => load(page + 1, false)} active={hasMore && !loading} depKey={page} />

      {showAdd && (
        <AddMiscApplicationModal
          onClose={() => setShowAdd(false)}
          onCreated={app => {
            setShowAdd(false)
            loadCounts()
            // Shown on top of the list only when it fits the current search and filter, otherwise the list is reloaded
            if (!search && !status) setItems(prev => [app, ...prev.filter(a => a.id !== app.id)])
            else load(0, true)
            setOpenId(app.id)
          }}
        />
      )}

      {updateApp && (
        <MiscNextHearingModal app={updateApp} onChange={replaceItem} onClose={() => setUpdateApp(null)} />
      )}

      {opened && (
        <MiscApplicationDetailModal
          app={opened}
          onChange={replaceItem}
          onDeleted={id => { setItems(prev => prev.filter(a => a.id !== id)); setExtra(null); setOpenId(null); loadCounts() }}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}

function UpcomingHearingBox({ date }) {
  const now = useClockTick()
  if (hearingBoxPhase(date, now) === 'expired') return null
  return <NextHearingBox date={date} />
}
