// The two main kinds of cases an advocate can file
export const CASE_NATURES = ['Civil', 'Criminal']

// Relief name that has special handling (challan cases have no sub case-types)
const POLICE_CHALLAN = 'Police Challan'

// Cheque-bounce complaint type; selecting it shows the extra cheque details in the case form
const NI_ACT_138_COMPLAINT = 'Complaint under Sec 138 of NI Act'

// Which side of the case our client is on
export const SIDE_COMPLAINANT = 'COMPLAINANT'
export const SIDE_ACCUSED = 'ACCUSED'

// Options for the "client side" dropdown in the case form
export const PARTY_SIDES = [
  { value: SIDE_COMPLAINANT, label: 'Complainant/Petitioner/Plaintiff' },
  { value: SIDE_ACCUSED,     label: 'Accused/Respondent/Defendant' },
]

// The same two sides worded for the nature of the case: a civil case has no complainant or accused
export function partySides(nature) {
  if (nature === 'Civil') {
    return [
      { value: SIDE_COMPLAINANT, label: 'Petitioner/Plaintiff' },
      { value: SIDE_ACCUSED,     label: 'Respondent/Defendant' },
    ]
  }
  if (nature === 'Criminal') {
    return [
      { value: SIDE_COMPLAINANT, label: 'Complainant/Petitioner' },
      { value: SIDE_ACCUSED,     label: 'Accused/Respondent' },
    ]
  }
  return PARTY_SIDES
}

