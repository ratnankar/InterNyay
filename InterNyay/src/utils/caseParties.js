// Opposite parties and non-client parties of a case.
// In the case form a party is { key, name, fatherName, address, phone } (non-clients also have subType).
// The key only tells list items apart while the form is open; it is never sent to the server.

let partyCounter = 1

// A new key for a party that was just added in the form
export const newPartyKey = () => `party-${partyCounter++}`

// Party from the server (or typed in the popup) in the shape the form uses
export function toFormParty(p) {
  return {
    key:        newPartyKey(),
    name:       p?.name       || '',
    fatherName: p?.fatherName || '',
    address:    p?.address    || '',
    phone:      p?.phone      || '',
    ...(p?.subType != null ? { subType: p.subType } : {}),
  }
}

// Party in the shape the server expects: trimmed, no key
export function toRequestParty(p) {
  return {
    name:       (p.name       || '').trim(),
    fatherName: (p.fatherName || '').trim(),
    address:    (p.address    || '').trim(),
    phone:      (p.phone      || '').trim(),
    ...(p.subType != null ? { subType: p.subType || '' } : {}),
  }
}

// Opposite parties of a saved case
export const opponentsOf = c => (Array.isArray(c?.opponents) ? c.opponents : [])

// Non-client parties of a saved case
export const nonClientsOf = c => (Array.isArray(c?.nonClients) ? c.nonClients : [])

// One line for a party: "Name · Father: X · phone · address"
export function partyText(p) {
  return [
    p.name,
    p.fatherName && `Father: ${p.fatherName}`,
    p.phone,
    p.address,
  ].filter(Boolean).join(' · ')
}

// Second line shown under a party's name in the form: father's name and phone
export function partySubText(p) {
  return [
    (p.fatherName || '').trim() && `Father: ${p.fatherName.trim()}`,
    (p.phone || '').trim(),
  ].filter(Boolean).join(' · ')
}
