import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { loadPdfjs } from '../../utils/pdfjsLoader'

const MIN_ZOOM = 1
const MAX_ZOOM = 3
const PAGE_GAP = 10
const SIDE_PAD = 8

// pdf.js asks a link service for a few things when it draws links inside a form; links just open in a new tab here
const linkService = {
  externalLinkEnabled: true,
  eventBus: { dispatch() {}, on() {}, off() {} },
  page: 1,
  rotation: 0,
  addLinkAttributes(link, url) { link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer' },
  getDestinationHash() { return '#' },
  getAnchorUrl() { return '#' },
  goToDestination() {},
  goToPage() {},
  executeNamedAction() {},
  executeSetOCGState() {},
  isPageVisible() { return true },
  isPageCached() { return true },
}

// Puts the typed digits into a date layout such as dd/mm/yyyy ("1203" becomes "12/03")
function applyDateFormat(digits, format) {
  let out = ''
  let used = 0
  for (const ch of format) {
    if (used >= digits.length) break
    if (/[a-z]/i.test(ch)) out += digits[used++]
    else out += ch
  }
  return out
}

// One page of the form: the picture of the page with the typing boxes laid over it
function FormPage({ pdf, lib, number, width }) {
  const canvasRef = useRef(null)
  const layerRef = useRef(null)
  const [height, setHeight] = useState(Math.round(width * 1.414))

  useEffect(() => {
    const canvas = canvasRef.current
    const layerDiv = layerRef.current
    if (!canvas || !layerDiv || !width) return undefined
    let cancelled = false
    let task = null
    ;(async () => {
      try {
        const page = await pdf.getPage(number)
        if (cancelled) return
        const base = page.getViewport({ scale: 1 })
        const scale = width / base.width
        const viewport = page.getViewport({ scale })
        setHeight(Math.floor(viewport.height))

        // Sharper picture on high density screens
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const sharp = page.getViewport({ scale: scale * dpr })
        canvas.width = Math.floor(sharp.width)
        canvas.height = Math.floor(sharp.height)
        canvas.style.width = `${width}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`
        task = page.render({ canvasContext: canvas.getContext('2d'), viewport: sharp })
        await task.promise
        if (cancelled) return

        // The typing boxes (they keep what was typed in the document's annotation storage)
        const annotations = await page.getAnnotations({ intent: 'display' })
        if (cancelled) return
        layerDiv.replaceChildren()
        layerDiv.style.setProperty('--scale-factor', String(scale))
        layerDiv.style.setProperty('--total-scale-factor', String(scale))
        const layer = new lib.AnnotationLayer({
          div: layerDiv,
          page,
          viewport: viewport.clone({ dontFlip: true }),
          accessibilityManager: null,
          annotationCanvasMap: null,
          annotationEditorUIManager: null,
          structTreeLayer: null,
        })
        await layer.render({
          annotations,
          imageResourcesPath: '',
          renderForms: true,
          linkService,
          downloadManager: null,
          annotationStorage: pdf.annotationStorage,
          enableScripting: false,
          hasJSActions: false,
          fieldObjects: null,
        })
      } catch (e) {
        if (e?.name !== 'RenderingCancelledException' && !cancelled) console.warn('Form page failed', number, e)
      }
    })()
    return () => {
      cancelled = true
      if (task) { try { task.cancel() } catch { /* ignore */ } }
    }
  }, [pdf, lib, number, width])

  return (
    <div className="pdf-form__page" style={{ width, height }}>
      <canvas ref={canvasRef} />
      <div ref={layerRef} className="annotationLayer pdf-form__layer" />
    </div>
  )
}

// A fillable PDF form: the pages are drawn with their boxes so values can be typed straight in.
// url: blob URL of the PDF. dateFormats: { fieldName: 'dd/mm/yyyy' } so the separators appear while typing.
// The parent can call ref.getBytes() to get the PDF with everything typed into it.
const PdfFormViewer = forwardRef(function PdfFormViewer({ url, dateFormats, title, className = '' }, ref) {
  const scrollRef = useRef(null)
  const pdfRef = useRef(null)
  const typing = useRef(false)
  const [pdf, setPdf] = useState(null)
  const [lib, setLib] = useState(null)
  const [status, setStatus] = useState('loading')
  const [zoom, setZoom] = useState(1)
  const [fitWidth, setFitWidth] = useState(() => Math.max(240, Math.min((typeof window === 'undefined' ? 800 : window.innerWidth) - 48, 860)))

  useImperativeHandle(ref, () => ({
    // The PDF as bytes, with the typed values saved into it
    getBytes: async () => (pdfRef.current ? pdfRef.current.saveDocument() : null),
  }), [])

  // Open the PDF behind the blob URL
  useEffect(() => {
    if (!url) return undefined
    let cancelled = false
    let task = null
    let doc = null
    setStatus('loading')
    setPdf(null)
    pdfRef.current = null
    ;(async () => {
      try {
        const [pdfjs, buf] = await Promise.all([
          loadPdfjs(),
          fetch(url).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer() }),
          import('pdfjs-dist/web/pdf_viewer.css').catch(() => null),
        ])
        if (cancelled) return
        task = pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, enableXfa: false })
        doc = await task.promise
        if (cancelled) { doc.destroy(); return }
        pdfRef.current = doc
        setLib(pdfjs)
        setPdf(doc)
        setStatus('ready')
      } catch (e) {
        if (!cancelled) {
          console.warn('The form could not be opened', e)
          setStatus('error')
        }
      }
    })()
    return () => {
      cancelled = true
      pdfRef.current = null
      if (task) { try { task.destroy() } catch { /* ignore */ } }
      if (doc) { try { doc.destroy() } catch { /* ignore */ } }
    }
  }, [url])

  // Fit the pages to the width of the window, and follow it when the window changes
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return undefined
    const measure = () => {
      const w = el.clientWidth - SIDE_PAD * 2
      if (w > 0) setFitWidth(w)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [status])

  // Date boxes get their separators while typing: 12032025 becomes 12/03/2025
  const onInput = useCallback(e => {
    const t = e.target
    if (typing.current || !(t instanceof HTMLInputElement)) return
    const format = dateFormats?.[t.name]
    if (!format) return
    const next = applyDateFormat(t.value.replace(/\D/g, ''), format)
    if (next === t.value) return
    t.value = next
    // Tell pdf.js about the new text so it is saved with the form
    typing.current = true
    t.dispatchEvent(new Event('input', { bubbles: true }))
    typing.current = false
  }, [dateFormats])

  const width = Math.round(fitWidth * zoom)
  const pages = pdf ? Array.from({ length: pdf.numPages }, (_, i) => i + 1) : []
  const bump = d => setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + d) * 100) / 100)))

  return (
    <div className={`pdf-form ${className}`} aria-label={title}>
      <div className="pdf-form__scroll" ref={scrollRef} onInput={onInput}>
        {status === 'loading' && <p className="pdf-canvas__msg">Loading PDF…</p>}
        {status === 'error' && <p className="pdf-canvas__msg">This form could not be shown. Close the window and try again.</p>}
        {status === 'ready' && (
          <div className="pdf-form__pages" style={{ gap: PAGE_GAP, padding: SIDE_PAD }}>
            {pages.map(n => <FormPage key={n} pdf={pdf} lib={lib} number={n} width={width} />)}
          </div>
        )}
      </div>
      {status === 'ready' && (
        <div className="pdf-form__bar" role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" onClick={() => bump(-0.5)} disabled={zoom <= MIN_ZOOM}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="Zoom in" onClick={() => bump(0.5)} disabled={zoom >= MAX_ZOOM}>+</button>
        </div>
      )}
    </div>
  )
})

export default PdfFormViewer
