import { MISC_APPLICATION_CHOICES, MISC_DISPOSED, MISC_TYPE_MANUAL } from '../../constants/data'

export const APPLICATION_CHOICES = MISC_APPLICATION_CHOICES

export const MISC_HEARING_LABEL = 'Misc. Application'

const MISC_HEARING_LINE = /^\s*misc\.?\s*application\s*:\s*(.+?)\s*$/i

export function splitHearingNotes(notes) {
  const plain = []
  const applications = []
  String(notes || '').split('\n').forEach(line => {
    const match = line.match(MISC_HEARING_LINE)
    if (match) applications.push(match[1])
    else plain.push(line)
  })
  return { note: plain.join('\n').trim(), applications }
}

// A case hearing entry that only exists because of an application's date (older versions saved those into the case's
// history). Applications keep their own history now, so such entries are not case hearings
export function isMiscOnlyHearing(h) {
  const { note, applications } = splitHearingNotes(h?.notes)
  return applications.length > 0 && !note && !h?.orderDocId && !h?.outcome
}

export function joinHearingNotes(note, applications) {
  return [String(note || '').trim(), ...applications.map(name => `${MISC_HEARING_LABEL}: ${name}`)]
    .filter(Boolean)
    .join('\n')
}

// The application's name: the typed one when "type manually" is chosen, otherwise the chosen type
export function resolveApplicationType(choice, custom) {
  return choice === MISC_TYPE_MANUAL ? String(custom || '').trim() : String(choice || '').trim()
}

// Splits a saved application name into the dropdown choice and the typed text, so an application can be edited
export function splitApplicationType(type) {
  const name = String(type || '').trim()
  if (APPLICATION_CHOICES.includes(name) && name !== MISC_TYPE_MANUAL) return { choice: name, custom: '' }
  return { choice: MISC_TYPE_MANUAL, custom: name }
}

// CNR numbers are 16 letters and digits, written with or without spaces and dashes
export const isValidCnr = value => /^[A-Za-z0-9]{16}$/.test(String(value || '').replace(/[\s-]/g, ''))

export const isDisposed = app => app?.status === MISC_DISPOSED

// "Disposed Off - Allowed" for a disposed application, plain "Pending" otherwise
export const statusText = app => (isDisposed(app) && app.disposalOutcome ? `${app.status} - ${app.disposalOutcome}` : (app?.status || 'Pending'))

// Css-friendly suffix for a status ("Disposed Off" -> "disposed-off")
export const statusSlug = status => String(status || 'Pending').toLowerCase().replace(/[^a-z0-9]+/g, '-')

// Icon for a document row, by file extension
export function docIcon(name) {
  const ext = String(name || '').split('.').pop().toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (['doc', 'docx'].includes(ext)) return 'word'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'sheet'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image'
  return 'file'
}
