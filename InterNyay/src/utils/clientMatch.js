// Helpers to spot a client who is already saved, so the same person is not added twice

// Lower case, single spaces, nothing else
export function normName(s) {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

// Digits of a phone number without the country code
function phoneDigits(p) {
  const d = String(p || '').replace(/\D/g, '')
  return d.length > 10 ? d.slice(-10) : d
}

// Every name a client goes by: the main name and the other names
export function clientNames(c) {
  return [c?.name, ...(c?.otherNames || [])].map(normName).filter(Boolean)
}

// "S/o Ram Kumar" text for a client or form, empty when no relative is given
export function relationText(c) {
  const name = (c?.relationName || '').trim()
  if (!name) return ''
  return `${c.relationType || 'S/o'} ${name}`
}

// True when the form describes the very same client: same name and same "son of" name
export function isSameClient(client, form) {
  const names = clientNames(client)
  const typed = normName(form.name)
  if (!typed || !names.includes(typed)) return false
  return normName(client.relationName) === normName(form.relationName)
}

// Saved clients that look like the one being registered: a name or other name in common, or the same phone number.
// Exact copies come first
export function findClientMatches(clients, form) {
  const typedNames = [form.name, ...(form.otherNames || [])].map(normName).filter(n => n.length >= 2)
  const phones = [form.whatsappPhone, form.additionalPhone].map(phoneDigits).filter(p => p.length === 10)

  const hits = []
  for (const c of clients || []) {
    const names = clientNames(c)
    const sharesName = typedNames.some(t => names.some(n => n === t || n.includes(t) || t.includes(n)))
    const sharesPhone = phones.length > 0 &&
      [c.whatsappPhone, c.additionalPhone].map(phoneDigits).some(p => p && phones.includes(p))
    if (sharesName || sharesPhone) hits.push({ client: c, exact: isSameClient(c, form) })
  }
  return hits.sort((a, b) => Number(b.exact) - Number(a.exact)).slice(0, 5)
}

// Types of relation for the "son of" option
export const RELATION_TYPES = [
  ['S/o', 'Son of (S/o)'],
  ['D/o', 'Daughter of (D/o)'],
  ['W/o', 'Wife of (W/o)'],
  ['H/o', 'Husband of (H/o)'],
  ['C/o', 'Care of (C/o)'],
]

// Other names without blanks or repeats, ready to send
export function cleanOtherNames(list, mainName) {
  const out = []
  for (const n of list || []) {
    const t = String(n || '').trim().replace(/\s+/g, ' ')
    if (!t || normName(t) === normName(mainName)) continue
    if (!out.some(x => normName(x) === normName(t))) out.push(t)
  }
  return out
}
