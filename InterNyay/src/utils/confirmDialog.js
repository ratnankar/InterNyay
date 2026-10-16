// In-app replacement for window.confirm: `if (!(await confirmDialog('Delete this?'))) return`
// Resolves true when the user confirms and false when they cancel, press Escape or click outside.
// Pass a string, or { title, message, confirmLabel, cancelLabel, danger } to control the wording.
// Messages starting with Delete / Remove / Deactivate get a red button labelled with that word.

// The mounted <ConfirmHost /> registers itself here
let host = null

// Called by ConfirmHost when it mounts and unmounts
export function registerConfirmHost(fn) {
  host = fn
  return () => { if (host === fn) host = null }
}

// Fills in the title, button labels and danger styling for a request
function normalise(input) {
  const o = typeof input === 'string' ? { message: input } : { ...(input || {}) }
  const message = String(o.message ?? '')
  const first = message.trim().split(/\s+/)[0].replace(/[^a-z]/gi, '')
  const destructive = /^(delete|remove|deactivate)$/i.test(first)
  const danger = o.danger ?? destructive
  const verb = destructive ? first[0].toUpperCase() + first.slice(1).toLowerCase() : ''
  return {
    message,
    danger,
    title: o.title || (destructive ? `${verb} this?` : 'Please confirm'),
    confirmLabel: o.confirmLabel || (destructive ? verb : 'Confirm'),
    cancelLabel: o.cancelLabel || 'Cancel',
  }
}

// Shows the dialog and waits for the answer
export function confirmDialog(input) {
  const opts = normalise(input)
  // No host mounted (should not happen inside the app): fall back to the browser dialog
  if (!host) return Promise.resolve(window.confirm(opts.message))
  return host(opts)
}
