import { useEffect } from 'react'

// Marks a tooltip this file added, so it can be told apart from a title written in the code
const AUTO = 'data-auto-title'

// True when the element draws "…" because its text is longer than its box (one line cut at the edge, or a line-clamped paragraph)
function isCut(el) {
  const style = getComputedStyle(el)
  const oneLine = style.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1
  const clamped = (style.webkitLineClamp && style.webkitLineClamp !== 'none') && el.scrollHeight > el.clientHeight + 1
  return oneLine || clamped
}

// Gives a cut-off element its full text as a hover tooltip, or takes that tooltip away again once the text fits
function sync(el) {
  const own = el.hasAttribute('title') && !el.hasAttribute(AUTO)
  if (own) return

  if (isCut(el)) {
    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
    if (text) { el.setAttribute('title', text); el.setAttribute(AUTO, '') }
  } else if (el.hasAttribute(AUTO)) {
    el.removeAttribute('title')
    el.removeAttribute(AUTO)
  }
}

// Use once at the root of the app. Wherever text is cut short with "…" (case titles, names, long dropdown choices, table cells),
// pointing at it shows the full text. Nothing is listed or hard coded: it looks at what is actually cut at that moment,
// so it follows the window size, the font size and the data. Text with a title of its own keeps that title
export function useFullTextOnHover() {
  useEffect(() => {
    const onOver = e => {
      let el = e.target instanceof Element ? e.target : null
      // The element itself, then a few parents (the cut text is often the parent of an icon or a span)
      for (let i = 0; el && el !== document.body && i < 4; i += 1, el = el.parentElement) sync(el)
    }
    document.addEventListener('mouseover', onOver, true)
    return () => document.removeEventListener('mouseover', onOver, true)
  }, [])
}
