import { CLOSED_CASE_STATUSES, WITHDRAWN_STATUS } from '../constants/data'

// Statuses that ask for confirmation before they are applied
const CONFIRMED_STATUSES = ['Decided', WITHDRAWN_STATUS]

// Builds the confirmation text for moving a case to Decided / Withdrawn; returns null if no confirmation is needed
export function statusChangeQuestion(caseItem, next, hearingDate) {
  if (!caseItem || !next || next === caseItem.status || !CONFIRMED_STATUSES.includes(next)) return null

  // Closing an open case frees its file number for reuse
  const wasOpen = !CLOSED_CASE_STATUSES.includes(caseItem.status)
  const withdrawing = next === WITHDRAWN_STATUS

  const question = withdrawing
    ? `Mark case "${caseItem.title}" as withdrawn?`
    : `Mark case "${caseItem.title}" as decided?`

  // Extra note about the released file number
  const releases = wasOpen && caseItem.fileSeq != null
    ? ` File number ${caseItem.fileSeq} will be released for reuse.`
    : ''

  // Withdrawn cases lose their upcoming hearing from the calendar (it stays in the hearing history)
  const hearing = withdrawing && hearingDate
    ? ` Its hearing on ${hearingDate} will be removed from the calendar and kept in the hearing history.`
    : ''

  return `${question}${releases}${hearing}`
}
