import { lazy, Suspense, useEffect, useState } from 'react'
import { canEmbedPdf } from '../../utils/pdfSupport'

const PdfCanvasViewer = lazy(() => import('./PdfCanvasViewer'))

// Shows a file from a blob URL where a PDF viewer would go.
// Desktop browsers: the browser's own viewer in an <iframe>. Phones and tablets cannot do that
// (they show a grey "PDF - Open" box), so PDFs are drawn page by page instead; images are shown as images.
// `hash` is an optional #zoom=... string for the desktop viewer only.
// `fullLength` shows the whole document at its natural height inside the page (no inner scroll box) on every device;
// the browser's own iframe viewer cannot size itself to its content, so the page-by-page viewer is used for it everywhere.
export default function PdfFrame({ url, title, className = '', hash = '', fullLength = false }) {
  const native = canEmbedPdf() && !fullLength
  if (fullLength) className = `${className} pdf-canvas--auto`.trim()
  const [kind, setKind] = useState(native ? 'frame' : 'checking') // frame | pdf | image | other | checking | error
  const [data, setData] = useState(null)

  useEffect(() => {
    if (native || !url) return undefined
    let cancelled = false
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    setKind('checking')
    setData(null)

    fetch(url, controller ? { signal: controller.signal } : undefined)
      .then(async r => {
        const contentType = (r.headers?.get('content-type') || '').toLowerCase()
        const buf = await r.arrayBuffer()
        return { buf, contentType }
      })
      .then(({ buf, contentType }) => {
        if (cancelled) return
        if (!buf || buf.byteLength === 0) {
          setKind('error')
          return
        }
        const head = new TextDecoder('latin1').decode(new Uint8Array(buf, 0, Math.min(4096, buf.byteLength)))
        if (head.includes('%PDF-') || contentType.includes('application/pdf')) {
          setData(buf)
          setKind('pdf')
        } else if (/^(\x89PNG|\xFF\xD8\xFF|GIF8|RIFF)/.test(head) || contentType.startsWith('image/')) {
          setKind('image')
        } else {
          setKind('other')
        }
      })
      .catch(() => {
        if (!cancelled) setKind('error')
      })

    return () => {
      cancelled = true
      controller?.abort()
      setData(null)
    }
  }, [url, native])

  if (native) return <iframe src={hash ? `${url}${hash}` : url} title={title} className={className} />

  if (kind === 'pdf') {
    return (
      <Suspense fallback={<div className={`pdf-canvas ${className}`}><p className="pdf-canvas__msg">Loading PDF…</p></div>}>
        <PdfCanvasViewer data={data} className={className} autoHeight={fullLength} onFail={() => setKind('error')} />
      </Suspense>
    )
  }
  if (kind === 'image') {
    return (
      <div className={`pdf-canvas ${className}`}>
        <div className="pdf-canvas__scroll">
          <img src={url} alt={title} className="pdf-canvas__img" />
        </div>
      </div>
    )
  }
  if (kind === 'checking') {
    return <div className={`pdf-canvas ${className}`}><p className="pdf-canvas__msg">Loading…</p></div>
  }
  return (
    <div className={`pdf-canvas ${className}`}>
      <p className="pdf-canvas__msg">
        This file cannot be previewed on this device.{' '}
        <a href={url} download={title || 'document.pdf'} style={{ textDecoration: 'underline' }}>Download it</a> to open it.
      </p>
    </div>
  )
}
