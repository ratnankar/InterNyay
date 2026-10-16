import { useCallback, useLayoutEffect, useRef, useState } from 'react'

// Transition of every row: the fade of the held row and the slide of rows that change places
const ROW_TRANSITION = 'opacity .12s ease, transform .12s cubic-bezier(.2, .8, .2, 1)'
// The row in hand follows the cursor exactly, so it has no slide, only the fade
const HELD_TRANSITION = 'opacity .12s ease'

// Nearest ancestor that scrolls, or the window when the page itself scrolls
function scrollParent(el) {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return window
}

// How far a row is currently moved by its transform (a slide in progress, or the follow of the cursor)
function shiftOf(el) {
  try { return new DOMMatrixReadOnly(getComputedStyle(el).transform).m42 } catch { return 0 }
}

// Press-and-hold drag to reorder a vertical list of rows. The row in hand moves with the cursor.
//   keys      current order of the rows' keys (ids, or indexes for lists without ids)
//   onCommit  called once, when the pointer is released and the order changed: (startKeys, finalKeys, movedKey).
//             It may return a promise: the new order stays on screen until that promise settles.
// Returns:
//   ordered(items, getKey)  the items in the order to draw (follows the pointer while dragging)
//   rowRef(key)             ref for each row element, used to find the row under the pointer
//   gripProps(key)          props for the handle the user presses and drags
//   rowStyle(key)           look of the row in hand (faded, outlined, on top)
//   dragKey                 key of the row being dragged, or null
export default function useDragReorder(keys, onCommit) {
  const [dragKey, setDragKey] = useState(null)
  const [order, setOrder] = useState(null)
  const keysRef = useRef(keys)
  keysRef.current = keys
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit
  const orderRef = useRef(null)
  const rows = useRef({})
  const prevTops = useRef({})
  // Puts the row in hand under the cursor; set while a drag is running
  const followRef = useRef(null)
  // False from the moment the order changes until the screen has drawn that order, so no decision is made on old positions
  const settled = useRef(true)

  // Smooth slide: while a row is being dragged, every other row that changes place glides from where it was to where it now is
  useLayoutEffect(() => {
    settled.current = true
    const calm = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const next = {}
    Object.entries(rows.current).forEach(([k, el]) => {
      const top = el.offsetTop
      next[k] = top
      const before = prevTops.current[k]
      // The row in hand is not slid: it follows the cursor. Only the rows it passes slide.
      if (dragKey === null || calm || k === dragKey || before === undefined || before === top) return
      // A row that is still sliding starts from where it is seen now, so quick moves do not jump
      const delta = before + shiftOf(el) - top
      if (Math.abs(delta) < 1) return
      el.style.transition = 'none'
      el.style.transform = `translateY(${delta}px)`
      void el.offsetHeight
      el.style.transition = ROW_TRANSITION
      el.style.transform = ''
    })
    prevTops.current = next
    // The row in hand changed slot: keep it under the cursor in the same frame
    if (followRef.current) followRef.current()
  })

  const rowRef = useCallback(key => el => {
    const k = String(key)
    if (el) rows.current[k] = el
    else delete rows.current[k]
  }, [])

  const ordered = (items, getKey) => {
    if (!order) return items
    const map = new Map(items.map(it => [String(getKey(it)), it]))
    if (map.size !== order.length || order.some(k => !map.has(k))) return items
    return order.map(k => map.get(k))
  }

  function startDrag(e, key) {
    if (orderRef.current) return
    if (e.button != null && e.button !== 0) return
    e.preventDefault()

    const moved = String(key)
    const heldEl = rows.current[moved]
    if (!heldEl) return
    const startKeys = keysRef.current.map(String)
    orderRef.current = startKeys
    setOrder(startKeys)
    setDragKey(moved)
    document.body.style.userSelect = 'none'

    const scroller = scrollParent(heldEl)
    let lastY = e.clientY
    // Where inside the row the cursor took hold, so the row keeps that spot under the cursor
    const grab = e.clientY - heldEl.getBoundingClientRect().top

    // Where a row really sits in the list (top and bottom), ignoring any slide or follow it is in the middle of
    const place = k => {
      const el = rows.current[k]
      if (!el) return null
      const r = el.getBoundingClientRect()
      const shift = shiftOf(el)
      return { top: r.top - shift, bottom: r.bottom - shift }
    }

    // Moves the row in hand so it sits under the cursor, kept inside the list
    const follow = () => {
      const el = rows.current[moved]
      const list = orderRef.current
      if (!el || !list) return
      const me = place(moved)
      if (!me) return
      let wanted = lastY - grab
      const first = place(list[0]), last = place(list[list.length - 1])
      if (first) wanted = Math.max(wanted, first.top)
      if (last) wanted = Math.min(wanted, last.bottom - (me.bottom - me.top))
      el.style.transform = `translateY(${wanted - me.top}px)`
    }
    followRef.current = follow

    // The row in hand passes a neighbour once the middle of the row is beyond the neighbour's middle
    const reposition = () => {
      if (!orderRef.current || !settled.current) return
      const me = place(moved)
      if (!me) return
      const probe = lastY - grab + (me.bottom - me.top) / 2
      const list = [...orderRef.current]
      let at = list.indexOf(moved)
      const from = at
      const mid = k => { const p = place(k); return p ? (p.top + p.bottom) / 2 : null }
      while (at < list.length - 1) {
        const m = mid(list[at + 1])
        if (m === null || probe <= m) break
        ;[list[at], list[at + 1]] = [list[at + 1], list[at]]
        at++
      }
      while (at > 0) {
        const m = mid(list[at - 1])
        if (m === null || probe >= m) break
        ;[list[at], list[at - 1]] = [list[at - 1], list[at]]
        at--
      }
      if (at === from) return
      settled.current = false
      orderRef.current = list
      setOrder(list)
    }

    const onMove = ev => { lastY = ev.clientY; follow(); reposition() }

    // Near the top or bottom edge the list scrolls by itself, so a long list can be crossed in one drag
    const timer = setInterval(() => {
      const box = scroller === window ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect()
      const zone = 60
      let dy = 0
      if (lastY < box.top + zone) dy = -16
      else if (lastY > box.bottom - zone) dy = 16
      if (!dy) return
      if (scroller === window) window.scrollBy(0, dy)
      else scroller.scrollTop += dy
      follow()
      reposition()
    }, 30)

    // Ends the drag; the row in hand glides into its place (or snaps back when cancelled)
    const stop = glide => {
      clearInterval(timer)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      document.body.style.userSelect = ''
      followRef.current = null
      const el = rows.current[moved]
      if (el) {
        el.style.transition = glide ? ROW_TRANSITION : 'none'
        el.style.transform = ''
        if (!glide) { void el.offsetHeight; el.style.transition = ROW_TRANSITION }
      }
      setDragKey(null)
    }

    // Released: save the new order once
    const onUp = () => {
      const final = orderRef.current
      orderRef.current = null
      stop(true)
      if (!final || final.join('\u0000') === startKeys.join('\u0000')) { setOrder(null); return }
      let result
      try { result = commitRef.current(startKeys, final, moved) } catch { result = null }
      if (result && typeof result.finally === 'function') result.finally(() => setOrder(null))
      else setOrder(null)
    }

    // Escape or a cancelled touch: put everything back
    const onCancel = () => { orderRef.current = null; stop(false); setOrder(null) }
    const onKey = ev => { if (ev.key === 'Escape') onCancel() }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
  }

  const gripProps = key => ({
    onPointerDown: e => startDrag(e, key),
    title: 'Press and hold, then drag up or down to move',
    'aria-label': 'Drag to reorder',
    style: { cursor: dragKey ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none' },
  })

  // The row in hand fades, gets a gold outline and sits above the others; the rest stay as they are
  const rowStyle = key => (dragKey === String(key)
    ? { position: 'relative', zIndex: 2, opacity: 0.5, background: 'rgba(212,160,23,.18)', outline: '1.5px solid var(--color-gold)', transition: HELD_TRANSITION }
    : { opacity: 1, transition: ROW_TRANSITION })

  return { ordered, rowRef, gripProps, rowStyle, dragKey }
}
