
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

// Same text ignoring case and spaces around it; empty text never matches
function sameText(a, b) {
  const x = String(a ?? '').trim().toLowerCase()
  const y = String(b ?? '').trim().toLowerCase()

  return x !== '' && x === y
}

// Judges sitting in one court room. Rooms in different buildings can share a number, so when the room and the
// judge's listing both name a building (and floor) they must agree; a listing without one still matches by number
export function judgesForRoom(courtNumbers, { courtNo, building, floor } = {}) {
  return judgesForCourtNo(courtNumbers, courtNo)
    .filter(j => !building || !j.building || sameText(j.building, building))
    .filter(j => !floor || !j.floor || sameText(j.floor, floor))
}
