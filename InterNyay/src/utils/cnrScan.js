// Reads a CNR number out of the text a QR code carries.
// eCourts prints the CNR as 4 letters + 12 digits (e.g. DLST040020122023); the QR may hold just that, or a link/text containing it
export function extractCnr(text) {
  const raw = String(text || '').toUpperCase()
  const compact = raw.replace(/[\s-]/g, '')
  // The whole code is the CNR
  if (/^[A-Z]{4}\d{12}$/.test(compact)) return compact
  // The CNR sits inside a link or a longer text (cnr=DLST…, "CNR: DLST-04-002012-2023")
  const inText = raw.match(/\b([A-Z]{4})[\s-]?(\d{2})[\s-]?(\d{6})[\s-]?(\d{4})\b/)
  if (inText) return inText.slice(1).join('')
  const plain = raw.match(/[A-Z]{4}\d{12}/)
  return plain ? plain[0] : null
}
