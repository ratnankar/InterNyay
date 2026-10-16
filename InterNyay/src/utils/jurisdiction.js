// Lowercase and trimmed text, used for case-insensitive station matching
const normalise = value => (value || '').trim().toLowerCase()

// Google Maps search link for an address
export function mapsLink(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || '')}`
}

// tel: link for a phone number (spaces removed)
export function telLink(phone) {
  return `tel:${(phone || '').replace(/\s/g, '')}`
}

// Finds the tribunal/commission whose station list contains the typed police station
function findByStation(entries, stationInput) {
  const q = normalise(stationInput)
  if (!q) return null
  return entries.find(e => e.stations.some(s => normalise(s) === q)) || null
}

// Splits the DRT directory into benches, high value DRT and appellate tribunal, and prepares table rows for the page
export function buildDrtModel(directory) {
  const tribunals = directory?.tribunals || []
  const benches = tribunals.filter(t => t.kind === 'BENCH')
  const highValue = tribunals.find(t => t.kind === 'HIGH_VALUE') || null
  const appellate = tribunals.find(t => t.kind === 'APPELLATE') || null

  // Table rows: all benches followed by the high value tribunal
  const rows = [...benches, ...(highValue ? [highValue] : [])].map((t, i) => ({
    sno: i + 1,
    tribunal: t,
    name: t.name,
    location: t.location,
    phone: t.phone,
    amount: t.amountLabel,
  }))

  return {
    benches,
    highValue,
    appellate,
    rows,
    stationOptions: Array.from(new Set(benches.flatMap(t => t.stations))),
    isEmpty: tribunals.length === 0,
  }
}

// DRT bench that covers a police station
export function findDrtTribunalByStation(model, stationInput) {
  return findByStation(model.benches, stationInput)
}

// Splits the consumer commission directory into district, state and national commissions
export function buildConsumerModel(directory) {
  const commissions = directory?.commissions || []
  const districts = commissions
    .filter(c => c.kind === 'DISTRICT')
    .map((c, i) => ({ ...c, sno: i + 1 }))

  return {
    districts,
    state: commissions.find(c => c.kind === 'STATE') || null,
    national: commissions.find(c => c.kind === 'NATIONAL') || null,
    stationOptions: Array.from(new Set(districts.flatMap(c => c.stations))),
    isEmpty: commissions.length === 0,
  }
}

// District commission that covers a police station
export function findConsumerCommissionByStation(model, stationInput) {
  return findByStation(model.districts, stationInput)
}
