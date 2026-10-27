import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../../context/AppContext'
import Icon from '../common/Icon'
import ModalPortal from '../../components/common/ModalPortal'
import api from '../../services/api'
import { getErrorMessage } from '../../utils/errorMessages'

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
// By CNR: the CNR is typed (or comes from a scanned QR) and the case is read at once when the CAPTCHA of eCourts could be
// read automatically; otherwise eCourts shows the CAPTCHA and the case is read once it is typed.
//  onFetched(detail, token) - the case was read; token ties the form to that lookup
//  onFailed(cnr, message)   - eCourts could not give the case: the form opens empty to be filled by hand
//  hasCnr(cnr)              - the advocate already has a case with this CNR
//  initialCnr               - a CNR read from a scanned QR; the lookup starts straight away
export function CaseAddModePrompt({ onFetched, onFailed, hasCnr, onManual, onClose, initialCnr = '' }) {
  // 'choose': the two options. 'cnr': asking for the CNR number. 'captcha': asking for the CAPTCHA of eCourts
  const [step, setStep] = useState(initialCnr ? 'cnr' : 'choose')
  const [cnr, setCnr] = useState(initialCnr)
  const [busy, setBusy] = useState(!!initialCnr)
  const [problem, setProblem] = useState('')
  const [session, setSession] = useState({ id: '', image: '' })
  const [captcha, setCaptcha] = useState('')
  // A CNR that came from a scanned QR: the CNR box is not shown for it, only a short "contacting" note while it is looked up
  const [scanned, setScanned] = useState(!!initialCnr)
  const startedFor = useRef('')
  const closed = useRef(false)

  useEffect(() => () => { closed.current = true }, [])

  // Shows the CAPTCHA image of a step answer
  function showCaptcha(answer, note = '') {
    setSession({ id: answer.sessionId, image: answer.captchaImage })
    setCaptcha('')
    setProblem(note || answer.message || '')
    setStep('captcha')
  }

  // Asks eCourts for a CAPTCHA for the CNR
  async function startLookup(raw) {
    const clean = cleanCnr(raw)
    if (!validCnr(clean)) { setProblem('Enter the 16-character CNR number'); setStep('cnr'); setBusy(false); return }
    if (hasCnr?.(clean)) { setProblem('You already have a case with this CNR number'); setStep('cnr'); setBusy(false); return }

    setProblem('')
    setBusy(true)
    try {
      const answer = await api.cases.cnrStart(clean)
      if (closed.current) return
      if (answer.status === 'DONE') onFetched(answer.detail, answer.sessionId)
      else showCaptcha(answer)
    } catch (e) {
      const message = getErrorMessage(e, 'Could not reach eCourts')
      if (/already have a case/i.test(message)) { setProblem(message); setStep('cnr') }
      else if (!closed.current) onFailed(clean, message)
    } finally {
      if (!closed.current) setBusy(false)
    }
  }

  // A scanned CNR goes straight to the CAPTCHA
  useEffect(() => {
    if (!initialCnr || startedFor.current === initialCnr) return
    startedFor.current = initialCnr
    startLookup(initialCnr)
  }, [initialCnr]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sends the typed CAPTCHA
  async function submitCaptcha() {
    if (!captcha.trim()) { setProblem('Type the CAPTCHA shown in the picture'); return }

    setProblem('')
    setBusy(true)
    try {
      const answer = await api.cases.cnrAnswer(session.id, captcha.trim())
      if (closed.current) return
      if (answer.status === 'DONE') onFetched(answer.detail, answer.sessionId)
      else if (answer.status === 'CAPTCHA') showCaptcha(answer)
      else { setProblem(answer.message || 'This session expired, start again'); setStep('cnr') }
    } catch (e) {
      if (!closed.current) onFailed(cleanCnr(cnr), getErrorMessage(e, 'Could not read the case from eCourts'))
    } finally {
      if (!closed.current) setBusy(false)
    }
  }

  // A new picture, when the CAPTCHA cannot be read
  async function newCaptcha() {
    setBusy(true)
    try {
      const answer = await api.cases.cnrRefresh(session.id)
      if (closed.current) return
      if (answer.status === 'CAPTCHA') showCaptcha(answer)
      else { setProblem(answer.message || 'This session expired, start again'); setStep('cnr') }
    } catch (e) {
      if (!closed.current) setProblem(getErrorMessage(e, 'Could not get a new CAPTCHA'))
    } finally {
      if (!closed.current) setBusy(false)
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
                By CNR, the case details, hearing dates and orders are taken from eCourts (the CAPTCHA of eCourts is read for you, and you type it only when it cannot be read),
                and the order PDFs are downloaded in the background. Manually, you fill in the details yourself and no hearing dates
                or orders are brought in.
                A case of a Juvenile Justice Board has no CNR and its case number is optional: add it manually and choose the board as the court.
              </p>
            </>
          )}

          {step === 'cnr' && scanned && busy && (
            <>
              <p className="form-label">CNR {cleanCnr(cnr)}</p>
              <p className="case-parties__hint u-mt-6">Contacting eCourts…</p>
            </>
          )}

          {step === 'cnr' && !(scanned && busy) && (
            <form onSubmit={e => { e.preventDefault(); if (!busy) { setScanned(false); startLookup(cnr) } }}>
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
                eCourts may ask for a CAPTCHA next. If the case cannot be fetched, the form opens for you to fill in by hand.
              </p>

              <div className="form-actions">
                <button type="button" className="btn-outline" onClick={() => { setStep('choose'); setProblem('') }} disabled={busy}>Back</button>
                <button type="submit" className="btn-gold" disabled={busy}>
                  {busy ? 'Contacting eCourts…' : 'Next'}
                </button>
              </div>
            </form>
          )}

          {step === 'captcha' && (
            <form onSubmit={e => { e.preventDefault(); if (!busy) submitCaptcha() }}>
              <p className="form-label">CNR {cleanCnr(cnr)}</p>
              <p className="case-parties__hint u-mb-6">Type the letters and numbers shown by eCourts.</p>

              <div className="cnr-captcha">
                {session.image && <img className="cnr-captcha__img" src={session.image} alt="CAPTCHA from eCourts" />}
                <button type="button" className="btn-refresh" onClick={newCaptcha} disabled={busy} title="New picture" aria-label="New picture"><Icon name="refresh" /></button>
              </div>

              <input
                className="form-input u-mt-10"
                placeholder="CAPTCHA"
                maxLength={12}
                value={captcha}
                autoFocus
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                disabled={busy}
                onChange={e => { setCaptcha(e.target.value); setProblem('') }}
              />

              {problem && <p className="case-judge-hint case-judge-hint--none u-mt-6" role="alert">{problem}</p>}

              <div className="form-actions">
                <button type="button" className="btn-outline" onClick={() => { setStep('cnr'); setProblem('') }} disabled={busy}>Back</button>
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