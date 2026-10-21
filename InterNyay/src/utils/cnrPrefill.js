// Turns the case details eCourts gave for a CNR into values of the Add Case form.
// Everything here is a best guess the advocate checks on the form: what cannot be matched with the app's own court
// table or case catalogue is left empty, never guessed wrongly.

import { SIDE_ACCUSED, SIDE_COMPLAINANT, caseTypeOptions, isPoliceChallan, reliefOptions } from '../constants/caseCatalog'
import { getCourtNames, getCourtNosByBuilding, getDistricts, isHighCourt, isOwnDistrict } from '../constants/courts'
import { toFormParty } from './caseParties'

// Words that say nothing about which court it is
const GENERIC = new Set(['court', 'courts', 'complex', 'district', 'of', 'the', 'and'])

// Lower case words of a text, without the generic ones
const words = text => String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w && !GENERIC.has(w))

// Court and district of the app's court table that the eCourts court points to. A court counts when all its words
// are in what eCourts says; a district counts the same way. One clear winner is needed, otherwise nothing is chosen
function matchCourtPlace(detail) {
  const said = new Set(words(`${detail.courtName} ${detail.district}`))
  const has = list => list.length > 0 && list.every(w => said.has(w))

  const found = []
  for (const court of getCourtNames()) {
    const courtHit = has(words(court))
    const districts = getDistricts(court)

    // A court with no district (High Court, Supreme Court) is a place of its own
    if (districts.length === 0) {
      if (courtHit) found.push({ court, district: '', score: 3 })
      continue
    }

    for (const district of districts) {
      const districtHit = !isOwnDistrict(court, district) && has(words(district))
      const score = (courtHit ? 2 : 0) + (districtHit ? 1 : 0) + (courtHit && isOwnDistrict(court, district) ? 1 : 0)
      if (score > 0) found.push({ court, district, score })
    }
  }

  if (found.length === 0) return null

  const top = Math.max(...found.map(f => f.score))
  const best = found.filter(f => f.score === top)
  if (best.length === 1) return { court: best[0].court, district: best[0].district }

  // Several places fit equally: when they are all districts of one court, the court is still certain
  const courts = [...new Set(best.map(b => b.court))]
  return courts.length === 1 ? { court: courts[0], district: '' } : null
}

// 5, "05" and "Court No. 5" are the same court room
const roomNumber = text => {
  const t = String(text ?? '').trim().toLowerCase().replace(/^(court\s*)?(room\s*)?(no\.?\s*)?/, '').replace(/^0+(?=\d)/, '')
  return t
}

// Building, floor and number of the court room, when it is in the court table exactly once
function matchRoom(court, district, courtNo) {
  const wanted = roomNumber(courtNo)
  if (!court || !wanted) return null

  const hits = getCourtNosByBuilding(court, district)
    .flatMap(g => g.rooms.filter(r => roomNumber(r.courtNo) === wanted).map(r => ({ courtNo: r.courtNo, building: g.building, floor: r.floor })))

  return hits.length === 1 ? hits[0] : null
}

// Relief and case type of the app's catalogue that eCourts' case type names, when it names one exactly
function matchCatalog(nature, caseType, hasFir) {
  const wanted = String(caseType || '').trim().toLowerCase()

  if (wanted) {
    for (const relief of reliefOptions(nature)) {
      const type = caseTypeOptions(nature, relief).find(t => t.trim().toLowerCase() === wanted)
      if (type) return { reliefSought: relief, caseType: type }
    }
  }

  // A criminal case with an FIR is a police challan case, which is also what shows the FIR fields
  if (nature === 'Criminal' && hasFir) {
    const relief = reliefOptions(nature).find(isPoliceChallan)
    if (relief) {
      const types = caseTypeOptions(nature, relief)
      return { reliefSought: relief, caseType: types.length === 1 ? types[0] : '' }
    }
  }

  return { reliefSought: '', caseType: '' }
}

// Parties on the opposite side of our client: the respondents when our client is the petitioner, else the petitioners
export function opponentNames(detail, clientSide) {
  const list = clientSide === SIDE_ACCUSED ? detail?.petitioners : detail?.respondents
  return Array.isArray(list) ? list : []
}

// The opposite parties as the form keeps them
export const opponentParties = (detail, clientSide) => opponentNames(detail, clientSide).map(name => toFormParty({ name }))

// Form values for a case read from eCourts. The result is merged into the Add Case form
export function cnrDetailToForm(detail) {
  const nature = detail.caseNature === 'Criminal' ? 'Criminal' : 'Civil'

  const place = matchCourtPlace(detail)
  const room = place ? matchRoom(place.court, place.district, detail.courtNo) : null
  const catalog = matchCatalog(nature, detail.caseType, !!detail.firNo)

  return {
    cnrNo: detail.cnr || '',
    caseNo: detail.caseNo || '',
    filingDate: detail.filingDate || '',
    nextHearing: detail.nextHearing || '',

    caseNature: nature,
    ...catalog,

    // Court: only what the court table confirms, otherwise the court already on the form stays and the advocate picks
    ...(place ? {
      court: place.court,
      district: isHighCourt(place.court) ? '' : place.district,
      courtNo: room?.courtNo || '',
      building: room?.building || '',
      floor: room?.floor || '',
    } : {}),

    // FIR details only show for a police challan case, where they are kept
    ...(isPoliceChallan(catalog.reliefSought) ? { firNo: detail.firNo || '', policeStation: detail.policeStation || '' } : {}),

    // The new case form starts on the petitioner side; opposite parties follow the side if it is changed
    clientSide: SIDE_COMPLAINANT,
    opponents: opponentParties(detail, SIDE_COMPLAINANT),

    // Kept for the notes on the form and for swapping the opposite parties when the side changes. Never sent
    cnrDetail: detail,
  }
}
