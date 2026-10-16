import { useEffect } from 'react'

// Input types that never show browser suggestions, so they are left alone
const SKIP_TYPES = ['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'range', 'color', 'image', 'hidden']

// The browser's one-time-code helper (OTP from SMS) is not an email or saved-value suggestion, so it stays as it is
const KEEP = ['one-time-code']

// Turns off the browser's autofill and "saved values" dropdown for one field (or form):
//  - autocomplete="off" for normal fields, "new-password" for password fields (stops saved passwords being offered)
//  - the data-* flags tell common password managers (LastPass, 1Password, Bitwarden, Dashlane) to stay out of it
// Exported so it can be tested without a browser
function lockField(el) {
  if (!el || !el.tagName) return
  const tag = el.tagName.toUpperCase()

  if (tag === 'FORM') {
    if (el.getAttribute('autocomplete') !== 'off') el.setAttribute('autocomplete', 'off')
    return
  }

  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return

  const type = (el.getAttribute('type') || 'text').toLowerCase()
  if (tag === 'INPUT' && SKIP_TYPES.includes(type)) return

  const current = el.getAttribute('autocomplete')
  if (KEEP.includes(current)) return

  const wanted = tag === 'INPUT' && type === 'password' ? 'new-password' : 'off'
  if (current !== wanted) el.setAttribute('autocomplete', wanted)

  if (el.getAttribute('data-lpignore') !== 'true') {
    el.setAttribute('data-lpignore', 'true')
    el.setAttribute('data-1p-ignore', 'true')
    el.setAttribute('data-bwignore', 'true')
    el.setAttribute('data-form-type', 'other')
  }
}

const FIELD_SELECTOR = 'input, textarea, select, form'

function lockTree(root) {
  if (!root || root.nodeType !== 1) return
  lockField(root)
  if (root.querySelectorAll) root.querySelectorAll(FIELD_SELECTOR).forEach(lockField)
}

// Use once in the signed-in part of the app. While `enabled` is true, every form field on the page (including
// pop-ups and dialogs added later) gets browser autofill and suggestions turned off. Pass false on the landing,
// sign-in and register pages, where the browser's suggestions are wanted
export function useDisableAutofill(enabled) {
  useEffect(() => {
    if (!enabled) return undefined

    // Fields already on the page
    lockTree(document.body)

    // Fields added later (modals, pop-ups, new pages): lock them as soon as they appear
    const observer = new MutationObserver(mutations => {
      for (const m of mutations) m.addedNodes.forEach(lockTree)
    })
    observer.observe(document.body, { childList: true, subtree: true })

    // Safety net: lock the field right when it is focused, just before the browser decides to show a dropdown
    const onFocus = e => lockField(e.target)
    document.addEventListener('focusin', onFocus, true)

    return () => {
      observer.disconnect()
      document.removeEventListener('focusin', onFocus, true)
    }
  }, [enabled])
}
