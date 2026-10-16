import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../../context/AppContext'
import Icon from '../common/Icon'
import ModalPortal from '../../components/common/ModalPortal'

// How many recently added clients are suggested before anything is typed
const SUGGESTION_COUNT = 5

// Newest clients first; falls back to the id (ids grow with every new client) when there is no created date
function newestFirst(a, b) {
  const byDate = String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  return byDate !== 0 ? byDate : Number(b.id) - Number(a.id)
}

// Step 1 popup: is the case new, or already running in court?
export function CaseAgePrompt({ onChoose, onClose }) {
  return (
    <ModalPortal>
      <div className="overlay">
        <div className="modal modal--sm" onClick={e => e.stopPropagation()}>

          <div className="modal__header">
            <h2 className="modal__title">New Case</h2>
            <button aria-label="Close" title="Close" type="button" className="btn-icon" onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>

          <p className="form-label u-mb-12">
            Is this case new or already running in court?
          </p>

          <div className="u-flex-8">
            <button type="button" className="btn-gold u-flex-1"  onClick={() => onChoose('FRESH')}>
              Fresh case
            </button>
            <button type="button" className="btn-outline u-flex-1"  onClick={() => onChoose('OLD')}>
              Old case
            </button>
          </div>

          <p className="case-parties__hint u-mt-10">
            An old case is added with its CNR number; its hearing dates and orders are taken from eCourts.
          </p>
        </div>
      </div>
    </ModalPortal>
  )
}

// Step 2 popup: search for the client, with the most recently added clients suggested first
export function ClientSearchPrompt({ onClose }) {
  const { clients, caseClients, selectClient, setShowAddClient } = useApp()
  const [query, setQuery] = useState('')

  // Attach the client and close the window
  const choose = c => { selectClient(c); onClose() }
  // Close this window first so the Add Client form is not hidden behind it
  const addNew = () => { onClose(); setShowAddClient('fromCase') }

  const q = query.trim().toLowerCase()

  // Escape closes this window only, not the New Case form underneath it
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // Clients not yet on the case: the newest few when nothing is typed, otherwise the matches
  const { list, hasMatches, onCaseMatch, allAdded } = useMemo(() => {
    const chosen = new Set(caseClients.map(c => Number(c.id)))
    const available = [...clients].filter(c => !chosen.has(Number(c.id))).sort(newestFirst)

    // Every client is already on this case: say so instead of showing an empty window
    if (!q) {
      return {
        list: available.slice(0, SUGGESTION_COUNT),
        hasMatches: available.length > 0,
        onCaseMatch: false,
        allAdded: clients.length > 0 && available.length === 0,
      }
    }

    const matchesQuery = c =>
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.whatsappPhone?.includes(q) ||
      c.additionalPhone?.includes(q)

    const matches = available.filter(matchesQuery)

    // The typed client exists but is already on the case, so it must not be called "not found" or offered as a new (duplicate) client
    const onCaseMatch = matches.length === 0 &&
      clients.some(c => chosen.has(Number(c.id)) && matchesQuery(c))

    return { list: matches.slice(0, 8), hasMatches: matches.length > 0, onCaseMatch, allAdded: false }
  }, [clients, caseClients, q])

  // Rendered on document.body: inside the Add Case window its backdrop was clipped to that window's box and stopped part-way down
  return createPortal(
    <div className="overlay overlay--stacked">
      <div className="modal modal--md" onClick={e => e.stopPropagation()}>

        <div className="modal__header">
          <h2 className="modal__title">Select Client</h2>
          <button aria-label="Close" title="Close" type="button" className="btn-icon" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        {/* Add Client sits beside the search box: it is the natural next step when the person is not in the list */}
        <div className="client-search-row">
          <input
            className="form-input"
            placeholder="Search client by name, email or phone…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoComplete="off"
            autoFocus
          />
          <button type="button" className="btn-add-client" onClick={addNew}>
            <span aria-hidden="true">+</span> Add Client
          </button>
        </div>

        {!q && list.length > 0 && (
          <p className="case-parties__hint u-mb-6">Recently added clients</p>
        )}

        {list.length > 0 && (
          <div className="client-result-list">
            {list.map(c => (
              <div key={c.id} className="client-result" onClick={() => choose(c)}>
                <div className="client-result__info">
                  <p className="client-result__name">{c.name}</p>
                  <p className="client-result__meta">{c.email}</p>
                </div>
                <button type="button" className="btn-gold client-result__select" onClick={e => { e.stopPropagation(); choose(c) }}>
                  Select
                </button>
              </div>
            ))}
          </div>
        )}

        {q && !hasMatches && onCaseMatch && (
          <div className="client-not-found">
            <p className="client-not-found__text">This client is already added to the case.</p>
          </div>
        )}

        {q && !hasMatches && !onCaseMatch && (
          <div className="client-not-found">
            <p className="client-not-found__text">Client not found. Use <strong>+ Add Client</strong> to add them as a new client.</p>
          </div>
        )}

        {!q && allAdded && (
          <div className="client-not-found">
            <p className="client-not-found__text">All your clients are already added to this case. Use <strong>+ Add Client</strong> to add a new one.</p>
          </div>
        )}

        {!q && clients.length === 0 && (
          <div className="client-not-found">
            <p className="client-not-found__text">No clients yet. Use <strong>+ Add Client</strong> to add your first client.</p>
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body
  )
}