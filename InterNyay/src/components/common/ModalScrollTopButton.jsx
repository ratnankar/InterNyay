import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import '../../styles/components/scroll-top.css'

// "Go to top" button for long pop-up windows. Pop-ups scroll inside themselves (.modal), not the page, so the page button
// cannot help there. One copy is mounted for the whole app: it watches every .modal that scrolls and, once the open window
// has been scrolled down a little, shows a small button at the bottom right corner of that window.
export default function ModalScrollTopButton({ threshold = 300 }) {
  const [pos, setPos] = useState(null)
  const modalRef = useRef(null)

  useEffect(() => {
    const place = modal => {
      if (!modal || !modal.isConnected || modal.scrollTop <= threshold) {
        modalRef.current = null
        setPos(null)
        return
      }
      modalRef.current = modal
      const r = modal.getBoundingClientRect()
      // Clear of the window's own Save / Cancel row
      setPos({ left: r.right - 56, top: Math.min(r.bottom, window.innerHeight) - 118 })
    }

    const onScroll = e => {
      const t = e.target
      if (t && t.nodeType === 1 && t.classList.contains('modal')) place(t)
    }
    const refresh = () => { if (modalRef.current) place(modalRef.current) }

    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', refresh)
    // A window that closes takes its button with it
    const watcher = new MutationObserver(refresh)
    watcher.observe(document.body, { childList: true, subtree: true })
    return () => {
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', refresh)
      watcher.disconnect()
    }
  }, [threshold])

  if (!pos) return null
  return createPortal(
    <button
      type="button"
      className="scroll-top-btn scroll-top-btn--modal"
      style={{ left: pos.left, top: pos.top }}
      onClick={() => modalRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Go to top of this window"
      title="Go to top"
    >
      <svg className="scroll-top-btn__arrow" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
        <path d="M12 4l8 8-1.41 1.41L13 7.83V20h-2V7.83l-5.59 5.58L4 12z" />
      </svg>
    </button>,
    document.body,
  )
}
