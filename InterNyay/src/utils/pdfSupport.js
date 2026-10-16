// Whether this browser can show a PDF inside an <iframe>.
// Desktop browsers can. Android Chrome (phones and tablets) and iPhone/iPad browsers cannot: they show a grey
// "PDF - Open" placeholder or only the first page, so the app draws the pages itself (see PdfFrame).
export function canEmbedPdf() {
  if (typeof navigator === 'undefined') return true
  // Chrome, Edge, Firefox and desktop Safari report this; Android Chrome reports false
  if (navigator.pdfViewerEnabled === false) return false
  // Client Hints: detects Android / mobile even when "Desktop site" is turned on in the phone browser
  if (navigator.userAgentData?.mobile === true) return false
  if (/^(Android|iOS)$/i.test(navigator.userAgentData?.platform || '')) return false
  const ua = navigator.userAgent || ''
  if (/Android|iPhone|iPad|iPod|Mobile|CriOS|FxiOS|EdgiOS/i.test(ua)) return false
  // iPadOS Safari pretends to be a Mac but has a touch screen
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return false
  // Touch-first devices (phones/tablets requesting desktop site)
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) return false
  }
  return true
}