// Case catalogue: nature -> relief/category -> list of case types, used for the cascading dropdowns
const CASE_CATALOG = {

  // Civil case categories
  Civil: {
    'Adoption': [
      'Adoption',
    ],
    'Appeal': [
      'Any Other Appeal',
      'First Appeal/Civil Appeal',
      'Second Appeal/Civil Appeal',
      'Setting aside a decree obtained by fraud',
    ],
    'Arbitration': [
      'Arbitration Petition',
      'Setting aside of Arbitration Award',
    ],
    'Caveat': [
      'Caveat',
      'If already Decreed execution',
    ],
    'Commercial': [
      'Any other suit under commercial court act',
      'Application by a tenant for fixation of standard rent',
      'Commercial Suit',
      'Dissolution of partnership and rendition of accounts',
      'Reference',
      'Suit for IPR',
      'Suit for money Recovery',
      'Wrong dismissal against the Government',
    ],
    'Compensation': [
      'Any other petition/suit for Compensation',
      'Application (Petition) for damages before the Motor Accidents Claims Tribunal',
      'Civil suit(Compensation)',
      'Damages against a Doctor for negligent act',
      'Damages for defamation',
      'Motor Accident Claim petition',
    ],
    'Desertion and Maintenance': [
      'Maintenance Application',
    ],
    'Execution': [
      'Decree/Order passed by Arbitrator in Commercial Cases',
      'Execution of Arbitration Award',
      'Execution of Maintenance Arbitration Award of Civil/Family Court',
      'Execution petition(Darkhast) on the basis of a decree of Civil Court',
    ],
    'Family Disputes': [
      'Conjugal Rights',
      'Divorce',
      'Divorce by mutual consent',
      'Letters of Administration',
      'Marriage petition',
      'Partition in a Hindu joint family',
      'Probate on the basis of Will',
      'Succession certificate',
    ],
    'Injunction': [
      'Application for temporary injunction',
      'Civil suit(Injunction)',
      'Mandatory Injunction',
      'Permanent Injunction',
    ],
    'Miscellaneous': [
      'Transfer Application',
    ],
    'Possession': [
      'Civil suit (possession)',
      'For possession by a landlord against the tenant under the Rent Control Act (Eviction Petition)',
      'Specific performance of Contract or Damages',
    ],
    'Recovery of Money': [
      'Any other recovery suit',
      'Civil Suit (recovery)',
      'Mesne profits',
      'Recovery of money for price of goods sold or work done',
      'Recovery of money on the basis of a promissory note',
      'Summary Suit',
    ],
    'Review/Revision': [
      'Review Application',
    ],
    'Summary Suit': [],

    // High Court and Supreme Court matters (also added to existing databases by migration V9)
    'Writ Petition': [
      'Writ Petition (Civil)',
      'Public Interest Litigation (PIL)',
      'Contempt Petition (Civil)',
    ],
    'High Court Appeals and Petitions': [
      'Letters Patent Appeal (LPA)',
      'First Appeal from Order (FAO)',
      'Regular First Appeal (RFA)',
      'Regular Second Appeal (RSA)',
      'Civil Miscellaneous Main (CM(M))',
      'Civil Revision Petition (CRP)',
    ],
    'High Court Original Side Suit': [
      'Civil Suit (Original Side)',
      'Commercial Suit (Original Side)',
    ],
    'Special Leave Petition': [
      'Special Leave Petition (Civil)',
      'Civil Appeal (Supreme Court)',
      'Transfer Petition (Civil)',
      'Review Petition (Civil)',
      'Curative Petition',
    ],
  },

  // Criminal case categories
  Criminal: {
    'Appeal': [
      'Any other Appeal',
      'Appeal Against the Judgement of Acquittal',
      'Appeal against the Judgement and Order of conviction',
      'Appeal under Sec 138 of NI Act',
      'Recovery of amount ordered',
    ],
    'Bail': [
      'Anticipatory Bail',
      'Cancellation of Bail',
      'Regular Bail',
    ],
    [POLICE_CHALLAN]: [],
    'Criminal Complaint': [
      'Any Other Complaint',
      'Complaint under Sec 138 of NI Act',
    ],
    'Desertion and Maintenance': [
      'Maintenance with other relief',
      'Plain maintenance application',
    ],
    'Execution': [
      'Any Other Execution',
      'Execution of maintenance order already passed in favor of wife',
      'Execution petition(Darkhast) on the basis of order of Criminal Court',
    ],
    'Family disputes': [
      'Domestic violence',
    ],
    'Miscellaneous': [
      'Transfer Application',
    ],
    'Protest Petition': [],
    'Pre Trial Application': [
      'Return of property Application',
    ],
    'Punishing wrong doer with or without compensation': [
      'Abuses and threatening',
      'Application U/S 340 Perjury',
      'Application u/s 156(Direction to register FIR)',
      'Bigamous marriage',
      'Cheating',
      'Criminal complaint',
    ],
    'Review/Revision': [
      'Any Other Revision',
      'Criminal Revision Application',
      'Memo of revision application against the order of maintenance',
    ],

    // High Court and Supreme Court matters (also added to existing databases by migration V9)
    'Quashing of FIR or Proceedings': [
      'Quashing Petition (CRL.M.C.)',
    ],
    'Writ Petition': [
      'Writ Petition (Criminal)',
      'Contempt Petition (Criminal)',
    ],
    'High Court Appeals and Petitions': [
      'Criminal Appeal (CRL.A.)',
      'Criminal Revision Petition (CRL.REV.P.)',
      'Leave to Appeal (CRL.L.P.)',
    ],
    'Special Leave Petition': [
      'Special Leave Petition (Criminal)',
      'Criminal Appeal (Supreme Court)',
      'Transfer Petition (Criminal)',
      'Review Petition (Criminal)',
    ],
  },
}

// Replaces the catalogue with the choices the admin manages (built-in values stay when there is nothing to apply)
export function setCaseCatalog(reliefs, types) {
  const next = {}
  const natures = new Set([...Object.keys(CASE_CATALOG), ...CASE_NATURES])
  natures.forEach(n => { next[n] = {} })

  reliefs.forEach(r => {
    if (!next[r.parent]) next[r.parent] = {}
    next[r.parent][r.value] = []
  })
  types.forEach(t => {
    const cut = t.parent.indexOf('||')
    const nature = t.parent.slice(0, cut), relief = t.parent.slice(cut + 2)
    if (next[nature]?.[relief]) next[nature][relief].push(t.value)
  })

  Object.keys(CASE_CATALOG).forEach(k => delete CASE_CATALOG[k])
  Object.assign(CASE_CATALOG, next)
}

// Relief/category names available for a given nature (Civil/Criminal)
export function reliefOptions(nature) {
  return Object.keys(CASE_CATALOG[nature] || {})
}

