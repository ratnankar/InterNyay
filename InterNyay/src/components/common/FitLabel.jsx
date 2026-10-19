import { useLayoutEffect, useRef, useState } from 'react'

// Shows the full text of a label, and the short form only when the full text does not fit in the space it has.
// It measures an invisible copy of the full text against the room available, so nothing is decided by screen size or hard coded,
// and it switches back to the full text as soon as there is room again (a wider window, a larger font)
export default function FitLabel({ full, short, className = '' }) {
  const box = useRef(null)
  const ruler = useRef(null)
  const [useShort, setUseShort] = useState(false)

  useLayoutEffect(() => {
    const el = box.current
    if (!el || !short || short === full) return undefined
    const check = () => {
      if (!ruler.current) return
      setUseShort(ruler.current.offsetWidth > el.clientWidth)
    }
    check()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null
    observer?.observe(el)
    document.fonts?.ready?.then(check)
    window.addEventListener('resize', check)
    return () => { observer?.disconnect(); window.removeEventListener('resize', check) }
  }, [full, short])

  return (
    <span ref={box} className={`fit-label ${className}`.trim()} title={useShort ? full : undefined}>
      {useShort ? short : full}
      <span ref={ruler} className="fit-label__ruler" aria-hidden="true">{full}</span>
    </span>
  )
}
