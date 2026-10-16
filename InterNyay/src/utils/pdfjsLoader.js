// Loads pdf.js only when a PDF is actually drawn by the app, so it is not part of the main bundle.
// Uses a Vite-bundled worker instance so mobile browsers and static hosts never fail on .mjs MIME types or 404 redirects.
let pdfjsPromise
let sharedWorker

export function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker&inline')
        .catch(() => import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')),
    ])
      .then(([pdfjs, workerMod]) => {
        const exported = workerMod?.default
        if (typeof exported === 'function') {
          try {
            if (!sharedWorker) sharedWorker = new exported()
            pdfjs.GlobalWorkerOptions.workerPort = sharedWorker
          } catch {
            // Older mobile browsers that cannot construct the inline worker fall back cleanly
          }
        } else if (typeof exported === 'string') {
          pdfjs.GlobalWorkerOptions.workerSrc = exported
        }
        return pdfjs
      })
      .catch(e => {
        if (sharedWorker) {
          try { sharedWorker.terminate() } catch { /* ignore */ }
          sharedWorker = undefined
        }
        pdfjsPromise = undefined
        throw e
      })
  }
  return pdfjsPromise
}
