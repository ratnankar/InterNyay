import { useEffect, useState } from 'react'
import api from '../../services/api'
import useOverlayClose from '../../hooks/useOverlayClose'
import Icon from '../common/Icon'
import ModalPortal from '../common/ModalPortal'
import FileNumbersModal from './FileNumbersModal'
import { isClosedCase } from '../../constants/data'
import { getErrorMessage } from '../../utils/errorMessages'

// True for an open case that has no file number yet
export const lacksFileNumber = c => !String(c.fileNo || '').trim() && !isClosedCase(c)

// Popup listing the open cases that have no file number, where each one can be given a number: typed, the next free
// automatic number, or one of the released numbers
export default function NoFileNumberModal({ cases, onClose, onSave, onOpenCase }) {
  const overlayHandlers = useOverlayClose(onClose)

  // The cases that still need a number; a case drops off the list as soon as it is saved
  const missing = cases.filter(lacksFileNumber)

  // What has been typed per case id, the case being saved, and the case whose released-numbers window is open
  const [drafts, setDrafts] = useState({})
  const [savingId, setSavingId] = useState(null)
  const [pickFor, setPickFor] = useState(null)
  const [next, setNext] = useState(null)
  const [error, setError] = useState('')

  function loadNext() {
    return api.cases.fileNumbers()
      .then(res => setNext(res?.nextNumber ?? null))
      .catch(e => setError(getErrorMessage(e, 'Could not load the next file number')))
  }
  useEffect(() => { loadNext() }, [])

  // The next free number, skipping any that are already typed in another row of this window
  function nextFree() {
    if (next == null) return ''
    const used = new Set(Object.values(drafts).map(v => String(v || '').trim()))
    let n = next
    while (used.has(String(n))) n += 1
    return String(n)
  }

  const setDraft = (id, value) => setDrafts(d => ({ ...d, [id]: value }))

  async function save(c) {
    const value = String(drafts[c.id] || '').trim()
    if (!value || savingId) return
    setSavingId(c.id)
    setError('')
    const ok = await onSave(c.id, value)
    setSavingId(null)
    if (ok) {
      setDrafts(d => { const { [c.id]: _gone, ...rest } = d; return rest })
      loadNext()
    }
  }

  return (
    <ModalPortal>
      <div className="overlay" {...overlayHandlers}>
        <div className="modal modal--lg file-numbers file-numbers--wide" onClick={e => e.stopPropagation()}>

          <div className="modal__header">
            <h2 className="modal__title">Cases without a File Number{missing.length ? ` (${missing.length})` : ''}</h2>
            <button aria-label="Close" title="Close" type="button" className="btn-icon" onClick={onClose}><Icon name="close" /></button>
          </div>

          <p className="file-numbers__note">
            Open cases that have no file number. Type one, use the next free number, or pick a released number, then save.
            {next != null && <> Next automatic number: <strong>{next}</strong>.</>}
          </p>
          {error && <p className="file-numbers__note file-numbers__note--error">{error}</p>}

          {missing.length === 0 ? (
            <p className="file-numbers__empty">Every open case has a file number.</p>
          ) : (
            <div className="file-numbers__list">
              {missing.map(c => {
                const value = drafts[c.id] || ''
                const busy = savingId === c.id
                return (
                  <div key={c.id} className="file-numbers__row">
                    <button
                      type="button"
                      className="file-numbers__info file-numbers__open"
                      title="Open this case"
                      onClick={() => onOpenCase?.(c)}
                    >
                      <span className="file-numbers__case">{c.title}</span>
                      {c.caseNo && <span className="file-numbers__meta">{c.caseNo}</span>}
                    </button>

                    <input
                      className="form-input"
                      style={{ width: 120 }}
                      placeholder="File No."
                      aria-label={`File number for ${c.title}`}
                      value={value}
                      onChange={e => setDraft(c.id, e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') save(c) }}
                    />
                    <button type="button" className="btn-outline btn-outline--sm" disabled={next == null}
                      title="Fill in the next free number" onClick={() => setDraft(c.id, nextFree())}>Next</button>
                    <button type="button" className="btn-outline btn-outline--sm"
                      title="Pick from the released numbers" onClick={() => setPickFor(c.id)}>Released</button>
                    <button type="button" className="btn-gold btn-outline--sm" disabled={!value.trim() || busy}
                      onClick={() => save(c)}>{busy ? 'Saving…' : 'Save'}</button>
                  </div>
                )
              })}
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>

      {pickFor != null && (
        <FileNumbersModal
          selected={Number(drafts[pickFor]) || undefined}
          onClose={() => setPickFor(null)}
          onPick={n => { setDraft(pickFor, String(n)); setPickFor(null) }}
        />
      )}
    </ModalPortal>
  )
}
