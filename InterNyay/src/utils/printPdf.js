import { canEmbedPdf } from './pdfSupport'

// Opens the print dialog for a PDF (or image) that is already loaded as a blob URL.
// The file is loaded into a hidden frame and printed from there. The blob URL is left alone: the viewer that owns it releases it.
// Phones and tablets cannot print from a hidden frame, so the file is opened in the device's own viewer, which has a print option.
export function printPdfUrl(url) {
  if (!url) return

  if (!canEmbedPdf()) {
    window.open(url, '_blank')
    return
  }

  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'

  // Remove the frame after printing (or after a while if the dialog never reports back)
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    frame.remove()
  }

  frame.onload = () => {
    try {
      const win = frame.contentWindow
      win.focus()
      win.addEventListener('afterprint', cleanup)
      win.print()
    } catch (e) {
      // The browser would not print from the hidden frame: open the file in a tab so it can be printed from there
      console.warn('Printing from the hidden frame failed', e)
      window.open(url, '_blank')
      cleanup()
      return
    }
    setTimeout(cleanup, 5 * 60 * 1000)
  }

  frame.src = url
  document.body.appendChild(frame)
}
