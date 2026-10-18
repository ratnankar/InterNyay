import { useCourts, getBuildings, getFloors, getCourtNos } from '../../constants/courts'
import Dropdown from '../common/Dropdown'

// Adds the stored value to a list when it is no longer in the court table, so it stays visible until it is changed
const withCurrent = (list, value) => (value && !list.includes(value) ? [...list, value] : list)

// Building and court no. dropdowns, filled from the court table for the chosen court and district.
// The court no. list follows the building. New buildings and court numbers are added under Admin > Courts.
// Only the chosen district's own buildings and court numbers are listed: ones that have no district yet are not offered here;
// they are moved into a district under Admin > Courts.
export default function CourtPlaceFields({ court, district, building, floor = '', courtNo, onChange, error }) {
  useCourts()

  const buildings = withCurrent(getBuildings(court, district), building)
  const floors = withCurrent(getFloors(court, district, building || ''), floor)
  const courtNos = withCurrent(getCourtNos(court, district, building || '', floor || ''), courtNo)

  return (
    <>
      <div className="form-group">
        <label className="form-label">Building</label>
        <Dropdown
          className="form-input"
          value={building}
          onChange={e => onChange({ building: e.target.value, floor: '', courtRoomNo: '' })}
        >
          <option value="">No building</option>
          {buildings.map(b => <option key={b} value={b}>{b}</option>)}
        </Dropdown>
      </div>

      {floors.length > 0 && (
        <div className="form-group">
          <label className="form-label">Floor</label>
          <Dropdown
            className="form-input"
            value={floor}
            onChange={e => onChange({ floor: e.target.value, courtRoomNo: '' })}
          >
            <option value="">No floor</option>
            {floors.map(f => <option key={f} value={f}>{f}</option>)}
          </Dropdown>
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Court number</label>
        <Dropdown
          className={`form-input${error ? ' form-input--error' : ''}`}
          value={courtNo}
          onChange={e => onChange({ courtRoomNo: e.target.value })}
        >
          <option value="">No court number</option>
          {courtNos.map(n => <option key={n} value={n}>{n}</option>)}
        </Dropdown>
        {courtNos.length === 0 && (
          <p className="admin__hint">No court numbers are listed here yet. Add them under Admin &rsaquo; Courts.</p>
        )}
      </div>
    </>
  )
}
