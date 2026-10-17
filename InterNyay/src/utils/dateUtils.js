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

// True if the date falls on a Sunday
export function isSunday(dateStr) {
  return !!dateStr && parseIsoDate(dateStr).getDay() === 0
}

// Returns an error message if a hearing can't be set on this date, otherwise an empty string
// dayFullProblem (optional) is the app's check for a day that already holds its daily limit, it answers a message or ''
export function hearingDateProblem(dateStr, noHearingDates, dayFullProblem) {
  if (!dateStr) return ''
  if (isSunday(dateStr)) return 'Hearings cannot be set on a Sunday'
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
