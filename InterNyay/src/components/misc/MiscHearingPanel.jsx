import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import { confirmDialog } from '../../utils/confirmDialog'
import { getErrorMessage } from '../../utils/errorMessages'
import { formatDisplayDate } from '../../utils/dateUtils'
import HearingDateInput from '../common/HearingDateInput'
import Icon from '../common/Icon'
import SeeMoreList from '../common/SeeMoreList'
import { isDisposed } from './miscUtils'
import MiscHearingUpdate from './MiscHearingUpdate'

// Hearing history of one misc. application: opens and closes, holds the "next hearing date" with its Update button
// (while the application is pending), and lets each date be edited or deleted
export default function MiscHearingPanel({ app, onChange, defaultOpen = false }) {
  const { addToast, bumpHearings } = useApp()

  const [open, setOpen] = useState(defaultOpen)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState('')
  const [draftNote, setDraftNote] = useState('')
  const [busyId, setBusyId] = useState(null)

  const rows = app.hearings || []
  const pending = !isDisposed(app)

  // Hands the changed application to the page and refreshes the counts and the dashboard
  function applied(updated) {
    onChange?.(updated)
    bumpHearings(app.caseId)
  }

  async function save(h) {
    if (!draft) { addToast('A hearing entry needs a date', 'error'); return }
    if (draft === h.date && draftNote.trim() === (h.note || '')) { setEditingId(null); return }

    setBusyId(h.id)
    try {
      applied(await api.miscApplications.updateHearing(app.id, h.id, draft, draftNote.trim()))
      setEditingId(null)
      addToast(draft !== h.date ? 'Hearing date updated' : 'Hearing note saved')
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not update the hearing date'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(h) {
    const ok = await confirmDialog({
      message: `Delete the hearing on ${formatDisplayDate(h.date)}?${pending && h.date === app.hearingDate ? ' It is the next hearing date, so the application will have no next date.' : ''}`,
      confirmLabel: 'Delete',
    })
    if (!ok) return

    setBusyId(h.id)
    try {
      applied(await api.miscApplications.removeHearing(app.id, h.id))
      addToast('Hearing deleted')
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not delete the hearing'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="hearing-history" onClick={e => e.stopPropagation()}>
      {/* Same header as a case's Hearing History: the toggle on the left, Next Hearing and Update on the right */}
      <div className="hearing-history__header">
        <button type="button" className="hearing-history__toggle" aria-expanded={open} onClick={() => setOpen(v => !v)}>
          <span className={`hearing-history__caret${open ? ' hearing-history__caret--open' : ''}`}>▸</span>
          Hearing History{rows.length > 0 ? ` (${rows.length})` : ''}
        </button>
        {pending && <MiscHearingUpdate app={app} onChange={onChange} />}
      </div>

      {open && (rows.length === 0 ? (
        <p className="hearing-history__empty">
          No hearing dates recorded yet.{pending && <> Use <strong>Update</strong> above to set the next hearing date.</>}
        </p>
      ) : (
        <SeeMoreList items={rows} step={10} resetKey={app.id}>
          {shown => shown.map(h => {
            const editing = editingId === h.id
            const busy = busyId === h.id
            return (
              <div key={h.id} className="hearing-entry">
                <div className="hearing-entry__date">
                  <span className="hearing-entry__date-text">{formatDisplayDate(h.date)}</span>
                  {pending && h.date === app.hearingDate && <span className="hearing-entry__outcome">Next</span>}
                </div>

                <div className="hearing-entry__body">
                  {editing ? (
                    <>
                      <div className="hearing-entry__edit-row">
                        <label className="form-label">Hearing date</label>
                        <HearingDateInput value={draft} caseId={app.caseId} onChange={setDraft} clearable={false} />
                      </div>
                      <textarea
                        className="form-input hearing-entry__note-input"
                        rows={3}
                        maxLength={2000}
                        placeholder="Note for this hearing date…"
                        value={draftNote}
                        onChange={e => setDraftNote(e.target.value)}
                      />
                      <div className="hearing-entry__edit-actions">
                        <button type="button" className="btn-outline btn-outline--sm" onClick={() => setEditingId(null)} disabled={busy}>Cancel</button>
                        <button type="button" className="btn-gold btn-outline--sm" onClick={() => save(h)} disabled={busy || !draft}>
                          {busy ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className={`hearing-entry__note${h.note ? '' : ' hearing-entry__note--empty'}`}>
                      {h.note || 'No note for this date'}
                    </p>
                  )}
                </div>

                {!editing && (
                  <div className="hearing-entry__actions">
                    <button type="button" className="btn-outline btn-outline--sm" title="Edit this hearing's date and note" disabled={busy}
                      onClick={() => { setDraft(h.date); setDraftNote(h.note || ''); setEditingId(h.id) }}>
                      <Icon name="edit" /> Edit
                    </button>
                    <button type="button" className="btn-icon btn-icon--danger" title="Delete this hearing entry" aria-label="Delete this hearing entry"
                      disabled={busy} onClick={() => remove(h)}>
                      <Icon name="trash" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </SeeMoreList>
      ))}
    </div>
  )
}
