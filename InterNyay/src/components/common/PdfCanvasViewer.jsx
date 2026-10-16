import { useCallback, useEffect, useRef, useState } from 'react'
import { loadPdfjs } from '../../utils/pdfjsLoader'

const MIN_ZOOM = 1
const MAX_ZOOM = 3
const PAGE_GAP = 10
const SIDE_PAD = 8
const MAX_AUTO_FIT = 1100 // widest a page is drawn at full length on big screens

// Fallback width before ResizeObserver fires so pages never wait at 0px on mobile modals
function initialViewerWidth() {
  if (typeof window === 'undefined') return 320
  return Math.max(240, Math.min(window.innerWidth - 48, 860))
}

// One page: drawn when it is near the screen and cleared again when it is far away, so long PDFs stay light on a phone
// `withText` also lays an invisible, selectable text layer over the page, so Ctrl+F and copy work
function PdfPage({ pdf, number, width, ratio, root, onRatio, withText, keepAll }) {
  const canvasRef = useRef(null)
  const textRef = useRef(null)
  const boxRef = useRef(null)
  const [near, setNear] = useState(keepAll || number <= 2)

  useEffect(() => {
    const box = boxRef.current
    if (keepAll || !box || typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return undefined
    }
    const io = new IntersectionObserver(
      entries => entries.forEach(e => setNear(e.isIntersecting)),
      { root, rootMargin: '900px 0px' },
    )
    io.observe(box)
    return () => io.disconnect()
  }, [root, keepAll])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const textBox = textRef.current
    if (!near || !width) {
      // Free the memory of pages that are far from the screen
      canvas.width = 0
      canvas.height = 0
      if (textBox) textBox.replaceChildren()
      return undefined
    }
    let cancelled = false
    let pageObj = null
    let task = null
    let textLayer = null
    ;(async () => {
      try {
        pageObj = await pdf.getPage(number)
        if (cancelled) {
          pageObj.cleanup()
          return
        }
        const base = pageObj.getViewport({ scale: 1 })
        onRatio(number, base.height / base.width)
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const scale = (width / base.width) * dpr
        const viewport = pageObj.getViewport({ scale })
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        canvas.style.width = `${width}px`
        canvas.style.height = `${Math.floor((viewport.height / viewport.width) * width)}px`
        task = pageObj.render({ canvasContext: canvas.getContext('2d'), viewport })
        await task.promise
        if (withText && textBox && !cancelled) {
          // The text layer is sized in CSS pixels (no screen-density scaling), like the canvas box
          const cssViewport = pageObj.getViewport({ scale: width / base.width })
          const pdfjs = await loadPdfjs()
          if (cancelled) return
          textBox.replaceChildren()
          textBox.style.setProperty('--scale-factor', String(cssViewport.scale))
          textLayer = new pdfjs.TextLayer({
            textContentSource: pageObj.streamTextContent(),
            container: textBox,
            viewport: cssViewport,
          })
          await textLayer.render()
        }
      } catch (e) {
        if (e?.name !== 'RenderingCancelledException' && !cancelled) {
          console.warn('PDF page failed', number, e)
        }
      }
    })()
    return () => {
      cancelled = true
      if (task) {
        try { task.cancel() } catch { /* ignore */ }
      }
      if (textLayer) {
        try { textLayer.cancel() } catch { /* ignore */ }
      }
      if (pageObj) {
        try { pageObj.cleanup() } catch { /* ignore */ }
      }
      if (canvas) {
        canvas.width = 0
        canvas.height = 0
      }
    }
  }, [pdf, number, width, near, onRatio, withText])

  return (
    <div ref={boxRef} className="pdf-canvas__page" style={{ width, height: Math.round(width * ratio) }}>
      <canvas ref={canvasRef} />
      {withText && <div ref={textRef} className="textLayer" />}
    </div>
  )
}

