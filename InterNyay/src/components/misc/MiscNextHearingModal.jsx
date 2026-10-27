import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import useUnsavedGuard from '../../hooks/useUnsavedGuard'
import api from '../../services/api'
import { getErrorMessage } from '../../utils/errorMessages'
import { formatDisplayDate } from '../../utils/dateUtils'
import HearingDateInput from '../common/HearingDateInput'
import Icon from '../common/Icon'
import ModalPortal from '../common/ModalPortal'

// "Update Next Hearing" window of a misc. application: the new date and a note for the hearing just held,
// the same window as a case's. The date of the application is kept apart from the case's own next hearing date
export default function MiscNextHearingModal({ app, onClose, onChange }) {
  const { addToast, bumpHearings } = useApp()

  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const canSave = !saving && !!date
  // A note belongs to the hearing just held, so it only makes sense when the application had a date until now
  const hasHeld = !!app.hearingDate

  async function save() {
    if (!date) { addToast('Select the next hearing date', 'error'); return }

    setSaving(true)
    try {
      // The edit request carries the whole application, so its type and filing date are sent back unchanged
      const updated = await api.miscApplications.update(app.id, {
        applicationType: app.applicationType,
        filingDate: app.filingDate || null,
        hearingDate: date,
        note: note.trim() || null,
      })
      onChange?.(updated)
      bumpHearings(app.caseId)
      addToast('Application hearing date updated')
      onClose()
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not update the hearing date'), 'error')
    } finally {
      setSaving(false)
    }
  }

  // Clicking outside never closes the form; the cross asks to save or discard a chosen date
  const { requestClose, dialog, overlayHandlers } = useUnsavedGuard({
    dirty: !!date || !!note.trim(),
    onSave: save,
    onDiscard: onClose,
  })

  return (
    <>
      <ModalPortal>
        <div className="overlay" {...overlayHandlers}>
          <div className="modal modal--sm" onClick={e => e.stopPropagation()}>

            <div className="modal__header">
              <div>
                <h2 className="modal__title">Update Next Hearing</h2>
                <p className="u-note-sm">
                  {app.applicationType}{app.caseTitle ? ` • ${app.caseTitle}` : ''}{app.caseNo ? ` • ${app.caseNo}` : ''}
                </p>
              </div>
              <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={requestClose}><Icon name="close" /></button>
            </div>

            <div>
              <label className="form-label">
                Next Hearing Date
                {app.hearingDate && (
                  <span className="u-muted-normal">
                    {' '}— currently {formatDisplayDate(app.hearingDate)}
                  </span>
                )}
              </label>
              <HearingDateInput
                value={date}
                caseId={app.caseId}
                onChange={setDate}
                clearable={false}
                placeholder="Select next hearing date"
              />
              <p className="next-hearing__hint">
                Dates you've crossed out on the calendar and days that already have their daily limit of hearings can't be chosen.
                The case's own next hearing date is not changed.
              </p>
            </div>

            {hasHeld && (
              <div className="next-hearing__note">
                <label className="form-label">Note</label>
                <textarea
                  className="form-input"
                  rows={3}
                  maxLength={2000}
                  placeholder="Note for the hearing just held…"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
              </div>
            )}

            <div className="form-actions">
              <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
              <button type="button" className="btn-gold" disabled={!canSave} onClick={save}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </ModalPortal>
      {dialog}
    </>
  )
}