// Case types available under a nature and relief
export function caseTypeOptions(nature, relief) {
  return CASE_CATALOG[nature]?.[relief] || []
}

// True when the selected relief is a police challan
export function isPoliceChallan(relief) {
  return String(relief || '').trim().toLowerCase() === POLICE_CHALLAN.toLowerCase()
}

// True when the selected case type is a Sec 138 NI Act (cheque bounce) complaint
export function isNiAct138Complaint(caseType) {
  return String(caseType || '').trim().toLowerCase() === NI_ACT_138_COMPLAINT.toLowerCase()
}

// Converts our client's side + case nature into the party label (e.g. Accused, Plaintiff/Petitioner)
export function sideSubType(side, nature) {
  const criminal = nature === 'Criminal'

  if (side === SIDE_ACCUSED) return criminal ? 'Accused' : 'Defendant/Respondent'
  return criminal ? 'Complainant' : 'Plaintiff/Petitioner'
}

// Client sub-types that are filled in automatically from the chosen side
export const AUTO_SUBTYPES = ['Complainant', 'Plaintiff/Petitioner', 'Accused', 'Defendant/Respondent']

// Reverse of sideSubType: which side a client sub-type belongs to (null if unknown)
export function sideOfSubType(subType) {
  if (subType === 'Accused' || subType === 'Defendant/Respondent') return SIDE_ACCUSED
  if (['Complainant', 'Plaintiff/Petitioner', 'Appellant', 'Victim'].includes(subType)) return SIDE_COMPLAINANT
  return null
}

// Names of our side in title order: the clients first, then the non-clients. A non-client picked with "Show in title"
// (leadKey) comes first instead
export function titleOurNames(clients, nonClients, leadKey) {
  const clientNames = (clients || []).map(c => c.name)
  const lead = leadKey ? (nonClients || []).find(n => n.key === leadKey) : null

  if (!lead) return [...clientNames, ...(nonClients || []).map(n => n.name)]
  return [lead.name, ...clientNames, ...(nonClients || []).filter(n => n !== lead).map(n => n.name)]
}

// Names of the opposite parties in title order; the one picked with "Show in title" (leadKey) comes first
export function titleOpposingNames(opponents, leadKey) {
  const list = opponents || []
  const lead = leadKey ? list.find(o => o.key === leadKey) : null
  return (lead ? [lead, ...list.filter(o => o !== lead)] : list).map(o => o.name)
}

// Builds the case title as "Party v. Party", placing our side first unless they are the accused/respondent.
// ourNames are the clients and the non-client parties on our side (the first one is the main client), opposingNames are
// all the opposite parties. Our side shows only the first name, followed by "& Ors." when there are more
// For a police challan case (withState) the complainant side, the left of "v.", is just "State"
export function composeCaseTitle({ clientSide, ourNames, opposingNames, withState = false }) {
  const clean = names => (names || []).map(n => String(n || '').trim()).filter(Boolean)

  // One side of the title: the first name, then "& Ors." when there are more
  const sideText = list => {
    const names = clean(list)
    if (names.length === 0) return '…'
    return names.length > 1 ? `${names[0]} & Ors.` : names[0]
  }

  const accused = clientSide === SIDE_ACCUSED
  // In a police challan case the complainant side (the left of "v.") is the State alone, with no other name
  const ours = withState && !accused ? 'State' : sideText(ourNames)
  const theirs = withState && accused ? 'State' : sideText(opposingNames)

  return accused
    ? `${theirs} v. ${ours}`
    : `${ours} v. ${theirs}`
}

// Replaces a client's old name with the new one inside a case title (whole-name match only)
export function renameInCaseTitle(title, oldName, newName) {
  if (!title || !oldName || !newName || oldName === newName) return title

  const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // The character before the name is captured instead of using a lookbehind, which iOS Safari older than 16.4 cannot parse
  return title.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'gu'), (_m, before) => before + newName)
}

// Reads an existing "A vs B" title and returns the opposing party's name
export function guessOpposingParty(title, clientSide) {
  const parts = String(title || '').split(/\s+(?:vs\.?|v\/s|v\.?)\s+/i)
  if (parts.length !== 2) return ''

  return (clientSide === SIDE_ACCUSED ? parts[0] : parts[1]).trim()
}