// Matching of judge names, kept in step with CourtMatch.sameJudge on the server so the Judges List,
// Judges on Leave and the hearing details all decide "is this the same judge" the same way

// Titles and designations ignored in a judge name
const NAME_NOISE = new Set([
  'sh', 'shri', 'smt', 'smti', 'ms', 'mrs', 'mr', 'dr', 'ld', 'hon', 'ble', 'honble',
  'justice', 'judge', 'the', 'dj', 'adj', 'asj', 'cmm', 'acmm', 'mm', 'cj', 'jj',
])

// Roman numeral at the end of a name, like "Rajesh Kumar (II)" or "Rajesh Kumar-II"
const TRAILING_NUMERAL = /.*[\s\-(]+([ivx]{1,4})\s*\)?\s*$/

// Roman numeral at the end of the name, or null
function numeralSuffix(name) {
  const m = TRAILING_NUMERAL.exec(String(name ?? '').trim().toLowerCase())
  return m ? m[1] : null
}

// Lower case words of the name without titles, accents and the trailing numeral
function nameTokens(name, numeral) {
  const plain = String(name ?? '').normalize('NFD').replace(/\p{M}/gu, '')
  const tokens = plain.toLowerCase().split(/[^a-z]+/).filter(t => t && !NAME_NOISE.has(t))
  if (numeral && tokens.length && tokens[tokens.length - 1] === numeral) tokens.pop()
  return tokens
}

// Words match when equal, or when one is just an initial of the other
function tokenMatch(a, b) {
  if (a === b) return true
  if (a.length === 1) return b.startsWith(a)
  if (b.length === 1) return a.startsWith(b)
  return false
}

// Every word of the first list pairs with a different word of the second list
function pairsUp(first, second) {
  const left = [...second]
  for (const t of first) {
    const i = left.findIndex(o => tokenMatch(t, o))
    if (i < 0) return false
    left.splice(i, 1)
  }
  return true
}

// True when both names are probably the same judge
export function sameJudge(a, b) {
  // Judges with the same name are told apart by a Roman numeral: both carry the same one, or neither does
  const numA = numeralSuffix(a)
  const numB = numeralSuffix(b)
  if (numA !== numB) return false

  const first = nameTokens(a, numA)
  const second = nameTokens(b, numB)
  if (!first.length || !second.length) return false

  const small = first.length <= second.length ? first : second
  const large = small === first ? second : first

  // A surname is never enough: with two or more words, at least two full words (not initials) must be shared.
  // "R. Kumar" or "Akshay Kumar" are not "Rajesh Kumar". A one-word name only matches an identical one-word name.
  if (small.length === 1) {
    if (large.length !== 1 || small[0].length < 2 || small[0] !== large[0]) return false
  } else if (small.filter(t => t.length > 1 && large.includes(t)).length < 2) {
    return false
  }

  // Same number of words only: each pairs with exactly one word of the other name, in any order
  if (small.length === large.length) return pairsUp(small, large)

  // Names with a different number of words are different judges
  return false
}

// Type-ahead search: every word typed must start a different word of the judge's name, in any order,
// ignoring titles ("Ms. Kanika Handa" finds "Kanika Handa", "handa kan" finds it too)
export function nameSearchMatches(query, name) {
  const typed = nameTokens(query, null)
  if (!typed.length) return false

  const words = nameTokens(name, numeralSuffix(name))
  const left = [...words]
  for (const t of typed) {
    const i = left.findIndex(w => w.startsWith(t))
    if (i < 0) return false
    left.splice(i, 1)
  }
  return true
}
