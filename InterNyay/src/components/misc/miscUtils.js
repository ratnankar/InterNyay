import { DOCUMENT_TYPES, MISC_DISPOSED, MISC_TYPE_MANUAL } from '../../constants/data'

// Applications the advocate can pick from: the same list as the document types of a case, with the "type it yourself" choice last
export const APPLICATION_CHOICES = DOCUMENT_TYPES

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

// Css-friendly suffix for a status ("Disposed Off" -> "disposed-off")
export const statusSlug = status => String(status || 'Pending').toLowerCase().replace(/[^a-z0-9]+/g, '-')

// Short name for a file, used when the advocate has not typed one
export function fileLabel(file, fallback) {
  return String(file?.name || '').trim() || fallback
}

// Icon for a document row, by file extension
export function docIcon(name) {
  const ext = String(name || '').split('.').pop().toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (['doc', 'docx'].includes(ext)) return 'word'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'sheet'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image'
  return 'file'
}
