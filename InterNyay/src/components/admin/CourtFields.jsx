import { useCourts, getDistricts, hasNamedDistricts } from '../../constants/courts'
import Dropdown from '../common/Dropdown'

// First district listed for a court, or an empty string when it has none
export const firstDistrict = court => getDistricts(court)[0] || ''

// Court and district dropdowns shared by the admin forms
export default function CourtFields({ court, district, onChange }) {
  const { courtNames } = useCourts()
  return (
    <>
      <div className="form-group">
        {/* Changing the court also resets the district to that court's first district */}
        <label className="form-label">Court</label>
        <Dropdown
          className="form-input"
          value={court}
          onChange={e => onChange({ court: e.target.value, district: firstDistrict(e.target.value) })}
        >
          {courtNames.map(c => <option key={c} value={c}>{c}</option>)}
        </Dropdown>
      </div>

      {/* Only courts with named districts get a district dropdown */}
      {hasNamedDistricts(court) ? (
        <div className="form-group">
          <label className="form-label">District</label>
          <Dropdown
            className="form-input"
            value={district}
            onChange={e => onChange({ court, district: e.target.value })}
          >
            {getDistricts(court).map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </Dropdown>
        </div>
      ) : (
        <div className="form-group">
          <label className="form-label">District</label>
          <p className="admin__hint">{court} has no district of its own.</p>
        </div>
      )}
    </>
  )
}
