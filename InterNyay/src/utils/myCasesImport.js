// Reads the "My Cases" file that eCourts lets an advocate download (a .txt with the saved cases as JSON) and sorts the
// cases into categories. Only what is needed to show the list and pick a case is kept; when the advocate adds a case
// only its CNR is used, and everything else comes from eCourts again (the normal "Add by CNR" lookup).

// A CNR number is 16 letters and digits
const CNR = /^[A-Z0-9]{16}$/

// Categories in the order they are listed. A case type code (the "type_name" of eCourts) falls into the first one it matches
export const IMPORT_CATEGORIES = [
  { key: 'bail',      label: 'Bail',                         test: t => /^(bail|ba$)/.test(t) },
  { key: 'ni',        label: 'Cheque Bounce (NI Act)',       test: t => /(ni act|^nact$|^cc ni)/.test(t) },
  { key: 'sessions',  label: 'Sessions Cases',               test: t => t === 'sc' },
  { key: 'appeal',    label: 'Criminal Appeals & Revisions', test: t => /^(ca|cr rev|cr criminal revision|criminal revision)$/.test(t) },
  { key: 'police',    label: 'Criminal - Police Cases',      test: t => /^(cr cases?|cri case|cr case)$/.test(t) },
  { key: 'complaint', label: 'Criminal - Complaint Cases',   test: t => /^(ct cases?)$/.test(t) },
  { key: 'family',    label: 'Family & Matrimonial',         test: t => /^(hma|muslim law|mt cases?)$/.test(t) },
  { key: 'execution', label: 'Execution',                    test: t => /^ex( |$)/.test(t) },
  { key: 'accident',  label: 'Motor Accident Claims',        test: t => /^mac[tp]$/.test(t) },
  { key: 'civil',     label: 'Civil Suits',                  test: t => /^(cs|civil suit|original civil suits|arbtn)( |$)/.test(t) || /^cs\b/.test(t) },
  { key: 'crmisc',    label: 'Criminal - Miscellaneous',     test: t => /(crm|misc crl|criminal misc|warrant or summons|^mc$|^chi$|^cha$|^remp$|^coma$)/.test(t) },
  { key: 'civilmisc', label: 'Civil - Miscellaneous',        test: t => /(misc dj|misc civ|succ court|^pc$)/.test(t) },
  { key: 'other',     label: 'Other',                        test: () => true },
]

// "Cr. Case" and "CR CASES" are the same type: lower case, no dots, single spaces
const normalType = t => String(t || '').toLowerCase().replace(/\./g, ' ').replace(/\s+/g, ' ').trim()

// Category of a case from its type code. A code that is not known falls back to the court it is in
export function categoryOf(typeName, courtName = '') {
  const t = normalType(typeName)
  const hit = IMPORT_CATEGORIES.find(c => c.key !== 'other' && c.test(t))
  if (hit) return hit.key

  const court = String(courtName).toLowerCase()
  if (court.includes('family')) return 'family'
  if (court.includes('criminal') || court.includes('magistrate')) return 'crmisc'
  return 'other'
}

export const categoryLabel = key => IMPORT_CATEGORIES.find(c => c.key === key)?.label || 'Other'

// The file holds JSON inside a JSON string (sometimes twice): open it until a list comes out
function openJson(text) {
  let value = String(text || '').replace(/^\uFEFF/, '').trim()
  for (let i = 0; i < 4 && typeof value === 'string'; i++) value = JSON.parse(value)
  return value
}

const text = v => (v == null ? '' : String(v).trim())

// One case of the file in the shape the list uses. Null when it has no valid CNR
function toItem(raw) {
  const cnr = text(raw?.cino).toUpperCase()
  if (!CNR.test(cnr)) return null

  const regNo = text(raw.reg_no)
  const regYear = text(raw.reg_year)

  return {
    cnr,
    type: text(raw.type_name),
    category: categoryOf(raw.type_name, raw.establishment_name),
    caseNo: regNo && regNo !== '0' ? `${regNo}${regYear && regYear !== '0' ? `/${regYear}` : ''}` : '',
    petitioner: text(raw.petparty_name),
    respondent: text(raw.resparty_name),
    court: text(raw.establishment_name),
    room: text(raw.court_no_desg_name),
    district: text(raw.district_name),
    state: text(raw.state_name),
    nextDate: text(raw.date_next_list),
    lastDate: text(raw.date_last_list),
    decisionDate: text(raw.date_of_decision),
    disposal: text(raw.disp_name),
    purpose: text(raw.purpose_name),
    pending: !text(raw.date_of_decision),
  }
}

// Cases of the downloaded file. Throws an Error with a message for the advocate when the file is not a My Cases file
export function parseMyCases(fileText) {
  let list
  try {
    list = openJson(fileText)
  } catch {
    throw new Error('This is not a My Cases file from eCourts. Download it again and upload the .txt file.')
  }

  if (!Array.isArray(list)) throw new Error('No cases were found in this file.')

  const seen = new Set()
  const items = []
  for (const entry of list) {
    let raw = entry
    if (typeof raw === 'string') { try { raw = JSON.parse(raw) } catch { continue } }
    const item = toItem(raw)
    if (!item || seen.has(item.cnr)) continue
    seen.add(item.cnr)
    items.push(item)
  }

  if (items.length === 0) throw new Error('No cases with a CNR number were found in this file.')
  return items
}

// The list is kept for the browser session so a refresh does not ask for the file again
const KEY = 'internyay.myCasesImport'

export function saveImported(items) {
  try { sessionStorage.setItem(KEY, JSON.stringify(items)) } catch { /* too big or not allowed: the list just is not kept */ }
}

export function loadImported() {
  try {
    const items = JSON.parse(sessionStorage.getItem(KEY) || 'null')
    return Array.isArray(items) && items.length ? items : null
  } catch { return null }
}

export function clearImported() {
  try { sessionStorage.removeItem(KEY) } catch { /* nothing to clear */ }
}

// Same CNR with spaces and dashes taken out
export const cleanCnrText = t => String(t || '').toUpperCase().replace(/[\s-]/g, '')
