import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import Icon from './Icon'
// Crop frame size (fw, fh) on screen and output image size (ow, oh) for each shape
const SHAPES = {
  circle:   { fw: 280, fh: 280, ow: 400, oh: 400, round: true  },
  square:   { fw: 280, fh: 280, ow: 400, oh: 400, round: false },
  portrait: { fw: 240, fh: 300, ow: 360, oh: 450, round: false },
}

// Highest zoom allowed
const MAX_ZOOM = 4

// Popup to move, zoom and crop a picked image
export default function ImageCropModal({
  file, shape = 'circle', title = 'Adjust photo', onCancel, onDone,
}) {
  // Settings for the requested shape, defaulting to circle
  const cfg = SHAPES[shape] || SHAPES.circle
  const { fw, fh } = cfg

  // Object URL of the chosen file, shown in the cropper
  const [src, setSrc]   = useState('')
  // Natural size of the loaded image
  const [nat, setNat]   = useState(null)
  // Current zoom level and drag offset from the centre
  const [zoom, setZoom] = useState(1)
  const [off, setOff]   = useState({ x: 0, y: 0 })
  const [error, setError] = useState('')

  // The image element, the crop frame and the drag start point
  const imgRef   = useRef(null)
  const frameRef = useRef(null)
  const drag     = useRef(null)
  // Copies of nat and zoom for the wheel handler, which can't see fresh state
  const natRef   = useRef(null)
  const zoomRef  = useRef(1)

  // Create a preview URL for the file and release it afterwards
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Escape cancels the crop
  useEffect(() => {
    // Escape cancels the crop
    function onKey(e) { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  // Scale at which the image just covers the frame
  const baseScale = n => Math.max(fw / n.w, fh / n.h)

  // Keep the image from being dragged so far that the frame shows empty space
  const clamp = useCallback((o, z, n) => {
    const s = Math.max(fw / n.w, fh / n.h) * z
    const mx = Math.max(0, (n.w * s - fw) / 2)
    const my = Math.max(0, (n.h * s - fh) / 2)
    return {
      x: Math.min(mx, Math.max(-mx, o.x)),
      y: Math.min(my, Math.max(-my, o.y)),
    }
  }, [fw, fh])

  // Set the zoom within limits and re-clamp the position
  const changeZoom = useCallback(next => {
    if (!natRef.current) return
    const z = Math.min(MAX_ZOOM, Math.max(1, next))
    zoomRef.current = z
    setZoom(z)
    setOff(o => clamp(o, z, natRef.current))
  }, [clamp])

  // Mouse wheel zooms; added manually so it can prevent the page from scrolling
  useEffect(() => {
    const el = frameRef.current
    if (!el || !nat) return undefined

    // Mouse wheel zooms the image
    function onWheel(e) {
      e.preventDefault()
      changeZoom(zoomRef.current - e.deltaY * 0.002)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [nat, changeZoom])

  // Record the image's natural size once it loads
  function onImageLoad(e) {
    const n = { w: e.target.naturalWidth, h: e.target.naturalHeight }
    natRef.current = n
    setNat(n)
  }

  // Start dragging the image
  function onPointerDown(e) {
    if (!nat) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, off }
  }

  // Move the image with the pointer while dragging
  function onPointerMove(e) {
    const d = drag.current
    if (!d || !nat) return
    setOff(clamp({ x: d.off.x + e.clientX - d.x, y: d.off.y + e.clientY - d.y }, zoom, nat))
  }

  // Stop dragging
  function endDrag() { drag.current = null }

  // Back to default zoom and centred position
  function reset() {
    zoomRef.current = 1
    setZoom(1)
    setOff({ x: 0, y: 0 })
  }

  // Draw the visible part onto a canvas at output size and pass it back as a JPEG data URL
  function save() {
    if (!nat || !imgRef.current) return

    // Size of the image as displayed inside the frame
    const scale = baseScale(nat) * zoom
    const ratio = cfg.ow / fw
    const dw = nat.w * scale * ratio
    const dh = nat.h * scale * ratio

    const canvas = document.createElement('canvas')
    canvas.width = cfg.ow
    canvas.height = cfg.oh

    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, cfg.ow, cfg.oh)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(
      imgRef.current,
      (fw / 2 + off.x) * ratio - dw / 2,
      (fh / 2 + off.y) * ratio - dh / 2,
      dw,
      dh,
    )

    onDone(canvas.toDataURL('image/jpeg', 0.9))
  }

  const scale = nat ? baseScale(nat) * zoom : 1
  const dispW = nat ? nat.w * scale : 0
  const dispH = nat ? nat.h * scale : 0

  return createPortal(
    <div className="crop-overlay">
      <div className="crop-modal" role="dialog" aria-modal="true" aria-label={title}>

        <div className="modal__header">
          <h2 className="modal__title">{title}</h2>
          <button type="button" className="btn-icon" onClick={onCancel} aria-label="Cancel"><Icon name="close" /></button>
        </div>

        <p className="crop-hint">Drag the photo to position it · use the slider to zoom</p>

        <div
          ref={frameRef}
          className="crop-frame"
          style={{ width: fw, height: fh }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {src && (
            <img
              ref={imgRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={onImageLoad}
              onError={() => setError('Could not read that image')}
              className="crop-frame__img"
              style={nat ? {
                width: dispW,
                height: dispH,
                left: fw / 2 - dispW / 2 + off.x,
                top: fh / 2 - dispH / 2 + off.y,
              } : { visibility: 'hidden' }}
            />
          )}
          <div className={`crop-mask${cfg.round ? ' crop-mask--round' : ''}`} />
        </div>

        {error && <p className="crop-error">{error}</p>}

        <div className="crop-zoom">
          <button type="button" className="btn-outline btn-outline--sm"
            onClick={() => changeZoom(zoom - 0.25)} disabled={!nat || zoom <= 1}>−</button>
          <input
            type="range"
            min="1"
            max={MAX_ZOOM}
            step="0.01"
            value={zoom}
            disabled={!nat}
            onChange={e => changeZoom(Number(e.target.value))}
            aria-label="Zoom"
          />
          <button type="button" className="btn-outline btn-outline--sm"
            onClick={() => changeZoom(zoom + 0.25)} disabled={!nat || zoom >= MAX_ZOOM}>+</button>
        </div>

        <div className="crop-actions">
          <button type="button" className="btn-outline btn-outline--sm" onClick={reset} disabled={!nat}>
            Reset
          </button>
          <span className="crop-actions__spacer" />
          <button type="button" className="btn-outline" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-gold" onClick={save} disabled={!nat}>Save photo</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
