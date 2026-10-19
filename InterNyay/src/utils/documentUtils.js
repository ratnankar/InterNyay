import { formatDisplayDate } from './dateUtils'

// Orders are documents of type "order"
export function isOrderDocument(doc) {
  return String(doc?.type || doc?.docType || '').trim().toLowerCase() === 'order'
}

// Date of an order (yyyy-MM-dd): the saved order date, or the date in a default name like "Order — 2026-08-14"
function orderDateOf(doc) {
  const saved = String(doc?.orderDate || '').slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(saved)) return saved

  const fromName = String(doc?.name || '').match(/^Order\s*[—–-]\s*(\d{4}-\d{2}-\d{2})$/)
  return fromName ? fromName[1] : ''
}

// Title shown for a document: "Order - 14 Aug 2026" for orders, otherwise the name it was saved with (the file name or
// what the advocate renamed it to). Documents saved without a name fall back to their type
export function documentTitle(doc) {
  if (!doc) return 'Document'

  if (isOrderDocument(doc)) {
    const date = orderDateOf(doc)
    return date ? `Order - ${formatDisplayDate(date)}` : 'Order'
  }

  const name = String(doc.name || '').trim()
  if (name) return name

  const type = String(doc.type || doc.docType || '').trim()

  return type && type.toLowerCase() !== 'other' ? type : 'Document'
}

// The type chosen for a document ("Petition", "Vakalatnama"...), shown beside the size and date. Empty for "Other",
// orders and evidence, which say it already
export function documentTypeLabel(doc) {
  if (!doc || isOrderDocument(doc) || isEvidenceDocument(doc)) return ''
  if (isMiscDocument(doc)) return MISC_ROLE_LABEL[doc.miscRole] || 'Misc. Application'
  const type = String(doc.type || doc.docType || '').trim()
  return type && type.toLowerCase() !== 'other' ? type : ''
}

// File name offered on download: the document's name, with the extension of the uploaded file added when the name has none
export function downloadNameOf(doc) {
  const original = String(doc?.fileName || '').trim()
  const name = String(doc?.name || '').trim().replace(/[\\/:*?"<>|]/g, '_')
  if (!name) return original || 'document'

  const dot = original.lastIndexOf('.')
  const ext = dot > 0 && dot < original.length - 1 ? original.slice(dot) : ''
  return ext && !name.toLowerCase().endsWith(ext.toLowerCase()) ? `${name}${ext}` : name
}

// Evidence files are stored as documents whose type starts with this prefix, followed by the owner (Client / Case)
const EVIDENCE_PREFIX = 'Evidence - '

// True if the document is an evidence file
export function isEvidenceDocument(doc) {
  return String(doc?.type || doc?.docType || '').startsWith(EVIDENCE_PREFIX)
}

// Returns who the evidence belongs to (the text after the prefix)
export function evidenceOwnerOf(doc) {
  if (!isEvidenceDocument(doc)) return ''
  return String(doc.type || doc.docType || '').slice(EVIDENCE_PREFIX.length)
}

// Evidence name, or a default if none was given
export function evidenceTitle(doc) {
  if (!doc) return 'Evidence'
  return doc.name && String(doc.name).trim() ? doc.name : 'Evidence'
}

// ---------- Misc. application documents ----------

// A document filed under a misc. application (its application, order or an additional document) of a case
export function isMiscDocument(doc) {
  return doc?.miscApplicationId != null
}

const MISC_ROLE_LABEL = { APPLICATION: 'Application', ORDER: 'Order', ADDITIONAL: 'Additional document' }
const MISC_ROLE_RANK = { APPLICATION: 0, ORDER: 1, ADDITIONAL: 2 }

// The misc. application documents grouped by application: [{ id, name, docs }], the application file first, then its
// order, then the additional documents
export function groupMiscDocuments(docs) {
  const groups = new Map()
  ;(docs || []).filter(isMiscDocument).forEach(d => {
    if (!groups.has(d.miscApplicationId)) {
      groups.set(d.miscApplicationId, { id: d.miscApplicationId, name: d.miscApplicationName || 'Misc. Application', docs: [] })
    }
    groups.get(d.miscApplicationId).docs.push(d)
  })
  return [...groups.values()].map(g => ({
    ...g,
    docs: [...g.docs].sort((a, b) => (MISC_ROLE_RANK[a.miscRole] ?? 3) - (MISC_ROLE_RANK[b.miscRole] ?? 3)),
  }))
}
