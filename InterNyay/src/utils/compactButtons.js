// When a row of buttons runs out of room (it would wrap or spill over), the buttons that have an icon drop their words and
// show the icon only. The words stay available to screen readers (aria-label) and as a hover tooltip.
// Nothing is moved in the page: the group just gets a data-compact attribute that the CSS in styles/hierarchy.css reacts to.
const BUTTONS = '.btn-gold, .btn-outline, .btn-danger, .btn-gold-secondary'

// Words of a button (its own text, not the icon's)
function words(el) {
  return [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim()
}

// A button that has an icon and words next to it
function isIconButton(el) {
  return !!el.querySelector(':scope > svg.icon') && words(el) !== ''
}

// True when the children of a row-direction flex box no longer fit on one line (a child dropped to a second row)
function wrapped(box) {
  if (!box) return false
  const cs = getComputedStyle(box)
  if (!cs.display.includes('flex') || cs.flexDirection.startsWith('column')) return false
  const kids = [...box.children].filter(c => c.offsetWidth > 0 && c.offsetHeight > 0)
  if (kids.length < 2) return false
  const firstRowBottom = Math.min(...kids.map(c => c.offsetTop + c.offsetHeight))
  return kids.some(c => c.offsetTop >= firstRowBottom - 1)
}

// True when the group no longer fits: it spills sideways, or it or the row it sits in wrapped
function overflows(box) {
  return box.scrollWidth > box.clientWidth + 1 || wrapped(box) || wrapped(box.parentElement)
}

function evaluate() {
  const groups = new Set()
  document.querySelectorAll(BUTTONS).forEach(b => {
    if (!isIconButton(b)) return
    if (!b.hasAttribute('aria-label') || b.dataset.autoLabel) { b.setAttribute('aria-label', words(b)); b.dataset.autoLabel = '1' }
    if (b.parentElement) groups.add(b.parentElement)
  })
  groups.forEach(g => {
    g.removeAttribute('data-compact')
    if (overflows(g)) g.setAttribute('data-compact', '')
    g.querySelectorAll(':scope > [data-auto-label]').forEach(b => {
      if (g.hasAttribute('data-compact')) { if (!b.title) { b.title = b.getAttribute('aria-label'); b.dataset.autoTitle = '1' } }
      else if (b.dataset.autoTitle) { b.removeAttribute('title'); delete b.dataset.autoTitle }
    })
  })
}

export function compactButtons() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
  let queued = false
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; evaluate() }) } }
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true })
  window.addEventListener('resize', schedule)
  window.addEventListener('orientationchange', schedule)
  document.fonts?.ready?.then(schedule)
  schedule()
}
