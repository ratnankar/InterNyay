import { fillFormPath } from '../routes/paths'

// Pads a number to two digits (5 -> "05")
const pad = n => String(n).padStart(2, '0')

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DEFAULT_DATE_FORMAT = 'dd/mm/yyyy'

// Turns a date given as text (YYYY-MM-DD, with or without a time, or DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY) into { y, m, d }, or null
function parseDate(text) {
  const t = String(text ?? '').trim()
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/)
  if (m) return { y: +m[1], m: +m[2], d: +m[3] }
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (m) return { y: +m[3], m: +m[2], d: +m[1] }
  return null
}

// Writes a date in the layout the admin chose for the field (dd/mm/yyyy, dd MMM yyyy, ...)
function formatDate({ y, m, d }, format = DEFAULT_DATE_FORMAT) {
  const dd = pad(d), mm = pad(m)
  switch (format) {
    case 'dd-mm-yyyy': return `${dd}-${mm}-${y}`
    case 'dd.mm.yyyy': return `${dd}.${mm}.${y}`
    case 'dd MMM yyyy': return `${dd} ${MONTHS[m - 1].slice(0, 3)} ${y}`
    case 'dd MMMM yyyy': return `${dd} ${MONTHS[m - 1]} ${y}`
    case 'yyyy-mm-dd': return `${y}-${mm}-${dd}`
    case 'mm/dd/yyyy': return `${mm}/${dd}/${y}`
    default: return `${dd}/${mm}/${y}`
  }
}

// Today's date in the given layout
const todayText = (format) => {
  const d = new Date()
  return formatDate({ y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }, format)
}

// Field definitions of a form; the backend may send them as JSON text or as an array
export function getFormFields(form) {
  if (!form || !form.fieldConfig) return []
  if (Array.isArray(form.fieldConfig)) return form.fieldConfig
  try {
    const parsed = JSON.parse(form.fieldConfig)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    // Bad JSON in the form config - log it and treat the form as having no fields
    console.error('Invalid fieldConfig:', form.name, e)
    return []
  }
}

// All clients of a case joined with " & " for forms that need every party's name
function allClientNames(caseObj) {
  if (!caseObj) return ''
  return [caseObj.clientName, ...(caseObj.additionalClients || []).map(x => x?.name)]
    .filter(n => n && String(n).trim() !== '')
    .join(' & ')
}

// Pre-fills a form from the selected case: each field's autoFill says whether to use today's date, a case value or the client name
export function buildFillValues(form, caseObj) {
  const values = {}
  getFormFields(form).forEach(field => {
    // e.g. "today", "case.title" or "client.name"
    const source = field.autoFill
    if (!source) return
    if (source === 'today') { values[field.name] = todayText(field.type === 'date' ? field.dateFormat : undefined); return }
    const [kind, prop] = source.split('.')
    let v
    if (kind === 'case' && prop === 'clientName') v = allClientNames(caseObj)
    else if (kind === 'case') v = caseObj?.[prop]
    else if (kind === 'client' && prop === 'name') v = caseObj?.clientName
    if (v != null && String(v).trim() !== '') {
      let text = String(v)
      // Date fields are written in the layout chosen for the field; cases store dates as YYYY-MM-DD
      if (field.type === 'date') {
        const parsed = parseDate(text)
        if (parsed) text = formatDate(parsed, field.dateFormat)
      }
      values[field.name] = text
    }
  })
  return values
}

// URL that opens the form-fill screen in a new window for a given form (and optionally a case): /forms/fill/:formId?caseId=
export function fillWindowUrl(formId, caseId) {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')
  return `${window.location.origin}${base}${fillFormPath(formId, caseId)}`
}