// Shows a PDF as stacked canvases with fit-to-width and zoom buttons (pinch zoom also works)
// `autoHeight`: no inner scroll box; the pages are as tall as the document and the page itself scrolls
export default function PdfCanvasViewer({ data, className = '', onFail, autoHeight = false }) {
  const scrollRef = useRef(null)
  const [pdf, setPdf] = useState(null)
  const [status, setStatus] = useState('loading')
  const [zoom, setZoom] = useState(1)
  const [fitWidth, setFitWidth] = useState(initialViewerWidth)
  const [ratios, setRatios] = useState({})
  const [root, setRoot] = useState(null)

  // Remember each page's height so unrendered pages keep the right size
  const onRatio = useCallback((n, r) => {
    setRatios(prev => (Math.abs((prev[n] || 0) - r) < 0.001 ? prev : { ...prev, [n]: r }))
  }, [])

  // Open the document and clean up both the loading task and PDF document on close
  useEffect(() => {
    if (!data) return undefined
    let cancelled = false
    let loadingTask = null
    let doc = null
    setStatus('loading')
    setPdf(null)
    setRatios({})

    loadPdfjs()
      .then(pdfjs => {
        if (cancelled) return null
        const bytes = new Uint8Array(data.slice(0))
        loadingTask = pdfjs.getDocument({
          data: bytes,
          isEvalSupported: false,
          enableXfa: true,
        })
        return loadingTask.promise
      })
      .then(d => {
        if (!d) return
        doc = d
        if (cancelled) {
          d.destroy()
          return
        }
        setPdf(d)
        setStatus('ready')
      })
      .catch(e => {
        if (!cancelled) {
          console.warn('PDF could not be opened', e)
          setStatus('error')
          onFail?.(e)
        }
      })

    return () => {
      cancelled = true
      if (loadingTask) {
        try { loadingTask.destroy() } catch { /* ignore */ }
      }
      if (doc) {
        try { doc.destroy() } catch { /* ignore */ }
      }
    }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fit pages to the width of the viewer, and follow it when the phone turns
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return undefined
    // With no inner scroll box, pages are watched against the browser window instead
    setRoot(autoHeight ? null : el)
    const measure = () => {
      const w = el.clientWidth - SIDE_PAD * 2
      if (w > 0) setFitWidth(autoHeight ? Math.min(w, MAX_AUTO_FIT) : w)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [status, autoHeight])

  const width = Math.round(fitWidth * zoom)
  const first = ratios[1] || 1.414
  const pages = pdf ? Array.from({ length: pdf.numPages }, (_, i) => i + 1) : []
  // Selectable / searchable text. Drawn for every page that is drawn, which is all of them in a full-length view of a
  // normal-size document; a very long PDF only gets text on the pages near the screen
  const withText = !!pdf
  // A short document shown at full length keeps every page drawn, so Ctrl+F finds text on all of its pages
  const keepAll = autoHeight && !!pdf && pdf.numPages <= 12
  const bump = d => setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + d) * 100) / 100)))

  return (
    <div className={`pdf-canvas ${className}`}>
      <div className="pdf-canvas__scroll" ref={scrollRef}>
        {status === 'loading' && <p className="pdf-canvas__msg">Loading PDF…</p>}
        {status === 'error' && <p className="pdf-canvas__msg">This PDF could not be shown. Use Download to open it.</p>}
        {status === 'ready' && (
          <div className="pdf-canvas__pages" style={{ width: Math.max(width, 0) + SIDE_PAD * 2, gap: PAGE_GAP }}>
            {pages.map(n => (
              <PdfPage key={n} pdf={pdf} number={n} width={width} ratio={ratios[n] || first} root={root} onRatio={onRatio} withText={withText} keepAll={keepAll} />
            ))}
          </div>
        )}
      </div>
      {status === 'ready' && (
        <div className="pdf-canvas__zoom" role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" onClick={() => bump(-0.5)} disabled={zoom <= MIN_ZOOM}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="Zoom in" onClick={() => bump(0.5)} disabled={zoom >= MAX_ZOOM}>+</button>
        </div>
      )}
    </div>
  )
}
