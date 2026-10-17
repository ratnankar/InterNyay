import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import { useCourts, loadCourts } from '../../constants/courts'
import Dropdown from '../common/Dropdown'
import { getErrorMessage } from '../../utils/errorMessages'
import { confirmDialog } from '../../utils/confirmDialog'

const NEW_BUILDING = '__new__'

const placeText = (district, building) =>
  `${district || 'no district'}${building ? `, building ${building}` : ', no building'}`

// Moves one court no. to another building and district of the same court.
// "No district" parks it in the court's list of court numbers that have no district yet; it moves into a district later,
// here or when a judge is listed in it. A judge sitting in the court room moves with it
export default function CourtNoMover({ row, high, onClose }) {
  const { addToast } = useApp()
  const { rows, hierarchy } = useCourts()

  const [district, setDistrict] = useState(row.district)
  const [building, setBuilding] = useState(row.building)
  const [newBuilding, setNewBuilding] = useState('')
  const [correction, setCorrection] = useState(false)
  const [busy, setBusy] = useState(false)

  const districts = hierarchy[row.court] || []
  const buildings = [...new Set(rows
    .filter(r => r.court === row.court && (r.district || '') === district && r.building)
    .map(r => r.building))]

  const adding = building === NEW_BUILDING
  const typed = newBuilding.trim()
  const target = adding ? typed : building
  const sameAsNow = district === row.district && target.toLowerCase() === row.building.toLowerCase()

  // The same court no. is already in the target place
  const taken = rows.some(r => r.id !== row.id && r.court === row.court && (r.district || '') === district
    && (r.building || '').toLowerCase() === target.toLowerCase()
    && (r.courtNo || '').toLowerCase() === row.courtNo.toLowerCase())

  function problem() {
    if (adding && !typed) return 'Enter the new building'
    if (sameAsNow) return `Court no. ${row.courtNo} is already there`
    if (taken) return `Court no. ${row.courtNo} already exists in ${placeText(district, target)}`
    return ''
  }

  async function move() {
    const msg = problem()
    if (msg) { addToast(msg, 'error'); return }
    const ok = await confirmDialog(
      `Move court no. ${row.courtNo} from ${placeText(row.district, row.building)} to ${placeText(district, target)}? `
      + 'A judge listed in this court room moves with it.')
    if (!ok) return

    setBusy(true)
    try {
      await api.courts.move(row.id, { district, building: target, correction })
      await loadCourts(true)
      addToast(`Court no. ${row.courtNo} moved to ${placeText(district, target)}`)
      onClose()
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not move the court no.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="courts-mover">
      <strong className="courts-mover__title">Move court no. {row.courtNo}</strong>
      <div className="courts-mover__fields">
        {!high && (
          <Dropdown className="form-input" value={district}
                    onChange={e => { setDistrict(e.target.value); setBuilding(''); setNewBuilding('') }}>
            <option value="">No district</option>
            {districts.map(d => <option key={d} value={d}>{d}</option>)}
          </Dropdown>
        )}
        <Dropdown className="form-input" value={building}
                  onChange={e => { setBuilding(e.target.value); setNewBuilding('') }}>
          <option value="">No building</option>
          {buildings.map(b => <option key={b} value={b}>Building {b}</option>)}
          <option value={NEW_BUILDING}>+ Add new building</option>
        </Dropdown>
        {adding && (
          <input className="form-input" placeholder="New building" value={newBuilding}
                 onChange={e => setNewBuilding(e.target.value)} />
        )}
      </div>
      <label className="courts-check courts-mover__check"
             title="Tick when the old place was entered wrongly: a judge sitting here is moved without keeping the old place in the history">
        <input type="checkbox" checked={correction} onChange={e => setCorrection(e.target.checked)} />
        The old place was wrong, do not keep it in the history
      </label>
      <div className="courts-mover__actions">
        <button type="button" className="courts-btn courts-btn--solid" onClick={move} disabled={busy}>Move</button>
        <button type="button" className="courts-btn courts-btn--gold" onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </div>
  )
}
