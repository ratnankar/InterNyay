import { useEffect, useRef, useState } from 'react'

// Loads the next part of a list by itself when the end of the list scrolls into view (no "See more" button).
// Put it right under the list. onLoad is called once each time the marker comes near the screen; after the list grows,
// depKey changes (for example the number of rows still hidden) and the marker watches again, so a list that is still
// too short to fill the screen keeps loading until it does. active=false stops it (nothing left, or a load is running).
// Browsers without IntersectionObserver get a plain "See more" button instead.
export default function AutoLoad({ onLoad, active = true, depKey = '' }) {
  const ref = useRef(null)
  const callback = useRef(onLoad)
  callback.current = onLoad
  const [supported] = useState(() => typeof IntersectionObserver !== 'undefined')

  useEffect(() => {
    const el = ref.current
    if (!active || !supported || !el) return undefined
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        observer.disconnect()
        callback.current?.()
      }
    }, { rootMargin: '0px 0px 400px 0px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [active, depKey, supported])

  if (!active) return null
  if (!supported) {
    return (
      <div className="see-more">
        <button type="button" className="btn-outline see-more__btn" onClick={() => callback.current?.()}>See more</button>
      </div>
    )
  }
  return <div ref={ref} className="auto-load" aria-hidden="true" style={{ height: 1, marginTop: 8, gridColumn: '1 / -1' }} />
}
