import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '../../services/api'

import Icon from '../common/Icon'
import Dropdown from '../common/Dropdown'
import { getErrorMessage } from '../../utils/errorMessages'
import { confirmDialog } from '../../utils/confirmDialog'
import ModalPortal from '../common/ModalPortal'

// Values a field can be filled with automatically from the case
const AUTOFILL_OPTIONS = [
  ['', '— none —'],
  ['today', "Today's date"],
  ['case.caseNo', 'Case no.'],
  ['case.firNo', 'FIR no.'],
  ['case.firSection', 'FIR section (U/S)'],
  ['case.policeStation', 'Police station'],
  ['case.clientName', 'Client name'],
  ['case.title', 'Case title (A v/s B)'],
  ['case.court', 'Court'],
  ['case.district', 'District'],
  ['case.judgeName', 'Judge name'],
  ['case.opposingParty', 'Opponent name'],
]

// Auto-fill choices for date fields: only dates, so nothing has to be typed
const DATE_AUTOFILL_OPTIONS = [
  ['', '— none —'],
  ['today', "Today's date"],
  ['case.filingDate', 'Filing date'],
  ['case.nextHearing', 'Next hearing date'],
  ['case.chequeDate', 'Cheque date'],
  ['case.memoDate', 'Memo date'],
  ['case.noticeDate', 'Notice date'],
]

// Layouts a date can be written in (shown with a sample for 5 March 2026)
const DATE_FORMATS = [
  ['dd/mm/yyyy', '05/03/2026  (dd/mm/yyyy)'],
  ['dd-mm-yyyy', '05-03-2026  (dd-mm-yyyy)'],
  ['dd.mm.yyyy', '05.03.2026  (dd.mm.yyyy)'],
  ['dd MMM yyyy', '05 Mar 2026  (dd MMM yyyy)'],
  ['dd MMMM yyyy', '05 March 2026  (dd MMMM yyyy)'],
  ['yyyy-mm-dd', '2026-03-05  (yyyy-mm-dd)'],
  ['mm/dd/yyyy', '03/05/2026  (mm/dd/yyyy)'],
]

// Smallest width and height of a box, as a fraction of the page
const MIN_W = 0.012
const MIN_H = 0.006
// Keeps a value between a minimum and a maximum
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
// Counter that gives each box a temporary id while editing
let uid = 1
// Fills in defaults for a field and gives it a temporary id
const withId = (s) => ({
  ...s,
  fontFamily: s.fontFamily || 'helvetica',
  italic: !!s.italic,
  autoFill: (s.autoFill || '').startsWith('client.') ? '' : (s.autoFill || ''),
  _id: uid++,
})

// Fonts a field can use, and the matching CSS font stacks for the preview
const FONT_FAMILIES = [['helvetica', 'Helvetica (sans-serif)'], ['times', 'Times (serif)'], ['courier', 'Courier (typewriter)']]
// CSS font-family stack for a font choice
const cssFamily = f => f === 'times' ? '"Times New Roman", Times, serif'
                     : f === 'courier' ? '"Courier New", Courier, monospace'
                     : 'Helvetica, Arial, sans-serif'

