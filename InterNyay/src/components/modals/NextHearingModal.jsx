import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import useUnsavedGuard from '../../hooks/useUnsavedGuard'
import { formatDisplayDate } from '../../utils/dateUtils'
import HearingDateInput from '../common/HearingDateInput'

import Icon from '../common/Icon'
import ModalPortal from '../../components/common/ModalPortal'
// Finds the case being updated and shows its next hearing form
export default function NextHearingModal() {
  const { cases, nextHearingCaseId } = useApp()

  // Case whose hearing is being updated
  const c = cases.find(item => item.id === nextHearingCaseId)
  if (!c) return null

  // Keyed by case id so the form state resets for each case
  return <NextHearingForm key={c.id} caseItem={c} />
}

// Form to log the hearing just held and set the next hearing date
function NextHearingForm({ caseItem: c }) {
  const { closeNextHearing, handleSaveNextHearing } = useApp()

  const [nextHearing, setNextHearing] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Can save once a date is chosen and nothing is being saved
  const canSave = !saving && !!nextHearing

  // Save the hearing record and next date, then close the modal
  async function save() {
    setSaving(true)
    try {
      await handleSaveNextHearing({
        caseId: c.id,
        closingDate: null,
        notes: note.trim(),
        nextHearing: nextHearing || null,
      })
      closeNextHearing()
    } finally {
      setSaving(false)
    }
  }

  // Clicking outside never closes the form; the cross asks to save or discard a chosen date
  const { requestClose, dialog, overlayHandlers } = useUnsavedGuard({
    dirty: !!nextHearing || !!note.trim(),
    onSave: save,
    onDiscard: closeNextHearing,
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
                {c.title}{c.caseNo ? ` • ${c.caseNo}` : ''}
              </p>
            </div>
            <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={requestClose}><Icon name="close" /></button>
          </div>

          <div>
            <label className="form-label">
              Next Hearing Date
              {c.nextHearing && (
                <span className="u-muted-normal">
                  {' '}— currently {formatDisplayDate(c.nextHearing)}
                </span>
              )}
            </label>
            <HearingDateInput
              value={nextHearing}
              caseId={c.id}
              onChange={setNextHearing}
              placeholder="Select next hearing date"
            />
            <p className="next-hearing__hint">
              Sundays, dates you've crossed out on the calendar and days that already have their daily limit of hearings can't be chosen. Changing the date
              clears the Cause List No., which is fetched again automatically at 6 PM the evening
              before the new date.
            </p>
          </div>

          <div className="next-hearing__note">
            <label className="form-label">Note</label>
            <textarea
              className="form-input"
              rows={3}
              placeholder="Note for the hearing just held…"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>

          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={closeNextHearing}>Cancel</button>
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