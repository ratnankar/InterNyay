import { useEffect } from 'react'

// The search / filter bars of the list pages are sticky. This marks a bar with "is-stuck" while it is pinned to the top,
// so the stylesheet can give the pinned bar its own look (flat top edge, tighter padding) and leave the resting bar alone.
const BARS = [
  '.app-main .list-toolbar',
  '.app-main .todo-filter-bar',
  '.app-main .doc-filter-bar',
  '.app-main .search-card',
  '.app-main .admin__toolbar',
].join(',')

// The nearest ancestor that scrolls, or null when the window scrolls
function scroller(el) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if (o === 'auto' || o === 'scroll') return p
  }
  return null
}

export default function useStickyBars() {
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      document.querySelectorAll(BARS).forEach(bar => {
        const cs = getComputedStyle(bar)
        if (cs.position !== 'sticky') { bar.classList.remove('is-stuck'); return }
        const top = parseFloat(cs.top) || 0
        const box = scroller(bar)
        // A sticky offset is measured inside the scroll box's padding, so the pinned position is its top edge + padding + offset
        const edge = box ? box.getBoundingClientRect().top + (parseFloat(getComputedStyle(box).paddingTop) || 0) : 0
        const stuck = bar.getBoundingClientRect().top <= edge + top + 0.5 && (box ? box.scrollTop : window.scrollY) > 4
        bar.classList.toggle('is-stuck', stuck)
      })
    }
    const queue = () => { if (!frame) frame = requestAnimationFrame(update) }
    document.addEventListener('scroll', queue, { passive: true, capture: true })
    window.addEventListener('resize', queue)
    // Pages mount and unmount their bars as the route or the tab changes
    const mo = new MutationObserver(queue)
    mo.observe(document.body, { childList: true, subtree: true })
    queue()
    return () => {
      document.removeEventListener('scroll', queue, { capture: true })
      window.removeEventListener('resize', queue)
      mo.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])
}
