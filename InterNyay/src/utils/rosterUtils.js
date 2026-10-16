
// Matches dates stored as YYYY-MM-DD
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// Display format for dates, e.g. 5 Mar 2025
const dateFmt = { day: 'numeric', month: 'short', year: 'numeric' }

// Formats a YYYY-MM-DD string for display; returns the original text if it isn't a valid date
export function formatIsoDate(iso) {
  if (!iso) return ''
  const s = String(iso).slice(0, 10)
  if (!ISO_DATE.test(s)) return String(iso)
  return new Date(`${s}T00:00:00`).toLocaleDateString('en-IN', dateFmt)
}

// Today's date as YYYY-MM-DD in local time
function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Splits a saved comma-separated date list into sorted, unique valid dates
export function parseDateList(csv) {
  const dates = String(csv || '')
    .split(/[,\n]/)
    .map(t => t.trim())
    .filter(t => ISO_DATE.test(t))

  return { dates: [...new Set(dates)].sort() }
}

// Converts a list of dates back to the comma-separated text stored in the backend
export function serializeDateList(dates) {
  return [...new Set((dates || []).filter(d => ISO_DATE.test(d)))].sort().join(',')
}

// Whether a roster entry is upcoming, expired or currently active
export function validityStatus({ fromDate, tillDate, furtherOrder }) {
  const today = todayIso()
  if (fromDate && fromDate > today) return 'upcoming'
  if (!furtherOrder && tillDate && tillDate < today) return 'expired'
  return 'active'
}

// Human-readable validity, e.g. "5 Mar 2025 – 10 Mar 2025" or "Till further orders"
export function validityText({ fromDate, tillDate, furtherOrder }) {
  const from = formatIsoDate(fromDate)
  const till = formatIsoDate(tillDate)

  if (furtherOrder) return from ? `From ${from} · till further orders` : 'Till further orders'
  if (from && till) return `${from} – ${till}`
  if (from) return `From ${from}`
  if (till) return `Till ${till}`
  return ''
}

// Error message if the "till" date is before the "from" date
export function validityError({ fromDate, tillDate, furtherOrder }) {
  if (!furtherOrder && fromDate && tillDate && tillDate < fromDate) {
    return 'Till date cannot be before the from date'
  }
  return ''
}
