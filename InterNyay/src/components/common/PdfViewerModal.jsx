import { useEffect, useState } from 'react'
import useOverlayClose from '../../hooks/useOverlayClose'

import Icon from './Icon'
import ModalPortal from './ModalPortal'
import PdfFrame from './PdfFrame'
import { canEmbedPdf } from '../../utils/pdfSupport'
import { printPdfUrl } from '../../utils/printPdf'

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i

// Tells whether the file behind a viewer is a picture: the file name decides at once, otherwise the file's type is read
function useIsImage(url, name) {
  const byName = IMAGE_EXT.test(name || '')
  const [sniffed, setSniffed] = useState(false)

  useEffect(() => {
    setSniffed(false)
    if (!url || byName) return undefined
    let cancelled = false
    fetch(url)
      .then(r => { if (!cancelled && (r.headers.get('content-type') || '').toLowerCase().startsWith('image/')) setSniffed(true) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [url, byName])

  return byName || sniffed
}

// The app's one PDF viewer popup: every PDF in the app opens here, with Print, Download and Open in new tab.
// viewer is { url, title }. stacked shows it above other popups. fileName is the name used by Download.
export default function PdfViewerModal({ viewer, onClose, stacked = false, fileName }) {
  // Closes the viewer when the dark backdrop is clicked
  const overlayHandlers = useOverlayClose(onClose)

  const isImage = useIsImage(viewer?.url, fileName || viewer?.title)

  // Nothing to show while no PDF is open
  if (!viewer) return null

  return (
    <ModalPortal>
      <div className={`overlay${stacked ? ' overlay--stacked' : ''}`} {...overlayHandlers}>
        <div className={`modal modal--lg pdf-modal${isImage ? ' pdf-modal--image' : ''}`} onClick={e => e.stopPropagation()}>
          <div className="modal__header">
            <h2 className="modal__title" title={viewer.title}>{viewer.title}</h2>
            <div className="pdf-modal__actions">
              <button type="button"
                className="btn-outline btn-outline--sm"
                title="Print"
                onClick={() => printPdfUrl(viewer.url)}
              >
                <Icon name="print" /> Print
              </button>
              {canEmbedPdf() && (
                <button type="button"
                  className="btn-outline btn-outline--sm"
                  title="Open in a new tab"
                  onClick={() => window.open(viewer.url, '_blank', 'noopener,noreferrer')}
                >
                  <Icon name="copy" /> Open in new tab
                </button>
              )}
              <a
                className="btn-outline btn-outline--sm"
                href={viewer.url}
                download={fileName || `${viewer.title.slice(0, 60)}.pdf`}
              >
                <Icon name="download" /> Download
              </a>
              <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={onClose}><Icon name="close" /></button>
            </div>
          </div>
          {isImage
            ? <div className="pdf-modal__image-box"><img src={viewer.url} alt={viewer.title} className="pdf-modal__image" /></div>
            : <PdfFrame url={viewer.url} title={viewer.title} className="pdf-modal__frame" />}
        </div>
      </div>
    </ModalPortal>
  )
}
