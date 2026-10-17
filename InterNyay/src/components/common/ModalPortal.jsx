import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// Renders a popup on document.body instead of inside the component that opened it.
// A popup opened from inside another popup, a page or a scrolling panel otherwise has its
// position: fixed backdrop clipped to that parent's box (parent transforms, backdrop-filter and
// overflow all re-anchor "fixed"), so the backdrop stopped part-way down and the window was cut off.
//
// When the popup closes, a non-clickable copy of it fades out (polish.css) and is then removed,
// so closing is not an instant disappearance.
export default function ModalPortal({ children }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const el = ref.current
    const openedAt = performance.now()
    return () => {
      // Skip when reduced motion is on, when the node is gone, or for the instant mount/unmount
      // React runs in development strict mode (a popup is never closed within 250 ms of opening)
      if (!el || !el.isConnected || performance.now() - openedAt < 250) return
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
      const ghost = el.cloneNode(true)
      // A cloned <canvas> comes out blank (PDF pages, previews): paint the original picture into the copy
      const from = el.querySelectorAll('canvas')
      ghost.querySelectorAll('canvas').forEach((c, i) => {
        try { c.getContext('2d')?.drawImage(from[i], 0, 0) } catch (e) { /* tainted or empty canvas: leave it blank */ }
      })
      ghost.classList.add('modal-portal--closing')
      ghost.setAttribute('aria-hidden', 'true')
      ghost.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'))
      ghost.querySelectorAll('input, textarea, select, button, a').forEach(n => { n.tabIndex = -1 })
      document.body.appendChild(ghost)
      setTimeout(() => ghost.remove(), 200)
    }
  }, [])

  return createPortal(<div ref={ref} className="modal-portal">{children}</div>, document.body)
}
