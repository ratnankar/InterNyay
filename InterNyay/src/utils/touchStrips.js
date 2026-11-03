// Sideways-scrolling rows (Cases status chips, filter chips, to-do nav, admin tabs) on touch screens.
// iPhone Safari sometimes ignores the native swipe on these rows (they sit inside a page that hides sideways overflow),
// so on touch screens the swipe is handled here: a mostly sideways drag moves the row's scrollLeft directly, with a short
// glide after release. A mostly vertical drag is left alone, so the page still scrolls normally. Taps still reach the chips.
const STRIPS = '.case-filters, .status-tiles, .todo-sidebar__nav, .admin__tabs, .admin__subtabs, [data-hscroll]'
const SLOP = 6

export function touchStrips() {
  if (typeof window === 'undefined') return
  // The CSS only hands the sideways swipe over to this script once it has seen a finger (touch-action: pan-y on the rows).
  // Listeners are always added: a phone simulator in a desktop browser turns touch on without a reload
  const root = document.documentElement

  let s = null
  let raf = 0

  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0 }

  document.addEventListener('touchstart', e => {
    root.classList.add('js-touch-strips')
    stop()
    s = null
    if (e.touches.length !== 1) return
    const el = e.target instanceof Element ? e.target.closest(STRIPS) : null
    if (!el || el.scrollWidth <= el.clientWidth + 1) return
    const t = e.touches[0]
    s = { el, x: t.clientX, y: t.clientY, left: el.scrollLeft, mode: null, lastX: t.clientX, lastT: e.timeStamp, v: 0 }
  }, { passive: true })

  document.addEventListener('touchmove', e => {
    if (!s || e.touches.length !== 1) return
    const t = e.touches[0]
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y
    if (!s.mode) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return
      s.mode = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    if (s.mode !== 'x') return
    if (e.cancelable) e.preventDefault()
    s.el.scrollLeft = s.left - dx
    const dt = e.timeStamp - s.lastT
    if (dt > 0) s.v = (s.lastX - t.clientX) / dt // px per ms, positive = scrolling to the right
    s.lastX = t.clientX
    s.lastT = e.timeStamp
  }, { passive: false })

  const end = e => {
    if (!s) return
    const { el, mode } = s
    let v = s.v * 16 // px per frame
    const idle = e.timeStamp - s.lastT > 80
    s = null
    if (mode !== 'x' || idle || Math.abs(v) < 0.5) return
    const glide = () => {
      el.scrollLeft += v
      v *= 0.95
      raf = Math.abs(v) > 0.4 ? requestAnimationFrame(glide) : 0
    }
    raf = requestAnimationFrame(glide)
  }
  document.addEventListener('touchend', end, { passive: true })
  document.addEventListener('touchcancel', end, { passive: true })

  // Mouse: click and drag a row sideways (a narrow desktop window or a phone simulator). The admin tab bars have their own
  // mouse drag in the Admin page. A drag does not click the chip it started on.
  const MOUSE_STRIPS = '.case-filters, .status-tiles, .todo-sidebar__nav, [data-hscroll]'
  let m = null
  let suppressClick = false
  document.addEventListener('mousedown', e => {
    m = null
    if (e.button !== 0) return
    const el = e.target instanceof Element ? e.target.closest(MOUSE_STRIPS) : null
    if (!el || el.scrollWidth <= el.clientWidth + 1) return
    m = { el, x: e.clientX, left: el.scrollLeft, moved: false }
  })
  document.addEventListener('mousemove', e => {
    if (!m) return
    if (e.buttons !== 1) { m = null; return }
    const dx = e.clientX - m.x
    if (!m.moved && Math.abs(dx) < SLOP) return
    m.moved = true
    e.preventDefault()
    m.el.scrollLeft = m.left - dx
  })
  document.addEventListener('mouseup', () => {
    if (m?.moved) { suppressClick = true; setTimeout(() => { suppressClick = false }, 0) }
    m = null
  })
  document.addEventListener('click', e => {
    if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false }
  }, true)
}
