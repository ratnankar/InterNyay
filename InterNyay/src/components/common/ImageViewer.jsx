import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import useOverlayClose from '../../hooks/useOverlayClose'
import Icon from './Icon'

// Full-window photo viewer: the photo is fitted to the whole window (small photos are enlarged, big ones shrunk, proportions kept).
// Closes on a click outside the photo, the Close button or Escape
export default function ImageViewer({ src, alt, caption, onClose }) {
  const overlayHandlers = useOverlayClose(onClose)

  // Escape closes only the viewer, not the window underneath it
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  if (!src) return null

  // The photo box fills the window and the picture is fitted inside it, so a click on the empty space beside the picture
  // lands on the box: close when the click is outside the picture itself
  function onPhotoClick(e) {
    const img = e.currentTarget
    const { naturalWidth: nw, naturalHeight: nh } = img
    if (!nw || !nh) return
    const box = img.getBoundingClientRect()
    const fit = Math.min(box.width / nw, box.height / nh)
    const w = nw * fit
    const h = nh * fit
    const left = box.left + (box.width - w) / 2
    const top = box.top + (box.height - h) / 2
    const inside = e.clientX >= left && e.clientX <= left + w && e.clientY >= top && e.clientY <= top + h
    if (!inside) onClose()
  }

  // Rendered on document.body so it sits above any open modal
  return createPortal(
    <div className="image-viewer" role="dialog" aria-modal="true" aria-label={alt || 'Photo'} {...overlayHandlers}>
      <button
        type="button"
        aria-label="Close"
        title="Close"
        className="image-viewer__close"
        onClick={onClose}
      >
        <Icon name="close" />
      </button>
      <figure className="image-viewer__figure">
        <img className="image-viewer__img" src={src} alt={alt || 'Photo'} onClick={onPhotoClick} />
        {caption && <figcaption className="image-viewer__caption">{caption}</figcaption>}
      </figure>
    </div>,
    document.body
  )
}
