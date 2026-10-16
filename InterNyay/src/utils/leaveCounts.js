import { formatDate, parseIsoDate } from './dateUtils'
import { holidayCourtOf } from '../constants/holidays'
import { isHighCourt } from '../constants/courts'

// Longest leave expanded day by day, so one bad date range can't flood the calendar
const MAX_LEAVE_DAYS = 366

// Whether a judge's leave counts on a date.
// Sundays never count. A District Court holiday removes District Court judges, a High Court holiday removes
// High Court judges, a holiday for Both removes everyone; judges of the other court still count.
function leaveCountsOn(dateStr, judgeIsHighCourt, holiday) {
  if (parseIsoDate(dateStr).getDay() === 0) return false
  if (!holiday) return true

  const applies = holidayCourtOf(holiday)
  if (applies === 'BOTH') return false
  return applies === 'HIGH' ? !judgeIsHighCourt : judgeIsHighCourt
}

// Every date a leave covers, as 'YYYY-MM-DD' strings
function leaveDates(j) {
  const from = parseIsoDate(String(j.leaveFrom).slice(0, 10))
  const to   = parseIsoDate(String(j.leaveTo).slice(0, 10))
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return []

  const dates = []
  for (let d = from, n = 0; d <= to && n < MAX_LEAVE_DAYS; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1), n++) {
    dates.push(formatDate(d))
  }
  return dates
}

// Leaves that count on each date, after the Sunday and holiday rules: Map of date -> [{ j, status }]
export function leavesByDate(leaves, holidays) {
  const holidayByDate = new Map((holidays || []).map(h => [h.date, h]))
  const map = new Map()

  leaves.forEach(entry => {
    const high = isHighCourt(entry.j.court)
    leaveDates(entry.j).forEach(ds => {
      if (!leaveCountsOn(ds, high, holidayByDate.get(ds))) return
      if (!map.has(ds)) map.set(ds, [])
      map.get(ds).push(entry)
    })
  })
  return map
}
