// From and till date inputs with a 'further order' checkbox for entries with no end date
export default function ValidityFields({ form, onChange, error }) {
  return (
    <div className="validity-fields">
      <div className="form-group u-mb-0">
        <label className="form-label">From date</label>
        <input
          className="form-input"
          type="date"
          value={form.fromDate}
          onChange={e => onChange({ fromDate: e.target.value })}
        />
      </div>

      <div className="form-group u-mb-0">
        {/* Till date is cleared and disabled when 'further order' is ticked */}
        <label className="form-label">Till date</label>
        <input
          className={`form-input${error ? ' form-input--error' : ''}`}
          type="date"
          value={form.furtherOrder ? '' : form.tillDate}
          min={form.fromDate || undefined}
          disabled={form.furtherOrder}
          onChange={e => onChange({ tillDate: e.target.value })}
        />
      </div>

      <label className="admin__check">
        <input
          type="checkbox"
          checked={form.furtherOrder}
          onChange={e => onChange({ furtherOrder: e.target.checked, ...(e.target.checked ? { tillDate: '' } : {}) })}
        />
        Further order — valid till further orders (no end date)
      </label>

      {error && <p className="admin__hint admin__hint--error">{error}</p>}
    </div>
  )
}
