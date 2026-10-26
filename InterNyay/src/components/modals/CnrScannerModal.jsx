import { useCallback, useEffect, useRef, useState } from 'react'
import ModalPortal from '../common/ModalPortal'
import Icon from '../common/Icon'
import { extractCnr } from '../../utils/cnrScan'

// Camera frames are checked this often (ms); a QR does not need every frame
const SCAN_EVERY_MS = 150
// Pictures picked from the device are shrunk to this width before reading
const MAX_IMAGE_SIDE = 1600

// Reads a QR from an image source (video frame or picture). Uses the browser's own detector when it has one, jsQR otherwise
async function readQr(source, width, height, canvas, detector) {
  if (detector) {
    try {
      const found = await detector.detect(source)
      if (found.length) return found[0].rawValue
    } catch { /* fall through to jsQR */ }
  }
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(source, 0, 0, width, height)
  const { default: jsQR } = await import('jsqr')
  const hit = jsQR(ctx.getImageData(0, 0, width, height).data, width, height, { inversionAttempts: 'attemptBoth' })
  return hit ? hit.data : null
}

// Window that scans a QR code (camera, or a picture of it) and hands back the CNR number it holds
export default function CnrScannerModal({ onScan, onClose }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const fileRef = useRef(null)
  const streamRef = useRef(null)
  const doneRef = useRef(false)
  const [status, setStatus] = useState('starting') // starting | scanning | unavailable
  const [problem, setProblem] = useState('')

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  // A code was read: only a CNR is accepted, anything else keeps scanning
  const handleText = useCallback(text => {
    const cnr = extractCnr(text)
    if (!cnr) {
      setProblem('This QR code does not hold a CNR number. Try the QR printed on the case order or case status.')
      return false
    }
    if (doneRef.current) return true
    doneRef.current = true
    stopCamera()
    onScan(cnr)
    return true
  }, [onScan, stopCamera])

  // Camera: start it and read frames until a CNR is found
  useEffect(() => {
    let stopped = false
    let timer = 0
    let lastBad = ''

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unavailable')
        setProblem('The camera cannot be used here (it needs a secure https connection). Choose a picture of the QR instead.')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const video = videoRef.current
        video.srcObject = stream
        await video.play()
        setStatus('scanning')

        let detector = null
        try {
          if ('BarcodeDetector' in window) detector = new window.BarcodeDetector({ formats: ['qr_code'] })
        } catch { detector = null }

        const tick = async () => {
          if (stopped || doneRef.current) return
          if (video.readyState >= 2 && video.videoWidth) {
            try {
              const text = await readQr(video, video.videoWidth, video.videoHeight, canvasRef.current, detector)
              if (text && text !== lastBad) {
                if (handleText(text)) return
                lastBad = text
              }
            } catch { /* a bad frame is skipped */ }
          }
          timer = window.setTimeout(tick, SCAN_EVERY_MS)
        }
        tick()
      } catch (e) {
        if (stopped) return
        setStatus('unavailable')
        setProblem(e?.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow the camera for this site, or choose a picture of the QR instead.'
          : 'No camera could be started. Choose a picture of the QR instead.')
      }
    }
    start()

    return () => {
      stopped = true
      window.clearTimeout(timer)
      stopCamera()
    }
  }, [handleText, stopCamera])

  // Escape closes this window only
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // A picture of the QR picked from the device
  async function onPickImage(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setProblem('')
    try {
      const bitmap = await createImageBitmap(file)
      const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height))
      const w = Math.round(bitmap.width * scale)
      const h = Math.round(bitmap.height * scale)
      let detector = null
      try { if ('BarcodeDetector' in window) detector = new window.BarcodeDetector({ formats: ['qr_code'] }) } catch { detector = null }
      const text = await readQr(bitmap, w, h, canvasRef.current, detector)
      if (!text) { setProblem('No QR code was found in this picture. Use a sharper, closer picture.'); return }
      handleText(text)
    } catch {
      setProblem('This picture could not be read.')
    }
  }

  return (
    <ModalPortal>
      <div className="overlay">
        <div className="modal modal--sm qr-scan" onClick={e => e.stopPropagation()}>

          <div className="modal__header">
            <h2 className="modal__title">Scan case QR</h2>
            <button aria-label="Close" title="Close" type="button" className="btn-icon" onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>

          <div className={`qr-scan__view${status === 'scanning' ? ' is-live' : ''}`}>
            <video ref={videoRef} className="qr-scan__video" muted playsInline />
            {status === 'scanning' && <span className="qr-scan__frame" aria-hidden="true" />}
            {status === 'starting' && <p className="qr-scan__msg">Starting camera…</p>}
            {status === 'unavailable' && <p className="qr-scan__msg"><Icon name="camera" /> Camera not available</p>}
          </div>
          <canvas ref={canvasRef} hidden />

          {problem
            ? <p className="case-judge-hint case-judge-hint--none u-mt-10" role="alert">{problem}</p>
            : <p className="case-parties__hint u-mt-10">Point the camera at the QR code that carries the case's CNR number. The case is then fetched from eCourts.</p>}

          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />
          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={() => fileRef.current?.click()}>
              <Icon name="image" /> Choose picture
            </button>
            <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
