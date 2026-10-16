import { formatDate } from './dateUtils'

// Period selected by default on the transactions page
export const DEFAULT_PERIOD = 'thisMonth'

// Quick period buttons shown above the transactions list
export const PERIOD_PRESETS = [
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'last3',     label: 'Last 3 Months' },
  { key: 'last6',     label: 'Last 6 Months' },
]

// Adds months to a date without overflowing (31 Jan + 1 month = 28/29 Feb)
function addMonths(date, months) {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(date.getDate(), lastDay))
  return target
}

// Converts a period choice (this month, last 3 months, year, custom...) into { from, to } dates
export function periodRange({ period = DEFAULT_PERIOD, year, from = '', to = '' } = {}, today = new Date()) {
  const y = today.getFullYear()
  const m = today.getMonth()

  switch (period) {
    // First to last day of the current month
    case 'thisMonth':
      return { from: formatDate(new Date(y, m, 1)), to: formatDate(new Date(y, m + 1, 0)) }

    // Whole of the previous month
    case 'lastMonth':
      return { from: formatDate(new Date(y, m - 1, 1)), to: formatDate(new Date(y, m, 0)) }

    // Same day three months ago until today
    case 'last3':
      return { from: formatDate(addMonths(today, -3)), to: formatDate(today) }

    // Same day six months ago until today
    case 'last6':
      return { from: formatDate(addMonths(today, -6)), to: formatDate(today) }

    // Full calendar year (defaults to the current year)
    case 'year': {
      const yr = Number(year) || y
      return { from: `${yr}-01-01`, to: `${yr}-12-31` }
    }

    // Dates typed in by the user
    case 'custom':
      return { from, to }

    // Unknown period means no date filter
    default:
      return { from: '', to: '' }
  }
}

// A transaction's date, falling back to the date it was recorded
function transactionDate(t) {
  return t?.date || t?.recordedOn || ''
}

// Keeps only transactions inside the from/to range (empty bounds are ignored)
export function filterByRange(rows, { from = '', to = '' } = {}) {
  if (!from && !to) return rows

  return rows.filter(t => {
    const d = transactionDate(t)
    if (!d) return false
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  })
}

// Years that have transactions (plus the current year), newest first, for the year dropdown
export function availableYears(rows, today = new Date()) {
  const years = new Set([today.getFullYear()])

  rows.forEach(t => {
    const y = Number(transactionDate(t).slice(0, 4))
    if (y) years.add(y)
  })

  return [...years].sort((a, b) => b - a)
}
