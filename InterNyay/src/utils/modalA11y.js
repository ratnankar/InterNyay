import { useEffect } from 'react'

// Gives every modal and drawer dialog semantics for screen readers and makes Escape close the top one, app-wide.
// Escape presses the modal's own Close button, so it goes through the same unsaved-changes guard as clicking the cross.
// Windows that handle Escape themselves (photo viewer, crop, notification popup, form fill, confirm dialog) are left alone

const DIALOG_SELECTOR = '.modal, .drawer, .imp-notif__card'
// Overlays that already listen for Escape on their own
const SELF_HANDLED = '.crop-frame, .imp-notif__card, .pdf-modal--fill, .image-viewer, .confirm-dialog'
let titleCounter = 0

// Adds role="dialog", aria-modal and a title label to a dialog box that has none
function describe(box) {
  if (box.getAttribute('role')) return
  box.setAttribute('role', 'dialog')
  box.setAttribute('aria-modal', 'true')
  if (!box.hasAttribute('aria-labelledby') && !box.hasAttribute('aria-label')) {
    const title = box.querySelector('.modal__title, .drawer__title, h2, h3')
    if (title) {
      if (!title.id) title.id = `dialog-title-${++titleCounter}`
      box.setAttribute('aria-labelledby', title.id)
    }
  }
  // Move keyboard focus into the dialog unless a field inside already took it (autoFocus runs first)
  setTimeout(() => {
    if (!box.isConnected || box.contains(document.activeElement)) return
    if (!box.hasAttribute('tabindex')) box.setAttribute('tabindex', '-1')
    box.focus({ preventScroll: true })
  }, 0)
}

// Dialog boxes inside a newly added node (or the node itself)
function scan(node) {
  if (node.nodeType !== 1) return
  if (node.matches(DIALOG_SELECTOR)) describe(node)
  node.querySelectorAll?.(DIALOG_SELECTOR).forEach(describe)
}

// The open overlay that is on top: highest z-index, and the latest in the page when tied
function topOverlay() {
  let top = null
  let topZ = -Infinity
  document.querySelectorAll('.overlay').forEach(el => {
    // A popup that is fading out is only a copy, it cannot take Escape
    if (el.closest('.modal-portal--closing')) return
    const z = parseInt(getComputedStyle(el).zIndex, 10)
    const value = Number.isNaN(z) ? 0 : z
    if (value >= topZ) { top = el; topZ = value }
  })
  return top
}

export function useModalA11y() {
  useEffect(() => {
    scan(document.body)
    const observer = new MutationObserver(records => records.forEach(r => r.addedNodes.forEach(scan)))
    observer.observe(document.body, { childList: true, subtree: true })

    function onKeyDown(e) {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
      // Open dropdowns, suggestion lists and pickers use Escape to close themselves first
      if (e.target instanceof Element && e.target.closest('[aria-expanded="true"], [role="listbox"], .dropdown--open')) return
      const overlay = topOverlay()
      if (!overlay || overlay.querySelector(SELF_HANDLED)) return
      const close = overlay.querySelector('button[aria-label="Close"]')
      if (close && !close.disabled) {
        e.preventDefault()
        close.click()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { observer.disconnect(); document.removeEventListener('keydown', onKeyDown) }
  }, [])
}
