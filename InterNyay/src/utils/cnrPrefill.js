// Turns the case details eCourts gave for a CNR into values of the Add Case form.
// Everything here is a best guess the advocate checks on the form: what cannot be matched with the app's own court
// table or case catalogue is left empty, never guessed wrongly.

import { SIDE_ACCUSED, SIDE_COMPLAINANT, caseTypeOptions, isPoliceChallan, reliefOptions, sideSubType } from '../constants/caseCatalog'
import { toFormParty } from './caseParties'
import { getCourtNames, getCourtNosByBuilding, getDistricts, isHighCourt, isOwnDistrict } from '../constants/courts'

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
  if (!nature) return { reliefSought: '', caseType: '' }
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

// Titles and short words ignored when two names are compared
const NAME_NOISE = new Set(['mr', 'mrs', 'ms', 'miss', 'shri', 'sh', 'smt', 'shrimati', 'dr', 'adv', 'advocate', 'm', 's', 'ms', 'and', 'the', 'late'])
const nameWords = text => String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w && !NAME_NOISE.has(w))

// Same person or firm: every word of the shorter name is in the longer one (Arun Jaitley / MR.ARUN JAITLEY).
// A single word only matches a single word, so "Kumar" never matches every Kumar
export function sameName(a, b) {
  const x = nameWords(a), y = nameWords(b)
  if (x.length === 0 || y.length === 0) return false
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  if (short.length === 1 && long.length > 1) return false
  return short.every(w => long.includes(w))
}

// Which side a person is on in the case, going by the names eCourts lists: the petitioners and respondents, or when
// advocates is true their advocates. Null when the name is on neither side or on both
export function detectSide(detail, name, { advocates = false } = {}) {
  if (!detail || !String(name || '').trim()) return null

  const petitioner = (advocates ? detail.petitionerAdvocates : detail.petitioners) || []
  const respondent = (advocates ? detail.respondentAdvocates : detail.respondents) || []
  const onPetitioner = petitioner.some(n => sameName(n, name))
  const onRespondent = respondent.some(n => sameName(n, name))

  if (onPetitioner === onRespondent) return null
  return onPetitioner ? SIDE_COMPLAINANT : SIDE_ACCUSED
}

// Case title as eCourts has it: the petitioners against the respondents, with the names kept as the court wrote them.
// More than one name on a side is shortened to the first name and "& Ors." like every other case title
export function cnrCaseTitle(detail) {
  const side = list => {
    const names = (Array.isArray(list) ? list : []).map(n => String(n || '').trim()).filter(Boolean)
    if (names.length === 0) return ''
    return names.length > 1 ? `${names[0]} & Ors.` : names[0]
  }

  const left = side(detail?.petitioners)
  const right = side(detail?.respondents)
  if (!left && !right) return caseNumberTitle(detail)
  return `${left || '…'} v. ${right || '…'}`
}

// Title of a case whose parties eCourts does not list (family and Mahila court cases show no names): the case number,
// with the case type in front when the number does not already say it, so the case still has a title to be found by
function caseNumberTitle(detail) {
  const no = String(detail?.caseNo || '').trim()
  const type = String(detail?.caseType || '').trim()
  if (no) return type && !no.toLowerCase().includes(type.toLowerCase()) ? `${type} ${no}` : no
  return type || (detail?.cnr ? `Case ${detail.cnr}` : '')
}

// The names eCourts lists on the other side from ours, as opposite parties of the form (editable like typed ones)
export function cnrOpponents(detail, side) {
  const names = (side === SIDE_COMPLAINANT ? detail?.respondents : detail?.petitioners) || []
  return names.map(n => String(n || '').trim()).filter(Boolean).map(name => toFormParty({ name }))
}

// The names eCourts lists on OUR side, as non-client parties of the form. They stay non-clients until the advocate
// marks one as a client (or picks that person as the client), so both sides of the case are always visible
export function cnrOurSide(detail, side, nature = '') {
  const names = (side === SIDE_COMPLAINANT ? detail?.petitioners : detail?.respondents) || []
  return names
    .map(n => String(n || '').trim()).filter(Boolean)
    .map(name => toFormParty({ name, subType: sideSubType(side, nature) }))
}

// Form values for a case read from eCourts. The result is merged into the Add Case form
export function cnrDetailToForm(detail, { advocateName = '' } = {}) {
  // Left empty when eCourts does not say, the advocate picks it on the form
  const nature = detail.caseNature === 'Criminal' || detail.caseNature === 'Civil' ? detail.caseNature : ''

  const place = matchCourtPlace(detail)
  const room = place ? matchRoom(place.court, place.district, detail.courtNo) : null
  const catalog = matchCatalog(nature, detail.caseType, !!detail.firNo)

  // Our side: the logged-in advocate is listed on one side. When he is not listed, the side is worked out later
  // from the client chosen for the case, and until then it is the accused side for a police challan case (the State is
  // the petitioner there, and it is never our client) and the petitioner side for any other case
  const side = detectSide(detail, advocateName, { advocates: true })
    || (isPoliceChallan(catalog.reliefSought) ? SIDE_ACCUSED : SIDE_COMPLAINANT)

  return {
    cnrNo: detail.cnr || '',
    caseNo: detail.caseNo || '',
    filingDate: detail.filingDate || '',
    registrationDate: detail.registrationDate || '',
    firstHearingDate: detail.firstHearingDate || '',
    caseStage: detail.caseStage || '',
    actsSections: detail.actsSections || '',
    decisionDate: detail.decisionDate || '',
    disposalNature: detail.disposalNature || '',
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
    ...(isPoliceChallan(catalog.reliefSought) ? { firNo: detail.firNo || '', firSection: String(detail.actsSections || '').slice(0, 1000), policeStation: detail.policeStation || '' } : {}),

    // Which side our client is on. The opposite parties start as the names eCourts lists on the other side;
    // the advocate can edit, remove or add parties like in a case added by hand
    clientSide: side,
    opponents: cnrOpponents(detail, side),
    // The names eCourts lists on our side start as non-clients; the advocate marks the real client(s) from them
    nonClients: cnrOurSide(detail, side, nature),
    titleLead: null,

    // The case title is not set here: in a case added by CNR the form uses cnrCaseTitle(cnrDetail) until the advocate types their own
    title: '',
    titleEdited: false,

    // Kept for the notes on the form and for swapping the opposite parties when the side changes. Never sent
    cnrDetail: detail,
  }
}
