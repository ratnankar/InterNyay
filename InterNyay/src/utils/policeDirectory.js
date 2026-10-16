
// Always gives a string so the UI never shows "null" or "undefined"
const str = v => (v == null ? '' : String(v))

// Normalises an office (DCP, Addl. DCP, CAW cell, ACP) into post, address, email and phone
const office = o => ({
  post:    str(o?.post),
  address: str(o?.address),
  email:   str(o?.email),
  phone:   str(o?.phone),
})

// Flattens districts -> sub-divisions -> stations into one searchable list, with the officers above each station attached
export function buildStationIndex(directory) {
  const out = []

  ;(directory?.districts || []).forEach(d => {
    ;(d.subDivisions || []).forEach(sd => {
      ;(sd.stations || []).forEach(ps => {
        out.push({
          key: `${d.id}:${sd.id}:${ps.id}`,
          stationId: ps.id,
          station: str(ps.name),
          stationAddress: str(ps.address),
          stationPin: str(ps.pin),
          stationPhone: str(ps.phone),
          stationEmail: str(ps.email),
          districtId: d.id,
          district: str(d.name),
          range: str(d.range),
          hq: str(d.hq),
          dcp: office(d.dcp),
          addlDcp: (d.addlDcp || []).map(office),
          caw: office(d.caw),
          acp: office({ post: sd.acp, address: sd.address, email: sd.email, phone: sd.phone }),
          subDivision: str(sd.acp).replace(/^ACP\s*\/\s*/, ''),
        })
      })
    })
  })

  return out.sort((a, b) => a.station.localeCompare(b.station))
}

// Searches stations by name, sub-division, pin, district or address; best matches come first
export function searchStations(index, query, districtId = 'all') {
  // Lowercase and strip spaces/punctuation so "Hauz Khas" matches "hauzkhas"
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const q = norm(query)

  // Limit the search to one district, or to a list of districts (an array of ids), unless "all" is selected
  const wanted = Array.isArray(districtId) ? districtId.map(String) : null
  const scope = index.filter(
    e => districtId === 'all'
      || (wanted ? wanted.includes(String(e.districtId)) : String(e.districtId) === String(districtId))
  )
  if (!q) return scope

  // Lower score = better match: exact name, name starts with, name contains, then other fields
  const score = e => {
    const st = norm(e.station)
    if (st === q) return 0
    if (st.startsWith(q)) return 1
    if (st.includes(q)) return 2
    if (norm(e.subDivision).includes(q)) return 3
    if ((e.stationPin || '').includes(String(query).trim())) return 4
    if (norm(e.district).includes(q)) return 5
    if (norm(e.stationAddress).includes(q)) return 6
    return 99
  }

  return scope
    .map(e => ({ e, s: score(e) }))
    .filter(x => x.s < 99)
    .sort((a, b) => a.s - b.s || a.e.station.localeCompare(b.e.station))
    .map(x => x.e)
}

// Options for the district dropdown, with an "All Districts" entry first
export function districtOptions(directory) {
  return [
    { id: 'all', name: 'All Districts' },
    ...(directory?.districts || []).map(d => ({ id: d.id, name: d.name })),
  ]
}

// Summary line like "190 police stations · 45 sub-divisions · 15 districts" plus the data source note
export function buildSourceNote(directory) {
  const districts = directory?.districts || []
  const subs      = districts.reduce((n, d) => n + (d.subDivisions || []).length, 0)
  const stations  = districts.reduce(
    (n, d) => n + (d.subDivisions || []).reduce((m, sd) => m + (sd.stations || []).length, 0), 0)

  const counts = `${stations} territorial police stations · ${subs} sub-divisions · ${districts.length} districts.`
  return [counts, directory?.sourceNote].filter(Boolean).join(' ')
}
