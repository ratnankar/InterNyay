import { useEffect, useRef, useState } from 'react'
import '../../styles/components/scroll-top.css'

// Floating "back to top" button. It appears once the page has been scrolled down a little.
// It sits in the middle of the page area.
// The page scrolls inside .app-main on desktop and in the window on small screens, so both are watched.
export default function ScrollToTopButton({ threshold = 400 }) {
  const [show, setShow] = useState(false)
  const btnRef = useRef(null)

  useEffect(() => {
    const main = document.querySelector('.app-main')

    const check = () => {
      const y = Math.max(window.scrollY || 0, main ? main.scrollTop : 0)
      setShow(y > threshold)

      const btn = btnRef.current
      if (!btn) return

      // Horizontal centre of the page area (the sidebar is not part of it)
      const area = main ? main.getBoundingClientRect() : null
      const centre = area && area.width > 0 ? area.left + area.width / 2 : window.innerWidth / 2
      btn.style.setProperty('--st-x', `${centre}px`)
    }

    check()
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    main?.addEventListener('scroll', check, { passive: true })
    return () => {
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
      main?.removeEventListener('scroll', check)
    }
  }, [threshold])

  function goTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    document.querySelector('.app-main')?.scrollTo?.({ top: 0, behavior: 'smooth' })
  }

  return (
    <button
      ref={btnRef}
      type="button"
      className={`scroll-top-btn${show ? ' scroll-top-btn--show' : ''}`}
      onClick={goTop}
      aria-label="Go to top"
      title="Go to top"
      tabIndex={show ? 0 : -1}
      aria-hidden={!show}
    >
      <svg className="scroll-top-btn__arrow" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
        <path d="M12 4l8 8-1.41 1.41L13 7.83V20h-2V7.83l-5.59 5.58L4 12z" />
      </svg>
    </button>
  )
}