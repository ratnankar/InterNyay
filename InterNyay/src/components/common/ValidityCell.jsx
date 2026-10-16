import { validityStatus, validityText } from '../../utils/rosterUtils'

// Text shown on the badge for each validity status
const STATUS_LABEL = { active: 'Active', upcoming: 'Upcoming', expired: 'Expired' }

// Table cell with the validity dates of an entry and its status
export default function ValidityCell({ entry }) {
  // Date range text for this entry; show a dash when it has none
  const text = validityText(entry)
  if (!text) return <span className="qa-muted">—</span>

  // Active, upcoming or expired based on today's date
  const status = validityStatus(entry)

  return (
    <div className="qa-validity">
      <span>{text}</span>
      <span className={`qa-status qa-status--${status}`}>{STATUS_LABEL[status]}</span>
    </div>
  )
}
