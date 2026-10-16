import { formatIsoDate, parseDateList } from '../../utils/rosterUtils'

// Shows a list of dates as chips
export default function DateChips({ value, tone, empty = '—' }) {
  const { dates } = parseDateList(value)

  // Nothing to show, render the placeholder
  if (dates.length === 0) return <span className="qa-muted">{empty}</span>

  return (
    <div className="qa-chips">
      {dates.map(d => (
        <span key={d} className={`qa-chip qa-chip--${tone}`}>{formatIsoDate(d)}</span>
      ))}
    </div>
  )
}
