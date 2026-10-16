
// Words ignored when comparing court numbers ("Court No. 5" and "5" should match)
const COURT_NO_NOISE = new Set(['court', 'room', 'no', 'nos', 'number'])

// Normalises a court number: lowercase, noise words removed, leading zeros dropped
function courtNoKey(value) {
  if (value == null) return null

  let cleaned = String(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(s => s && !COURT_NO_NOISE.has(s))
    .join('')

  if (!cleaned) return null
  if (/^\d+$/.test(cleaned)) cleaned = cleaned.replace(/^0+(?=\d)/, '')

  return cleaned
}

// Pulls out the only number in the text (null if there are none or several)
function courtNoNumber(value) {
  if (value == null) return null

  const runs = String(value).match(/\d+/g)
  if (!runs || runs.length !== 1) return null

  return runs[0].replace(/^0+(?=\d)/, '')
}

// True if two court numbers refer to the same court room, ignoring formatting differences
function sameCourtNo(a, b) {
  const x = courtNoKey(a)
  const y = courtNoKey(b)

  if (x == null || y == null) return false
  if (x === y) return true

  const numberA = courtNoNumber(a)
  return numberA != null && numberA === courtNoNumber(b)
}

// Judges sitting in the given court room, matched leniently on the room number
export function judgesForCourtNo(courtNumbers, courtNo) {
  if (courtNoKey(courtNo) == null) return []

  return (courtNumbers || []).filter(j => sameCourtNo(courtNo, j.courtRoomNo))
}
