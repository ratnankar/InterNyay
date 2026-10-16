// Areas of practice an advocate can select in their profile
export const SPECIALIZATIONS = [
  'Criminal Law',
  'Civil Law',
  'Civil & Criminal',
  'Family & Matrimonial',
  'Property & Real Estate',
  'Corporate & Commercial',
  'Banking & Finance',
  'Company Law & Insolvency (IBC)',
  'Taxation',
  'Labour & Employment',
  'Service Matters',
  'Consumer Protection',
  'Constitutional & Writ',
  'Intellectual Property',
  'Arbitration & Mediation',
  'Motor Accident Claims',
  'Cyber Law',
]

// Option that lets the advocate type their own specialization
export const SPECIALIZATION_OTHER = 'Other'

// An advocate can hold several specializations. They are stored in the single existing
// `specialization` text field, separated by a semicolon, so older single values stay valid.
export const SPEC_DELIMITER = ';'
// Longest stored value (matches the VARCHAR(1000) column)
export const SPEC_MAX_LENGTH = 1000

// "Criminal Law; Taxation" -> ['Criminal Law', 'Taxation'] (blank and duplicate entries dropped)
export function parseSpecializations(value) {
  const seen = new Set()
  return String(value || '')
    .split(SPEC_DELIMITER)
    .map(s => s.trim())
    .filter(s => {
      const key = s.toLowerCase()
      if (!s || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

// ['Criminal Law', 'Taxation'] -> "Criminal Law; Taxation"
export function joinSpecializations(list) {
  return parseSpecializations((list || []).join(SPEC_DELIMITER)).join('; ')
}
