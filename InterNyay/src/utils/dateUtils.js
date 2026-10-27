// Local date as YYYY-MM-DD (avoids the timezone shift you get from toISOString)
export function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Number of days in a month (month is 0-11)
export function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

// Weekday (0 = Sunday) the month starts on, used to lay out the calendar grid
export function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay()
}

// "5 Mar 2025" style date for display (en-IN)
export function formatDisplayDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// "5 Mar" style date without the year
export function formatShortDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  })
}

// Parses YYYY-MM-DD into a local Date (new Date(string) would treat it as UTC)
export function parseIsoDate(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Short hint for how far away a hearing is: "Today", "Tomorrow", "In 5 days", or "Date passed"
export function hearingCountdown(dateStr) {
  const target = parseIsoDate(dateStr)
  if (Number.isNaN(target.getTime())) return null
  const now = new Date()
  const days = Math.round((target - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000)
  if (days < 0)  return { text: 'Date passed', tone: 'past' }
  if (days === 0) return { text: 'Today', tone: 'soon' }
  if (days === 1) return { text: 'Tomorrow', tone: 'soon' }
  return { text: `In ${days} days`, tone: days <= 7 ? 'soon' : 'later' }
}

// What the next-hearing box on a card shows right now:
//  'normal'  - the date and its countdown only
//  'refresh' - it is the hearing day and 5 PM has passed: the date stays and a refresh symbol is added
//  'expired' - the hearing day is over (from 12 AM) and nobody set a new date: the old date is dropped, only the refresh symbol stays
export const HEARING_REFRESH_HOUR = 17
export function hearingBoxPhase(dateStr, now = new Date()) {
  const target = parseIsoDate(dateStr)
  if (Number.isNaN(target.getTime())) return 'normal'
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (target < today) return 'expired'
  if (target.getTime() === today.getTime() && now.getHours() >= HEARING_REFRESH_HOUR) return 'refresh'
  return 'normal'
}

// True if the date falls on a Sunday
export function isSunday(dateStr) {
  return !!dateStr && parseIsoDate(dateStr).getDay() === 0
}

// Returns an error message if a hearing can't be set on this date, otherwise an empty string
// dayFullProblem (optional) is the app's check for a day that already holds its daily limit, it answers a message or ''
export function hearingDateProblem(dateStr, noHearingDates, dayFullProblem) {
  if (!dateStr) return ''
  if (noHearingDates?.has(dateStr)) return 'This date is marked as a no-hearing date'
  return dayFullProblem ? dayFullProblem(dateStr) : ''
}

// Date the case was created (YYYY-MM-DD), or '' when unknown
export function caseCreatedDate(c) {
  const created = String(c?.createdAt || '')
  if (/^\d{4}-\d{2}-\d{2}/.test(created)) return created.slice(0, 10)

  return ''
}

// "14 Oct 2026, 6:38 pm" for a server timestamp (ISO with offset), always shown in Indian Standard Time
export function formatTimestamp(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const text = d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return `${text} IST`
}
