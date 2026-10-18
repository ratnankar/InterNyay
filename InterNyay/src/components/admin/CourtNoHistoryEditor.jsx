import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import { formatIsoDate } from '../../utils/rosterUtils'
import { getErrorMessage } from '../../utils/errorMessages'
import { useCourts, getCourtNames, getDistricts, hasNamedDistricts, getBuildings, getFloors, getCourtNos } from '../../constants/courts'
import Dropdown from '../common/Dropdown'
import { confirmDialog } from '../../utils/confirmDialog'

// Keeps a stored value that is no longer in the court table visible until it is changed
const withCurrent = (list, value) => (value && !list.includes(value) ? [...list, value] : list)

const EMPTY_DRAFT = { id: null, court: '', district: '', courtRoomNo: '', building: '', floor: '', fromDate: '', tillDate: '' }

// "Saket › South › Building A" for a period; falls back to the judge's own court and district for older rows
const placeLabel = (r, court, district) => {
  const c = r.court || court
  const d = r.court ? r.district : district
  return [c, d && d !== c ? d : '', r.building ? `Building ${r.building}` : '', r.floor ? `Floor ${r.floor}` : ''].filter(Boolean).join(' › ')
}

// Each period has its own court, district, building and court number, all picked from the court table.
// The judge's saved court and district are the starting choice for a new period
export default function CourtNoHistoryEditor({ judgeId, court, district, records, onChange }) {
  const { addToast } = useApp()
  useCourts()
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  // Whether the history list is expanded; it opens by itself while a period is being added or edited
  const [expanded, setExpanded] = useState(false)

  const current = records.find(r => r.current)
  const past = records.filter(r => !r.current)
  const isOpen = expanded || !!draft

  function patch(fields) {
    setDraft(d => ({ ...d, ...fields }))
  }

  // Changing the court picks that court's first district and clears the building and court number
  function pickCourt(value) {
    patch({ court: value, district: getDistricts(value)[0] || '', building: '', floor: '', courtRoomNo: '' })
  }

  // Start a new period in the judge's saved court and district
  const newDraft = () => ({ ...EMPTY_DRAFT, court: court || '', district: district || '' })

  async function save() {
    const courtRoomNo = draft.courtRoomNo.trim()
    if (!draft.court || !courtRoomNo || !draft.fromDate || !draft.tillDate) {
      addToast('Court, court number, from date and till date are required', 'error')
      return
    }
    if (draft.tillDate < draft.fromDate) {
      addToast('Till date cannot be before the from date', 'error')
      return
    }

    const body = {
      court: draft.court,
      district: draft.district,
      courtRoomNo,
      building: draft.building.trim(),
      floor: draft.floor.trim(),
      fromDate: draft.fromDate,
      tillDate: draft.tillDate,
    }
    setBusy(true)
    try {
      const updated = draft.id
        ? await api.judgesList.updateCourtNo(judgeId, draft.id, body)
        : await api.judgesList.addCourtNo(judgeId, body)
      onChange(updated)
      setDraft(null)
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not save the court number period'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function remove(record) {
    if (!await confirmDialog(`Delete Court No. ${record.courtRoomNo} from the history?`)) return
    try {
      onChange(await api.judgesList.removeCourtNo(judgeId, record.id))
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not delete the court number period'), 'error')
    }
  }

  return (
    <div className="form-group admin__form-group--full court-history-editor__box">
      {/* Header: click to expand or collapse; shows the current court number and how many periods there are */}
      <button
        type="button"
        className="court-history-editor__toggle"
        aria-expanded={isOpen}
        onClick={() => { if (!draft) setExpanded(o => !o) }}
      >
        <span className={`archive__chevron${isOpen ? ' archive__chevron--open' : ''}`} aria-hidden="true" />
        <span className="court-history-editor__title">Court history</span>
        {current && <span className="court-history-editor__summary">Court No. {current.courtRoomNo}</span>}
        <span className="archive__count">{records.length}</span>
      </button>

      {isOpen && (
        <div className="court-history-editor__body">
          <ul className="court-history-editor">
            {current && (
              <li className="court-history-editor__row">
                <strong>Court No. {current.courtRoomNo}</strong>
                <span className="court-history-editor__place">{placeLabel(current, court, district)}</span>
                <span className="court-history-editor__range">From {formatIsoDate(current.fromDate)} · present</span>
                <span className="qa-status qa-status--active">Current</span>
              </li>
            )}
            {past.map(r => (
              <li key={r.id} className="court-history-editor__row">
                <strong>Court No. {r.courtRoomNo}</strong>
                <span className="court-history-editor__place">{placeLabel(r, court, district)}</span>
                <span className="court-history-editor__range">
                  {formatIsoDate(r.fromDate)} – {formatIsoDate(r.tillDate)}
                </span>
                <span className="court-history-editor__actions">
                  <button
                    type="button"
                    className="btn-outline btn-outline--sm"
                    onClick={() => setDraft({ id: r.id, court: r.court || court || '', district: r.court ? (r.district || '') : (district || ''), courtRoomNo: r.courtRoomNo, building: r.building || '', floor: r.floor || '', fromDate: r.fromDate, tillDate: r.tillDate })}
                  >
                    Edit
                  </button>
                  <button type="button" className="btn-outline btn-outline--sm btn-outline--danger" onClick={() => remove(r)}>
                    Delete
                  </button>
                </span>
              </li>
            ))}
            {!current && past.length === 0 && (
              <li className="court-history-editor__empty">No court number recorded yet</li>
            )}
          </ul>

          {draft ? (
            <div className="court-history-editor__form">
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
                <input
                  className="form-input"
                  type="date"
                  aria-label="From date"
                  value={draft.fromDate}
                  onChange={e => patch({ fromDate: e.target.value })}
                />
              </div>

              <div className="court-history-editor__field">
                <label className="form-label">Till</label>
                <input
                  className="form-input"
                  type="date"
                  aria-label="Till date"
                  min={draft.fromDate || undefined}
                  value={draft.tillDate}
                  onChange={e => patch({ tillDate: e.target.value })}
                />
              </div>

              <div className="court-history-editor__buttons">
                <button type="button" className="btn-outline btn-outline--sm" onClick={() => setDraft(null)}>Cancel</button>
                <button type="button" className="btn-gold btn-outline--sm" onClick={save} disabled={busy}>
                  {busy ? 'Saving…' : 'Save period'}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn-outline btn-outline--sm" onClick={() => setDraft(newDraft())}>
              + Add earlier court number
            </button>
          )}

          <p className="admin__hint">
            To move the judge to a new court or court number, change the Court, District or Court number fields above and set the date it takes effect; the old one then stays here as a past period. If it was only saved wrongly, tick the correction box that appears instead.
          </p>
        </div>
      )}
    </div>
  )
}
