import { CASE_STATUS_OPTIONS } from '../../constants/data'

// Turns a status like "Disposed Off" into a css-friendly class suffix ("disposed-off")
const slug = status => String(status).toLowerCase().replace(/[^a-z0-9]+/g, '-')

// Dropdown to change a case's status
export default function CaseStatusSelect({ status, onChange, disabled = false, id }) {
  // Fall back to Pending when the case has no status yet
  const current = status || 'Pending'
  // If the saved status isn't in the standard list, still show it so the selection isn't lost
  const options = CASE_STATUS_OPTIONS.includes(current)
    ? CASE_STATUS_OPTIONS
    : [current, ...CASE_STATUS_OPTIONS]

  return (
    <div className="case-status" onClick={e => e.stopPropagation()}>
      <span className="case-status__label" id={id ? `${id}-label` : undefined}>Status</span>
      <div
        id={id}
        className="case-status__group"
        role="radiogroup"
        aria-labelledby={id ? `${id}-label` : undefined}
      >
        {options.map(option => {
          // Highlight the option that matches the case's current status
          const selected = option === current
          // Build the button's class list: base, per-status colour and selected state
          const cls = [
            'case-status__option',
            `case-status__option--${slug(option)}`,
            selected ? 'case-status__option--selected' : '',
          ].filter(Boolean).join(' ')

          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              className={cls}
              disabled={disabled}
              onClick={() => { if (!selected) onChange(option) }}
            >
              {option}
            </button>
          )
        })}
      </div>
    </div>
  )
}
