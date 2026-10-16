
// Which courts a holiday applies to
export const HOLIDAY_COURTS = [
  { value: 'DISTRICT', label: 'District Court' },
  { value: 'HIGH',     label: 'High Court' },
  { value: 'BOTH',     label: 'Both' },
]

// Normalised court type of a holiday; defaults to BOTH if missing or unknown
export function holidayCourtOf(holiday) {
  const value = String(holiday?.courtType || '').toUpperCase()
  return HOLIDAY_COURTS.some(c => c.value === value) ? value : 'BOTH'
}

// Readable label for the holiday's court type
export function holidayCourtLabel(holiday) {
  const value = holidayCourtOf(holiday)
  return HOLIDAY_COURTS.find(c => c.value === value).label
}

// Lowercase value used as a CSS class modifier
export function holidayCourtClass(holiday) {
  return holidayCourtOf(holiday).toLowerCase()
}
