import { useEffect } from 'react'

// Input types where Enter should keep its normal meaning (toggle, pick a file, etc.)
const SKIP_TYPES = ['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'range', 'color', 'image']

// Handler for an input's onKeyDown: runs fn when Enter is pressed. It marks the key press as handled so the
// app-wide Enter handler below does not also act on it
export function enterKey(fn) {
  return e => {
    if (e.key !== 'Enter' || e.nativeEvent?.isComposing) return
    e.preventDefault()
    fn(e)
  }
}

// Whether an element can be clicked right now
function usable(btn) {
  return !btn.disabled && btn.getAttribute('aria-disabled') !== 'true' && btn.offsetParent !== null
}

// The main action button for the form the input sits in: the last enabled gold or red button of the nearest
// Save / Submit row (.form-actions) that comes after the input. Returns null when it is not clear which button to use
function primaryButtonFor(input) {
  const modal = input.closest('.modal')
  let scope = input.closest('form, .modal, .card, .txn-gate__card, .account-modal')

  while (scope) {
    const rows = [...scope.querySelectorAll('.form-actions')]
    // Prefer the first button row below the input, otherwise the last row in the container
    const row = rows.find(r => input.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING) || rows[rows.length - 1]

    if (row) {
      const buttons = [...row.querySelectorAll('.btn-gold, .btn-danger')].filter(usable)
      return buttons[buttons.length - 1] || null
    }

    // Inside a modal keep looking outwards until the modal itself; elsewhere stop at the first container
    if (!modal || scope === modal) return null
    scope = scope.parentElement?.closest('form, .modal, .card')
  }

  return null
}

// App-wide Enter key: pressing Enter in a text field presses that form's main button (Save, Create, Upload...).
// Fields that handle Enter themselves (dropdowns, suggestion lists, PIN boxes, login steps) are left alone
export function useEnterToContinue() {
  useEffect(() => {
    // Look at every key press on the page
    function onKeyDown(e) {
      if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return
      if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return

      const el = e.target
      if (!(el instanceof HTMLInputElement) || SKIP_TYPES.includes(el.type)) return
      if (el.readOnly || el.disabled) return

      // Dropdowns, search-as-you-type lists and anything that opted out
      if (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-expanded') === 'true') return
      if (el.closest('.dropdown, .picker__field, [data-enter="off"]')) return

      const btn = primaryButtonFor(el)
      if (!btn) return

      e.preventDefault()
      btn.click()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
}