// Full screen editor for marking the fill-in fields on a legal form PDF, by drawing boxes on each page
export default function PdfFieldEditor({ form, onClose, onSaved, addToast }) {
  // Page sizes, page images and the field boxes (specs) on the form
  const [pages, setPages]       = useState([])
  const [images, setImages]     = useState([])
  const [specs, setSpecs]       = useState([])
  // Page being shown and the box currently selected
  const [page, setPage]         = useState(0)
  const [selected, setSelected] = useState(null)
  // Type of field the next drawn box will become
  const [drawType, setDrawType] = useState('text')
  // Loading, saving and unsaved-changes flags
  const [busy, setBusy]         = useState(true)
  const [saving, setSaving]     = useState(false)
  const [dirty, setDirty]       = useState(false)
  // Width the page is shown at, and the boxes the automatic detection suggested
  const [dispW, setDispW]       = useState(800)
  const [candidates, setCandidates] = useState([])

  // Refs to the page area and to the drag in progress, and the box being drawn right now
  const stageRef = useRef(null)
  const dragRef  = useRef(null)
  const [draft, setDraft] = useState(null)

  // Loads the page sizes, the saved boxes and the page images, then the automatic detection suggestions, and frees the image urls on close
  useEffect(() => {
    let dead = false
    const urls = []
    ;(async () => {
      try {
        const [infos, list] = await Promise.all([
          api.legalForms.pages(form.id),
          api.legalForms.fieldSpecs(form.id, false),
        ])
        if (dead) return
        setPages(infos)
        setSpecs(list.map(withId))
        const imgs = []
        for (let i = 0; i < infos.length; i++) {
          const u = await api.legalForms.pageImage(form.id, i)
          urls.push(u); imgs.push(u)
        }
        if (!dead) setImages(imgs)
        try {
          const det = await api.legalForms.fieldSpecs(form.id, true)
          if (!dead) setCandidates(det.map(withId))
        } catch { }
      } catch (e) {
        addToast?.(getErrorMessage(e, 'Could not open the form'), 'error')
        onClose()
      } finally {
        if (!dead) setBusy(false)
      }
    })()
    return () => { dead = true; urls.forEach(u => URL.revokeObjectURL(u)) }
  }, [form.id])

  // Reads the pixels of the current page so a click can detect the blank area around it
  useEffect(() => {
    const url = images[page]
    if (!url || pixRef.current[page]) return
    const img = new Image()
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth; c.height = img.naturalHeight
        const ctx = c.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0)
        pixRef.current[page] = { data: ctx.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height }
      } catch { }
    }
    img.src = url
  }, [images, page])

  // Keeps the page width up to date when the editor is resized
  useEffect(() => {
    const el = stageRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setDispW(el.clientWidth || 800))
    ro.observe(el)
    return () => ro.disconnect()
  }, [images, page])

  // Size of the current page and the scale between page units and screen pixels
  const pageInfo = pages[page]
  const scale = pageInfo ? dispW / pageInfo.width : 1

  // Boxes on the current page and the selected box
  const onPage = useMemo(
    () => specs.map((s, i) => ({ s, i })).filter(x => x.s.page === page),
    [specs, page]
  )
  const sel = specs.find(s => s._id === selected) || null

  // Detected suggestions on this page that do not already overlap a box
  const freeCandidates = useMemo(() => {
    const mine = specs.filter(s => s.page === page)
    return candidates.filter(c => {
      if (c.page !== page) return false
      const area = c.w * c.h
      if (area <= 0) return false
      return !mine.some(s => {
        const iw = Math.min(c.x + c.w, s.x + s.w) - Math.max(c.x, s.x)
        const ih = Math.min(c.y + c.h, s.y + s.h) - Math.max(c.y, s.y)
        return iw > 0 && ih > 0 && (iw * ih) / area > 0.4
      })
    })
  }, [candidates, specs, page])
  // Cached page pixels and the latest suggestions for use inside event handlers
  const pixRef = useRef({})
  const freeRef = useRef([])
  freeRef.current = freeCandidates

  // Changes one box and marks the form as having unsaved changes
  const patch = useCallback((id, changes) => {
    setSpecs(list => list.map(s => (s._id === id ? { ...s, ...changes } : s)))
    setDirty(true)
  }, [])

  // Converts a mouse position to a fraction of the page width and height
  function frac(e) {
    const r = stageRef.current.getBoundingClientRect()
    return { fx: clamp((e.clientX - r.left) / r.width, 0, 1), fy: clamp((e.clientY - r.top) / r.height, 0, 1) }
  }

  // Finds the blank rectangle around a clicked point by growing outwards until it meets dark pixels
  function detectRegion(pg, fx, fy) {
    const px = pixRef.current[pg]
    if (!px) return null
    const { data, w, h } = px
    // True when the pixel is dark enough to count as ink (grey value below 170)
    const dark = (x, y) => {
      const i = (y * w + x) * 4
      return data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11 < 170
    }
    let cx = clamp(Math.round(fx * w), 0, w - 1)
    let cy = clamp(Math.round(fy * h), 0, h - 1)
    if (dark(cx, cy)) {
      let found = false
      for (let r = 1; r <= 4 && !found; r++) {
        for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
          const x = cx + dx, y = cy + dy
          if (x >= 0 && y >= 0 && x < w && y < h && !dark(x, y)) { cx = x; cy = y; found = true; break }
        }
      }
      if (!found) return null
    }
    // True when no dark pixel lies on this column or row between the two limits
    const colClear = (x, y0, y1) => { for (let y = y0; y <= y1; y++) if (dark(x, y)) return false; return true }
    const rowClear = (y, x0, x1) => { for (let x = x0; x <= x1; x++) if (dark(x, y)) return false; return true }

    const y0 = clamp(cy - 2, 0, h - 1), y1 = clamp(cy + 2, 0, h - 1)
    let left = cx, right = cx
    while (left > 0 && colClear(left - 1, y0, y1)) left--
    while (right < w - 1 && colClear(right + 1, y0, y1)) right++
    if (right - left > w * 0.85) return null

    let top = y0, bottom = y1
    const maxH = Math.round(h * 0.4)
    while (top > 0 && bottom - top < maxH && rowClear(top - 1, left, right)) top--
    while (bottom < h - 1 && bottom - top < maxH && rowClear(bottom + 1, left, right)) bottom++

    const inset = 2
    let x = left + inset, wd = right - left + 1 - inset * 2
    let y = top + inset, ht = bottom - top + 1 - inset * 2
    if (wd < w * 0.02) return null
    const minH = Math.round(h * 0.014)
    if (ht < minH) { y = clamp(cy - Math.round(minH / 2), 0, h - minH); ht = minH }
    return { x: x / w, y: y / h, w: wd / w, h: ht / h }
  }

  // Mouse down on the empty page starts drawing a new box
  function startDraw(e) {
    if (e.target !== e.currentTarget) return
    e.preventDefault()
    const { fx, fy } = frac(e)
    dragRef.current = { mode: 'draw', fx0: fx, fy0: fy, wasSelected: selected != null }
    setDraft({ x: fx, y: fy, w: 0, h: 0 })
    setSelected(null)
    attach()
  }

  // Mouse down on a box starts moving it
  function startMove(e, s) {
    e.preventDefault(); e.stopPropagation()
    const { fx, fy } = frac(e)
    setSelected(s._id)
    dragRef.current = { mode: 'move', id: s._id, dx: fx - s.x, dy: fy - s.y }
    attach()
  }

  // Mouse down on the box corner starts resizing it
  function startResize(e, s) {
    e.preventDefault(); e.stopPropagation()
    setSelected(s._id)
    dragRef.current = { mode: 'resize', id: s._id }
    attach()
  }

  // Listens for pointer movement until the button is released
  function attach() {
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Updates the box being drawn, moved or resized while the pointer moves
  function onMove(e) {
    const d = dragRef.current
    if (!d || !stageRef.current) return
    const { fx, fy } = frac(e)
    if (d.mode === 'draw') {
      d.rect = { x: Math.min(fx, d.fx0), y: Math.min(fy, d.fy0), w: Math.abs(fx - d.fx0), h: Math.abs(fy - d.fy0) }
      setDraft(d.rect)
    } else if (d.mode === 'move') {
      setSpecs(list => list.map(s => s._id !== d.id ? s : {
        ...s, x: clamp(fx - d.dx, 0, 1 - s.w), y: clamp(fy - d.dy, 0, 1 - s.h),
      }))
      setDirty(true)
    } else if (d.mode === 'resize') {
      setSpecs(list => list.map(s => s._id !== d.id ? s : {
        ...s, w: clamp(fx - s.x, MIN_W, 1 - s.x), h: clamp(fy - s.y, MIN_H, 1 - s.y),
      }))
      setDirty(true)
    }
  }

  // Ends the drag. A small drag is a click, which adds the detected suggestion under it, and a larger one adds the drawn box
  function onUp() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    const d = dragRef.current
    dragRef.current = null
    if (d?.mode === 'draw') {
      const cur = d.rect
      setDraft(null)
      if (!cur || (cur.w < MIN_W && cur.h < MIN_H)) {
        if (d.wasSelected) return
        const tol = 0.004
        const hit = freeRef.current
          .filter(c => d.fx0 >= c.x - tol && d.fx0 <= c.x + c.w + tol
                    && d.fy0 >= c.y - tol && d.fy0 <= c.y + c.h + tol)
          .sort((a, b) => a.w * a.h - b.w * b.h)[0]
        if (hit) {
          const { _id, ...rest } = hit
          const created = withId({ ...rest, label: rest.label || '', autoFill: rest.autoFill || '' })
          setSpecs(list => [...list, created])
          setSelected(created._id)
          setDirty(true)
          return
        }
        const r = detectRegion(page, d.fx0, d.fy0)
        if (r) {
          const type = drawType !== 'text' ? drawType : (r.h > 0.05 ? 'textarea' : 'text')
          const box = type === 'checkbox'
            ? { x: r.x, y: r.y, w: Math.min(r.w, 0.02), h: Math.min(r.h, 0.014) }
            : r
          const created = withId({
            page, ...box, label: '', type,
            align: type === 'checkbox' ? 'left' : 'center',
            fontSize: 10, bold: false, italic: false, fontFamily: 'helvetica', autoFill: '',
          })
          setSpecs(list => [...list, created])
          setSelected(created._id)
          setDirty(true)
        }
        return
      }
      if (cur && cur.w >= MIN_W && cur.h >= MIN_H) {
        const box = drawType === 'checkbox'
          ? { ...cur, w: Math.max(cur.w, 0.02), h: Math.max(cur.h, 0.012) }
          : cur
        const created = withId({
          page, x: box.x, y: box.y, w: box.w, h: box.h,
          label: '', type: drawType,
          align: drawType === 'checkbox' ? 'left' : 'center',
          fontSize: 10, bold: false, italic: false, fontFamily: 'helvetica', autoFill: '',
        })
        setSpecs(list => [...list, created])
        setSelected(created._id)
        setDirty(true)
      }
    }
  }

  // Removes the pointer listeners when the editor closes
  useEffect(() => () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }, [])

  // Delete or Backspace removes the selected box unless an input is focused
  useEffect(() => {
    // Delete or Backspace handler for the selected box
    function key(e) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected != null
          && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault()
        remove(selected)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [selected])

  // Removes a box
  function remove(id) {
    setSpecs(list => list.filter(s => s._id !== id))
    setSelected(null)
    setDirty(true)
  }

  // Replaces all boxes with a fresh automatic detection after confirmation
  async function redetect() {
    if (!(await confirmDialog({ title: 'Re-detect all boxes?', message: 'Replace all boxes with a fresh automatic detection? The boxes you placed or moved will be lost.', confirmLabel: 'Replace', danger: true }))) return
    try {
      setBusy(true)
      const list = await api.legalForms.fieldSpecs(form.id, true)
      setSpecs(list.map(withId)); setSelected(null); setDirty(true)
    } catch (e) {
      addToast?.(getErrorMessage(e, 'Detection failed'), 'error')
    } finally { setBusy(false) }
  }

  // Saves all boxes for the form. At least one is needed
  async function save() {
    if (specs.length === 0) { addToast?.('Draw at least one field first', 'error'); return }
    try {
      setSaving(true)
      const body = specs.map(({ _id, ...rest }) => ({
        ...rest,
        label: (rest.label || '').trim(),
        fontSize: Number(rest.fontSize) || 0,
        bold: !!rest.bold,
        italic: !!rest.italic,
        fontFamily: rest.fontFamily || 'helvetica',
        autoFill: rest.autoFill || '',
        dateFormat: rest.type === 'date' ? (rest.dateFormat || 'dd/mm/yyyy') : null,
      }))
      await api.legalForms.saveFields(form.id, body)
      addToast?.('Fields saved')
      setDirty(false)
      onSaved?.()
    } catch (e) {
      addToast?.(getErrorMessage(e, 'Save failed'), 'error')
    } finally { setSaving(false) }
  }

  // Closes the editor, asking first if there are unsaved changes
  async function close() {
    if (dirty && !(await confirmDialog({ title: 'Unsaved changes', message: 'Discard your changes?', confirmLabel: 'Discard', cancelLabel: 'Keep editing', danger: true }))) return
    onClose()
  }

  // Number shown on a box, based on its position in the list
  const numberOf = (s) => specs.indexOf(s) + 1

  return (
    <ModalPortal>
      <div className="overlay" onMouseDown={e => e.stopPropagation()}>
        <div
          className="modal pdf-field-editor"
          onClick={e => e.stopPropagation()}
        >
          <div style={{ padding: '12px 16px', borderBottom: 'var(--border-default)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <h3 className="section-title u-m-0" >Mark fields — {form.name}</h3>
            <span className="admin__hint u-flex-1" >
              Click anywhere on the page (or a green dashed area) and the field area is detected automatically; or drag to draw one yourself. Click a box to edit it; drag to move; pull the corner to resize; Delete removes it.
            </span>
            {/* Draw type selector and auto-detect button */}
            <label className="admin__hint">
              Draw as{' '}
              <Dropdown searchable={false} className="form-input" style={{ display: 'inline-block', width: 220, verticalAlign: 'middle' }}
                      value={drawType} onChange={e => setDrawType(e.target.value)}>
                <option value="text">Text (one line)</option>
                <option value="date">Date</option>
                <option value="textarea">Text box (many lines)</option>
                <option value="checkbox">Tick box</option>
              </Dropdown>
            </label>
            <button type="button" className="btn-outline btn-outline--sm" onClick={redetect} disabled={busy}>Auto-detect</button>
          </div>

          {/* Main area: the page on the left, the box settings on the right */}
          <div className="pdf-field-editor__body">
            <div className="pdf-field-editor__stage">
              {busy && <p className="u-center">Loading…</p>}
              {/* Page buttons when the form has several pages */}
              {pages.length > 1 && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 8, alignItems: 'center' }}>
                  <button type="button" className="btn-outline btn-outline--sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ Prev</button>
                  <span>Page {page + 1} / {pages.length}</span>
                  <button type="button" className="btn-outline btn-outline--sm" disabled={page >= pages.length - 1} onClick={() => setPage(p => p + 1)}>Next ›</button>
                </div>
              )}
              {/* Page image with its boxes and suggestions drawn on top */}
              {images[page] && (
                <div
                  ref={stageRef}
                  onPointerDown={startDraw}
                  style={{ position: 'relative', width: '100%', maxWidth: 1000, margin: '0 auto', touchAction: 'none',
                           userSelect: 'none', cursor: 'crosshair', boxShadow: '0 1px 6px rgba(0,0,0,.25)', background: '#fff' }}
                >
                  <img src={images[page]} alt="" draggable={false}
                       style={{ width: '100%', display: 'block', pointerEvents: 'none' }} />

                  {freeCandidates.map(c => (
                    <div
                      key={`c${c._id}`}
                      title="Click to mark this area"
                      style={{
                        position: 'absolute', left: `${c.x * 100}%`, top: `${c.y * 100}%`,
                        width: `${c.w * 100}%`, height: `${c.h * 100}%`, boxSizing: 'border-box',
                        border: '1px dashed rgba(22,163,74,.75)', background: 'rgba(22,163,74,.07)',
                        pointerEvents: 'none',
                      }}
                    />
                  ))}

                  {onPage.map(({ s }) => {
                    const active = s._id === selected
                    const fs = Math.max(6, (Number(s.fontSize) || 10) * scale)
                    return (
                      <div
                        key={s._id}
                        onPointerDown={e => startMove(e, s)}
                        style={{
                          position: 'absolute', left: `${s.x * 100}%`, top: `${s.y * 100}%`,
                          width: `${s.w * 100}%`, height: `${s.h * 100}%`, boxSizing: 'border-box',
                          border: `1.5px solid ${active ? 'var(--color-gold)' : '#2563eb'}`,
                          background: active ? 'rgba(212,160,23,.10)' : 'rgba(37,99,235,.06)',
                          cursor: 'move', display: 'flex', alignItems: 'center', overflow: 'hidden',
                          justifyContent: s.align === 'center' ? 'center' : s.align === 'right' ? 'flex-end' : 'flex-start',
                          fontFamily: cssFamily(s.fontFamily), fontSize: fs, color: '#000',
                          fontWeight: s.bold ? 700 : 400, fontStyle: s.italic ? 'italic' : 'normal',
                        }}
                      >
                        <span style={{ position: 'absolute', top: 0, left: 0, fontSize: 9, lineHeight: '10px',
                                       background: active ? 'var(--color-gold)' : '#2563eb', color: '#fff', padding: '0 3px' }}>
                          {numberOf(s)}
                        </span>
                        {s.type === 'checkbox' ? <Icon name="close" /> : <span style={{ color: '#000', padding: '0 3px', whiteSpace: 'nowrap' }}>{s.type === 'date' ? (s.dateFormat || 'dd/mm/yyyy') : 'Sample text'}</span>}
                        {active && (
                          <span
                            onPointerDown={e => startResize(e, s)}
                            style={{ position: 'absolute', right: 0, bottom: 0, width: 10, height: 10,
                                     background: 'var(--color-gold)', cursor: 'nwse-resize' }}
                          />
                        )}
                      </div>
                    )
                  })}

                  {draft && (
                    <div style={{
                      position: 'absolute', left: `${draft.x * 100}%`, top: `${draft.y * 100}%`,
                      width: `${draft.w * 100}%`, height: `${draft.h * 100}%`,
                      border: '1.5px dashed #d4a017', background: 'rgba(212,160,23,.15)', pointerEvents: 'none',
                    }} />
                  )}
                </div>
              )}
            </div>

            {/* Side panel: settings of the selected box, or the list of boxes */}
            <div className="pdf-field-editor__side">
              {sel ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <strong>Field {numberOf(sel)}</strong>

                  <div className="form-group">
                    <label className="form-label">Label (what it is)</label>
                    <input className="form-input" value={sel.label || ''}
                           placeholder="e.g. Name of Applicant"
                           onChange={e => patch(sel._id, { label: e.target.value })} />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <Dropdown searchable={false} className="form-input" value={sel.type}
                            onChange={e => {
                              const type = e.target.value
                              const bad = type === 'date' && !DATE_AUTOFILL_OPTIONS.some(o => o[0] === (sel.autoFill || ''))
                              patch(sel._id, { type, ...(bad ? { autoFill: '' } : {}) })
                            }}>
                      <option value="text">Text (one line)</option>
                      <option value="date">Date</option>
                      <option value="textarea">Text box (many lines)</option>
                      <option value="checkbox">Tick box</option>
                    </Dropdown>
                  </div>

                  {sel.type === 'date' && (
                    <div className="form-group">
                      <label className="form-label">Date format</label>
                      <Dropdown searchable={false} className="form-input" value={sel.dateFormat || 'dd/mm/yyyy'}
                              onChange={e => patch(sel._id, { dateFormat: e.target.value })}>
                        {DATE_FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </Dropdown>
                    </div>
                  )}

                  {sel.type !== 'checkbox' && (
                    <>
                      <div className="form-group">
                        <label className="form-label">Text position</label>
                        <Dropdown searchable={false} className="form-input" value={sel.align || 'left'}
                                onChange={e => patch(sel._id, { align: e.target.value })}>
                          <option value="left">Left</option>
                          <option value="center">Centre</option>
                          <option value="right">Right</option>
                        </Dropdown>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Font size (pt)</label>
                        <input className="form-input" type="number" min="0" max="40" step="0.5"
                               value={sel.fontSize ?? 10}
                               onChange={e => patch(sel._id, { fontSize: e.target.value })} />
                        <p className="admin__hint u-mt-4">Enter 0 to fit the text to the box automatically.</p>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Font style</label>
                        <Dropdown searchable={false} className="form-input" value={sel.fontFamily || 'helvetica'}
                                onChange={e => patch(sel._id, { fontFamily: e.target.value })}>
                          {FONT_FAMILIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </Dropdown>
                        <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                          <label className="u-row-6">
                            <input type="checkbox" checked={!!sel.bold}
                                   onChange={e => patch(sel._id, { bold: e.target.checked })} />
                            <strong>Bold</strong>
                          </label>
                          <label className="u-row-6">
                            <input type="checkbox" checked={!!sel.italic}
                                   onChange={e => patch(sel._id, { italic: e.target.checked })} />
                            <em>Italic</em>
                          </label>
                        </div>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Auto-fill from case</label>
                        {(() => {
                          const isDate = sel.type === 'date'
                          const opts = isDate ? DATE_AUTOFILL_OPTIONS : AUTOFILL_OPTIONS
                          const known = opts.some(o => o[0] === (sel.autoFill || ''))
                          return (
                            <>
                              <Dropdown searchable={false} className="form-input"
                                value={known ? (sel.autoFill || '') : '__custom'}
                                onChange={e => patch(sel._id, { autoFill: e.target.value === '__custom' ? 'case.' : e.target.value })}>
                                {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                {!isDate && <option value="__custom">Other (type below)…</option>}
                              </Dropdown>
                              {!isDate && !known && (
                                <input className="form-input u-mt-6" value={sel.autoFill}
                                       placeholder="case.propertyName"
                                       onChange={e => patch(sel._id, { autoFill: e.target.value })} />
                              )}
                            </>
                          )
                        })()}
                      </div>
                    </>
                  )}

                  <button type="button" className="btn-outline btn-outline--sm btn-outline--danger" onClick={() => remove(sel._id)}>
                    Delete this field
                  </button>
                </div>
              ) : (
                <p className="admin__hint">Select a box to edit it, or draw a new one on the page.</p>
              )}

              <hr style={{ margin: '14px 0' }} />
              <strong>All fields ({specs.length})</strong>
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {specs.map(s => (
                  <button type="button"
                    key={s._id}
                    className="btn-outline btn-outline--sm"
                    style={{ textAlign: 'left', borderColor: s._id === selected ? 'var(--color-gold)' : undefined }}
                    onClick={() => { setPage(s.page); setSelected(s._id) }}
                  >
                    {numberOf(s)}. {s.label || <em>(no label)</em>}{pages.length > 1 ? ` · p${s.page + 1}` : ''}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Cancel and save buttons */}
          <div className="form-actions" style={{ padding: '10px 16px', borderTop: 'var(--border-default)', margin: 0 }}>
            <button type="button" className="btn-outline" onClick={close}>Cancel</button>
            <button type="button" className="btn-gold" onClick={save} disabled={saving || busy}>
              {saving ? 'Saving…' : 'Save fields'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
