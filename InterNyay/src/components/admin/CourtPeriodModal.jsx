import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import { getErrorMessage } from '../../utils/errorMessages'
import { useCourts, getCourtNames, getDistricts, hasNamedDistricts, getBuildings, getFloors, getCourtNos } from '../../constants/courts'
import useOverlayClose from '../../hooks/useOverlayClose'
import Dropdown from '../common/Dropdown'
import Icon from '../common/Icon'
import JudgeSearchSelect from './JudgeSearchSelect'
import ModalPortal from '../../components/common/ModalPortal'
import ClearableDateInput from '../common/ClearableDateInput'

// Keeps a stored value that is no longer in the court table visible until it is changed
const withCurrent = (list, value) => (value && !list.includes(value) ? [...list, value] : list)

// Add a past court number period for a judge, or edit one (the current period too: the judge's own court details follow it).
// period: the court number log entry being edited (null when adding); defaults: starting court, district, building and court number for a new one
export default function CourtPeriodModal({ period, defaults = {}, onSaved, onClose }) {
  const { addToast } = useApp()
  useCourts()
  const overlayHandlers = useOverlayClose(onClose, { backdrop: false })
  const editing = !!period
  // The current period is open-ended, so it has no till date
  const isCurrent = editing && !period.tillDate

  const [judge, setJudge] = useState(null)
  const [draft, setDraft] = useState({
    court:       period?.court       || defaults.court       || '',
    district:    period?.district    || defaults.district    || '',
    building:    period?.building    || defaults.building    || '',
    floor:       period?.floor       || defaults.floor       || '',
    courtRoomNo: period?.courtRoomNo || defaults.courtRoomNo || '',
    fromDate:    period?.fromDate    || '',
    tillDate:    period?.tillDate    || '',
  })
  const [busy, setBusy] = useState(false)

  const patch = fields => setDraft(d => ({ ...d, ...fields }))

  // Changing the court picks that court's first district and clears the building and court number
  const pickCourt = value => patch({ court: value, district: getDistricts(value)[0] || '', building: '', floor: '', courtRoomNo: '' })

  async function save() {
    if (!editing && !judge) { addToast('Pick the judge this court number belongs to', 'error'); return }
    if (!draft.court || !draft.courtRoomNo || !draft.fromDate || (!isCurrent && !draft.tillDate)) {
      addToast(isCurrent ? 'Court, court number and from date are required' : 'Court, court number, from date and till date are required', 'error')
      return
    }
    if (!isCurrent && draft.tillDate < draft.fromDate) { addToast('Till date cannot be before the from date', 'error'); return }

    const body = {
      court: draft.court,
      district: draft.district,
      building: draft.building.trim(),
      floor: draft.floor.trim(),
      courtRoomNo: draft.courtRoomNo.trim(),
      fromDate: draft.fromDate,
      ...(isCurrent ? {} : { tillDate: draft.tillDate }),
    }

    setBusy(true)
    try {
      if (editing) await api.judgesList.updateCourtNo(period.judgeId, period.id, body)
      else         await api.judgesList.addCourtNo(judge.id, body)
      addToast('Saved')
      onSaved()
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not save the court number period'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalPortal>
      <div className="overlay" {...overlayHandlers}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal__header">
            <h2 className="modal__title">{isCurrent ? 'Edit current court number' : editing ? 'Edit court number period' : 'Add court number period'}</h2>
            <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={onClose}><Icon name="close" /></button>
          </div>

          <div className="court-history-editor__form court-period-form">
            <div className="court-history-editor__field court-period-form__full">
              {editing ? (
                <>
                  <label className="form-label">Judge</label>
                  <p className="court-period-form__judge">{period.judgeName}</p>
                </>
              ) : (
                <JudgeSearchSelect label="Judge" required value={judge} onChange={setJudge} showDistrictToggle={false} />
              )}
            </div>

            <div className="court-history-editor__field">
              <label className="form-label">Court</label>
              <Dropdown className="form-input" aria-label="Court" value={draft.court} onChange={e => pickCourt(e.target.value)}>
                <option value="">Court</option>
                {withCurrent(getCourtNames(), draft.court).map(c => <option key={c} value={c}>{c}</option>)}
              </Dropdown>
            </div>

            {hasNamedDistricts(draft.court) && (
              <div className="court-history-editor__field">
                <label className="form-label">District</label>
                <Dropdown
                  className="form-input"
                  aria-label="District"
                  value={draft.district}
                  onChange={e => patch({ district: e.target.value, building: '', floor: '', courtRoomNo: '' })}
                >
                  <option value="">District</option>
                  {withCurrent(getDistricts(draft.court), draft.district).map(d => <option key={d} value={d}>{d}</option>)}
                </Dropdown>
              </div>
            )}

            <div className="court-history-editor__field">
              <label className="form-label">Building</label>
              <Dropdown
                className="form-input"
                aria-label="Building"
                value={draft.building}
                onChange={e => patch({ building: e.target.value, floor: '', courtRoomNo: '' })}
              >
                <option value="">No building</option>
                {withCurrent(getBuildings(draft.court, draft.district), draft.building).map(b => <option key={b} value={b}>{b}</option>)}
              </Dropdown>
            </div>

            {withCurrent(getFloors(draft.court, draft.district, draft.building), draft.floor).length > 0 && (
              <div className="court-history-editor__field">
                <label className="form-label">Floor</label>
                <Dropdown
                  className="form-input"
                  aria-label="Floor"
                  value={draft.floor}
                  onChange={e => patch({ floor: e.target.value, courtRoomNo: '' })}
                >
                  <option value="">No floor</option>
                  {withCurrent(getFloors(draft.court, draft.district, draft.building), draft.floor).map(f => <option key={f} value={f}>{f}</option>)}
                </Dropdown>
              </div>
            )}

            <div className="court-history-editor__field">
              <label className="form-label">Court number</label>
              <Dropdown
                className="form-input"
                aria-label="Court number"
                value={draft.courtRoomNo}
                onChange={e => patch({ courtRoomNo: e.target.value })}
              >
                <option value="">Court number</option>
                {withCurrent(getCourtNos(draft.court, draft.district, draft.building, draft.floor), draft.courtRoomNo).map(n => <option key={n} value={n}>{n}</option>)}
              </Dropdown>
            </div>

            <div className="court-history-editor__field">
              <label className="form-label">From</label>
              <ClearableDateInput className="form-input"  aria-label="From date" value={draft.fromDate}
                     onChange={e => patch({ fromDate: e.target.value })} />
            </div>

            {!isCurrent && (
              <div className="court-history-editor__field">
                <label className="form-label">Till</label>
                <ClearableDateInput className="form-input"  aria-label="Till date" min={draft.fromDate || undefined} value={draft.tillDate}
                       onChange={e => patch({ tillDate: e.target.value })} />
              </div>
            )}

            {isCurrent && (
              <p className="admin__hint court-period-form__full">
                This is the judge's current court number. Saving also updates the judge's court, district, building, floor and court number in Judges List.
              </p>
            )}

            <div className="court-history-editor__buttons">
              <button type="button" className="btn-outline btn-outline--sm" onClick={onClose}>Cancel</button>
              <button type="button" className="btn-gold btn-outline--sm" onClick={save} disabled={busy}>
                {busy ? 'Saving…' : 'Save period'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
