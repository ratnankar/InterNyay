import { isClosedCase } from '../constants/data'
import { parseIsoDate } from './dateUtils'

// Year at the end of a case number: "SC 466/2023" -> 2023
function caseNoYear(caseNo) {
  const m = /\/\s*(\d{4})\s*$/.exec(String(caseNo || ''))
  return m ? Number(m[1]) : null
}

// Year in a CNR number (16 characters: 4 court, 6 number, 4 year): "DLST020040322019" -> 2019
function cnrYear(cnr) {
  const s = String(cnr || '').replace(/[^A-Za-z0-9]/g, '')
  return /^[A-Za-z]{4}\d{12}$/.test(s) ? Number(s.slice(-4)) : null
}

// Notes about a case whose data looks wrong or out of date. Each is { key, text }. They are hints, nothing is blocked.
// A filing date is allowed to fall in the year before the case number's year (filed in December, numbered in January)
export function caseWarnings(c, now = new Date()) {
  if (!c) return []
  const notes = []

  // Open case whose next hearing date has passed
  if (!isClosedCase(c) && c.nextHearing) {
    const d = parseIsoDate(c.nextHearing)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (!Number.isNaN(d.getTime()) && d < today) {
      notes.push({
        key: 'hearing-overdue',
        text: 'The next hearing date has passed. Refresh it from eCourts, or set the next date in Edit Case.',
      })
    }
  }

  const noYear = caseNoYear(c.caseNo)
  const filedYear = c.filingDate ? Number(String(c.filingDate).slice(0, 4)) : null
  if (noYear && filedYear && (filedYear > noYear || noYear - filedYear > 1)) {
    notes.push({
      key: 'filing-year',
      text: `The filing date (${filedYear}) does not fit case number ${c.caseNo}. Check the filing date.`,
    })
  }

  const fromCnr = cnrYear(c.cnrNo)
  if (noYear && fromCnr && fromCnr !== noYear) {
    notes.push({
      key: 'cnr-year',
      text: `The CNR number is of ${fromCnr} but the case number is of ${noYear}. Check both.`,
    })
  }

  return notes
}
