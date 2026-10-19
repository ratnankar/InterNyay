import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import api from '../services/api'
import { MISC_APP_NAME, MISC_DISPOSED, MISC_PENDING } from '../constants/data'
import { getErrorMessage } from '../utils/errorMessages'
import { formatDisplayDate } from '../utils/dateUtils'
import { statusSlug } from '../components/misc/miscUtils'
import AddMiscApplicationModal from '../components/modals/AddMiscApplicationModal'
import MiscApplicationDetailModal from '../components/modals/MiscApplicationDetailModal'
import FitLabel from '../components/common/FitLabel'
import Icon from '../components/common/Icon'

// Status filter buttons as [filter value, label]
const FILTERS = [['', 'All'], [MISC_PENDING, 'Pending'], [MISC_DISPOSED, 'Disposed Off']]
const PAGE_SIZE = 20

// How many documents an application holds (application, order and the additional ones)
const documentCount = a => (a.applicationDocument ? 1 : 0) + (a.orderDocument ? 1 : 0) + (a.additionalDocuments?.length || 0)

// Misc. Application page: applications filed in cases, with search, a status filter, and the add and detail windows
export default function MiscApplications() {
  const { addToast } = useApp()

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [openId, setOpenId] = useState(null)

  // Only the answer to the newest search is used, so a slow earlier answer cannot replace it
  const latest = useRef(0)

  const load = useCallback(async (pageNo, replace) => {
    const ticket = ++latest.current
    setLoading(true)
    try {
      const res = await api.miscApplications.list({ search: search.trim(), status, page: pageNo, size: PAGE_SIZE })
      if (ticket !== latest.current) return
      const rows = res?.content || []
      setItems(prev => (replace ? rows : [...prev, ...rows.filter(r => !prev.some(p => p.id === r.id))]))
      setHasMore(!res?.last && rows.length > 0)
      setPage(pageNo)
    } catch (e) {
      if (ticket === latest.current) addToast(getErrorMessage(e, 'Could not load the applications'), 'error')
    } finally {
      if (ticket === latest.current) setLoading(false)
    }
  }, [search, status, addToast])

  // Starts again from the first page when the search or the filter changes (the search waits for a pause in typing)
  useEffect(() => {
    const timer = setTimeout(() => load(0, true), search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [load, search])

  // An application changed in its window: keep the list in step
  const replaceItem = useCallback(updated => {
    setItems(prev => prev.map(a => (a.id === updated.id ? updated : a)))
  }, [])

  const opened = items.find(a => a.id === openId) || null

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
      <div className="case-filters">
        {FILTERS.map(([value, label]) => (
          <button
            key={label}
            type="button"
            className={`case-filter-btn${status === value ? ' case-filter-btn--active' : ''}`}
            onClick={() => setStatus(value)}
          >
            {label}
          </button>
        ))}
      </div>

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

      <div className="misc-list">
        {items.map(a => (
          <div key={a.id} className="misc-card" role="button" tabIndex={0}
            onClick={() => setOpenId(a.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(a.id) } }}>
            <div className="misc-card__top">
              <p className="misc-card__title">{a.applicationType}</p>
              <span className={`misc-status misc-status--${statusSlug(a.status)}`}>{a.status}</span>
            </div>
            <p className="misc-card__case">{a.caseTitle}</p>
            <p className="misc-card__meta">{[a.caseNo, a.clientName].filter(Boolean).join(' • ')}</p>
            <div className="misc-card__foot">
              <span><Icon name="calendar" /> {a.hearingDate ? `Hearing ${formatDisplayDate(a.hearingDate)}` : 'No hearing date'}</span>
              <span><Icon name="file" /> {documentCount(a)} document{documentCount(a) === 1 ? '' : 's'}</span>
            </div>
          </div>
        ))}
      </div>

      {loading && <p className="doc-group__meta misc-loading">Loading…</p>}

      {hasMore && !loading && (
        <div className="misc-more"><button type="button" className="btn-outline" onClick={() => load(page + 1, false)}>Show more</button></div>
      )}

      {showAdd && (
        <AddMiscApplicationModal
          onClose={() => setShowAdd(false)}
          onCreated={app => {
            setShowAdd(false)
            // Shown on top of the list only when it fits the current search and filter, otherwise the list is reloaded
            if (!search && !status) setItems(prev => [app, ...prev.filter(a => a.id !== app.id)])
            else load(0, true)
            setOpenId(app.id)
          }}
        />
      )}

      {opened && (
        <MiscApplicationDetailModal
          app={opened}
          onChange={replaceItem}
          onDeleted={id => { setItems(prev => prev.filter(a => a.id !== id)); setOpenId(null) }}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}
