import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import { useCourts, loadCourts } from '../../constants/courts'
import Dropdown from '../common/Dropdown'
import { getErrorMessage } from '../../utils/errorMessages'

const NEW_BUILDING = '__new__'
const NEW_FLOOR = '__new_floor__'

// Adds a court no. inside an opened court or district.
//  - askDistrict (court level): asks for the district, or "Assign later" to keep the court no. without a district
//  - district fixed (district level): the court no. goes into that district, and a building and floor can be chosen
export default function CourtNoAdder({ court, district = '', askDistrict = false, askBuilding = false }) {
  const { addToast } = useApp()
  const { rows, hierarchy } = useCourts()
  const [pickedDistrict, setPickedDistrict] = useState('')
  const [building, setBuilding] = useState('')
  const [newBuilding, setNewBuilding] = useState('')
  const [floor, setFloor] = useState('')
  const [newFloor, setNewFloor] = useState('')
  const [courtNo, setCourtNo] = useState('')
  const [busy, setBusy] = useState(false)

  const where = askDistrict ? pickedDistrict : district
  const districts = hierarchy[court] || []
  const buildings = [...new Set(rows
    .filter(r => r.court === court && (r.district || '') === where && r.building)
    .map(r => r.building))]
  const adding = building === NEW_BUILDING
  const floors = [...new Set(rows
    .filter(r => r.court === court && (r.district || '') === where && (r.building || '') === (adding ? '' : building) && r.floor)
    .map(r => r.floor))]
  const addingFloor = floor === NEW_FLOOR

  async function add() {
    const no = courtNo.trim()
    if (!no) { addToast('Enter the court no.', 'error'); return }
    if (adding && !newBuilding.trim()) { addToast('Enter the new building', 'error'); return }
    if (addingFloor && !newFloor.trim()) { addToast('Enter the new floor', 'error'); return }
    const b = adding ? newBuilding.trim() : building
    const f = addingFloor ? newFloor.trim() : floor
    setBusy(true)
    try {
      await api.courts.add({ court, district: where, building: b, floor: f, courtNo: no, highCourt: false })
      await loadCourts(true)
      addToast(`Court no. ${no} added${where ? ` to ${where}` : askDistrict ? ' without a district' : ''}${b ? `, building ${b}` : ''}${f ? `, floor ${f}` : ''}`)
      setCourtNo('')
      setNewBuilding('')
      setNewFloor('')
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not add'), 'error')
    } finally {
      setBusy(false)
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      add()
    }
  }

  return (
    <div className="courts-adder">
      {askDistrict && (
        <Dropdown className="form-input courts-adder__select" wrapperClassName="courts-adder__field" value={pickedDistrict}
                  onChange={e => { setPickedDistrict(e.target.value); setBuilding(''); setNewBuilding(''); setFloor(''); setNewFloor('') }}>
          <option value="">Assign district later</option>
          {districts.map(d => <option key={d} value={d}>{d}</option>)}
        </Dropdown>
      )}
      {askBuilding && (
        <Dropdown className="form-input courts-adder__select" wrapperClassName="courts-adder__field" value={building}
                  onChange={e => { setBuilding(e.target.value); setNewBuilding(''); setFloor(''); setNewFloor('') }}>
          <option value="">No building</option>
          {buildings.map(b => <option key={b} value={b}>Building {b}</option>)}
          <option value={NEW_BUILDING}>+ Add new building</option>
        </Dropdown>
      )}
      {askBuilding && adding && (
        <input className="form-input courts-adder__input" placeholder="New building" value={newBuilding}
               onChange={e => setNewBuilding(e.target.value)} onKeyDown={onKeyDown} />
      )}
      {askBuilding && (
        <Dropdown className="form-input courts-adder__select" wrapperClassName="courts-adder__field" value={floor}
                  onChange={e => { setFloor(e.target.value); setNewFloor('') }}>
          <option value="">No floor</option>
          {floors.map(f => <option key={f} value={f}>Floor {f}</option>)}
          <option value={NEW_FLOOR}>+ Add new floor</option>
        </Dropdown>
      )}
      {askBuilding && addingFloor && (
        <input className="form-input courts-adder__input" placeholder="New floor" value={newFloor}
               onChange={e => setNewFloor(e.target.value)} onKeyDown={onKeyDown} />
      )}
      <input
        className="form-input courts-adder__input"
        placeholder="Court no."
        value={courtNo}
        onChange={e => setCourtNo(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <button type="button" className="courts-btn courts-btn--solid" onClick={add} disabled={busy}>+ Add court no.</button>
    </div>
  )
}
