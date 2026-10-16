import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// True when the element is inside a floating list, so "click outside" handlers can treat it as a click inside
export function inFloatingList(el) {
  return !!(el && el.closest && el.closest('[data-floating-list]'))
}

const GAP = 4
const EDGE = 8
const Z_INDEX = 2000

// Option list for dropdowns and suggestion fields.
// It is drawn on the page itself (outside the pop-up, card or scroll area it was opened from), so nothing can clip or hide it.
// It sits under the field, opens upward when there is more room above, and follows the field while the page or pop-up scrolls.
// Put it directly inside the field wrapper: that wrapper is what the list lines up with.
export default function FloatingList({ className = '', style, children, ...rest }) {
  const markerRef = useRef(null)
  const listRef = useRef(null)
  const cssMaxRef = useRef(0)
  const [pos, setPos] = useState(null)

  // Measure the field and place the list; runs before paint so the list never flashes in the wrong spot
  useLayoutEffect(() => {
    const anchor = markerRef.current && markerRef.current.parentElement
    const list = listRef.current
    if (!anchor || !list) return undefined

    const place = () => {
      const r = anchor.getBoundingClientRect()
      if (!cssMaxRef.current) {
        const m = parseFloat(window.getComputedStyle(list).maxHeight)
        cssMaxRef.current = Number.isFinite(m) ? m : 260
      }
      const cssMax = cssMaxRef.current
      const natural = Math.min(list.scrollHeight, cssMax)
      const below = window.innerHeight - r.bottom - GAP - EDGE
      const above = r.top - GAP - EDGE
      const up = natural > below && above > below
      const room = Math.max(up ? above : below, 120)
      const next = {
        left: Math.round(r.left),
        width: Math.round(r.width),
        maxHeight: Math.min(cssMax, Math.round(room)),
        up,
        edge: Math.round(up ? window.innerHeight - r.top + GAP : r.bottom + GAP),
      }
      setPos(prev => (prev && prev.left === next.left && prev.width === next.width && prev.maxHeight === next.maxHeight
        && prev.up === next.up && prev.edge === next.edge ? prev : next))
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  })

  const placed = pos ? {
    left: pos.left,
    width: pos.width,
    maxHeight: pos.maxHeight,
    top: pos.up ? 'auto' : pos.edge,
    bottom: pos.up ? pos.edge : 'auto',
    transformOrigin: pos.up ? 'bottom center' : 'top center',
  } : { top: 0, left: 0, visibility: 'hidden' }

  return (
    <>
      <span ref={markerRef} hidden />
      {createPortal(
        <div
          ref={listRef}
          data-floating-list=""
          className={className}
          style={{ ...style, position: 'fixed', right: 'auto', margin: 0, zIndex: Z_INDEX, ...placed }}
          {...rest}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  )
}
