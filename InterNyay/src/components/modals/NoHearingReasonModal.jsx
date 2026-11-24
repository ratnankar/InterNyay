import { useEffect, useRef, useState } from 'react'
import { formatDisplayDate } from '../../utils/dateUtils'
import Icon from '../common/Icon'
import ModalPortal from '../common/ModalPortal'

// Longest reason the server accepts
const MAX_REASON = 255

// Quick picks for the usual reasons a day has no hearing
const SUGGESTIONS = ['Court holiday', 'Out of station', 'Personal leave', 'Strike / boycott', 'Judge on leave']

// Asks why a date is marked as a no-hearing date (the reason is optional). Used when marking a date and when editing the reason.
// onSave gets the trimmed reason ('' when left empty) and returns a promise; the window closes once it resolves truthy
export default function NoHearingReasonModal({ dateStr, initial = '', editing = false, onSave, onClose }) {
  const [reason, setReason] = useState(initial)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Escape closes the window
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit(e) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    const ok = await onSave(reason.trim())
    setSaving(false)
    if (ok !== false) onClose()
  }

  return (
    <ModalPortal>
      <div className="overlay" onClick={onClose}>
        <form
          className="modal modal--sm"
          role="dialog"
          aria-label="Reason for no hearing"
          onClick={e => e.stopPropagation()}
          onSubmit={submit}
        >
          <div className="modal__header">
            <div>
              <h2 className="modal__title">{editing ? 'Edit Reason' : 'No-hearing Date'}</h2>
              <p className="u-note-sm">{formatDisplayDate(dateStr)}</p>
            </div>
            <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="no-hearing-reason">Reason (optional)</label>
            <input
              id="no-hearing-reason"
              ref={inputRef}
              className="form-input"
              type="text"
              value={reason}
              maxLength={MAX_REASON}
              placeholder="e.g. Out of station for a conference"
              onChange={e => setReason(e.target.value)}
            />
          </div>

          <div className="no-hearing-reason__chips">
            {SUGGESTIONS.map(s => (
              <button key={s} type="button" className="btn-outline btn-outline--sm" onClick={() => setReason(s)}>{s}</button>
            ))}
          </div>

          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-gold" disabled={saving}>
              {editing ? 'Save reason' : 'Mark as no-hearing date'}
            </button>
          </div>
        </form>
      </div>
    </ModalPortal>
  )
}
