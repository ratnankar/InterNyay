import Icon from '../common/Icon'
import ClearableDateInput from '../common/ClearableDateInput'
// Editable list of dates with add and remove buttons
export default function DateListField({
  label,
  addLabel = 'Add another date',
  dates,
  onChange,
  error,
}) {
  // Ignore empty rows when counting dates and checking for duplicates
  const filled = dates.filter(Boolean)
  const hasDuplicate = new Set(filled).size !== filled.length

  // Update or remove the date at a given position
  const setAt = (i, value) => onChange(dates.map((d, idx) => (idx === i ? value : d)))
  // Remove the date at this position
  const removeAt = i => onChange(dates.filter((_, idx) => idx !== i))

  return (
    <div className="form-group date-list">
      <label className="form-label">{label}{filled.length ? ` (${filled.length})` : ''}</label>

      {/* One date input per row */}
      <div className="date-list__rows">
        {dates.length === 0 && <p className="admin__hint u-mt-0">No dates added yet.</p>}

        {dates.map((d, i) => (
          <div className="date-list__row" key={i}>
            <ClearableDateInput
              className="form-input"
              
              value={d}
              onChange={e => setAt(i, e.target.value)}
              aria-label={`${label} ${i + 1}`}
            />
            <button
              type="button"
              className="btn-outline btn-outline--sm btn-outline--danger"
              onClick={() => removeAt(i)}
              aria-label={`Remove ${label} ${i + 1}`}
            >
              <Icon name="close" />
            </button>
          </div>
        ))}

        <div>
          <button type="button" className="btn-outline btn-outline--sm" onClick={() => onChange([...dates, ''])}>
            ＋ {addLabel}
          </button>
        </div>
      </div>

      {/* Warnings for duplicate dates and validation errors */}
      {hasDuplicate && <p className="admin__hint">The same date is added twice — it will be saved once.</p>}
      {error && <p className="admin__hint admin__hint--error">{error}</p>}
    </div>
  )
}
