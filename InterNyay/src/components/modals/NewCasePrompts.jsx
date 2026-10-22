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

// A CNR number is 16 letters and digits; spaces and dashes typed between them are ignored
const cleanCnr = text => String(text || '').toUpperCase().replace(/[\s-]/g, '')
const validCnr = text => /^[A-Z0-9]{16}$/.test(cleanCnr(text))

// Step 1 popup: how is the case added? By CNR (the details come from eCourts) or manually.
// onFetch(cnr) reads the case from eCourts and moves on to the form, whether it worked or not
export function CaseAddModePrompt({ onFetch, onManual, onClose }) {
  // 'choose': the two options. 'cnr': asking for the CNR number
  const [step, setStep] = useState('choose')
  const [cnr, setCnr] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  async function fetchCase() {
    if (!validCnr(cnr)) { setProblem('Enter the 16-character CNR number'); return }

    setProblem('')
    setBusy(true)
    try {
      await onFetch(cleanCnr(cnr))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalPortal>
      <div className="overlay">
        <div className="modal modal--sm" onClick={e => e.stopPropagation()}>

          <div className="modal__header">
            <h2 className="modal__title">New Case</h2>
            <button aria-label="Close" title="Close" type="button" className="btn-icon" onClick={onClose} disabled={busy}>
              <Icon name="close" />
            </button>
          </div>

          {step === 'choose' && (
            <>
              <p className="form-label u-mb-12">How do you want to add the case?</p>

              <div className="u-flex-8">
                <button type="button" className="btn-gold u-flex-1" onClick={() => setStep('cnr')}>
                  Add by CNR
                </button>
                <button type="button" className="btn-outline u-flex-1" onClick={onManual}>
                  Add manually
                </button>
              </div>

              <p className="case-parties__hint u-mt-10">
                By CNR, the case details, hearing dates and orders are taken from eCourts. Manually, you fill in the
                details yourself; the hearing dates and orders are still taken from eCourts when the case is saved.
                A case of a Juvenile Justice Board has no CNR and its case number is optional: add it manually and choose the board as the court.
              </p>
            </>
          )}

          {step === 'cnr' && (
            <form onSubmit={e => { e.preventDefault(); if (!busy) fetchCase() }}>
              <label className="form-label" htmlFor="add-case-cnr">CNR Number</label>
              <input
                id="add-case-cnr"
                className="form-input"
                placeholder="e.g. DLND020047882015"
                maxLength={30}
                value={cnr}
                autoFocus
                autoComplete="off"
                disabled={busy}
                onChange={e => { setCnr(e.target.value); setProblem('') }}
              />

              {problem && <p className="case-judge-hint case-judge-hint--none u-mt-6">{problem}</p>}

              <p className="case-parties__hint u-mt-10">
                If the case cannot be fetched, the form opens for you to fill in by hand.
              </p>

              <div className="form-actions">
                <button type="button" className="btn-outline" onClick={() => { setStep('choose'); setProblem('') }} disabled={busy}>Back</button>
                <button type="submit" className="btn-gold" disabled={busy}>
                  {busy ? 'Fetching…' : 'Fetch case'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}

// Popup opened by the Add button of the client section: add a saved client, or someone who is not a client
export function AddPartyTypePrompt({ ourLabel, hasClient, onClient, onNonClient, onClose }) {

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

  return createPortal(
    <div className="overlay overlay--stacked">
      <div className="modal modal--sm" onClick={e => e.stopPropagation()}>

        <div className="modal__header">
          <h2 className="modal__title">Add {String(ourLabel).replace(/\//g, '/\u200b')}</h2>
          <button aria-label="Close" title="Close" type="button" className="btn-icon" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        <p className="form-label u-mb-12">What do you want to add?</p>

        <div className="add-party-choices">
          <button type="button" className="btn-gold" onClick={onClient}>
            {hasClient ? 'Add another client' : 'Add client'}
          </button>
          <button type="button" className="btn-outline" onClick={onNonClient}>
            Add non-client
          </button>
        </div>

        <p className="case-parties__hint u-mt-10">
          A client is saved in your clients. The other is only on this case and is not saved as a client.
        </p>
      </div>
    </div>,
    document.body
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