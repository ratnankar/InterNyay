// One shared "look again" signal for data that other people (an admin, another device) can change while a screen is open.
// It fires when the tab comes back into view or is focused, and every couple of minutes while the tab is visible.
// Screens subscribe with onLiveRefresh(fn) and reload their data quietly (no spinner, no error flash).

const listeners = new Set()
const EVERY_MS = 120_000   // while the tab is visible
const MIN_GAP_MS = 30_000  // never fire twice within this time, however often focus changes
let started = false
let last = 0

function fire() {
  if (typeof document === 'undefined' || document.visibilityState !== 'visible') return
  const now = Date.now()
  if (now - last < MIN_GAP_MS) return
  last = now
  listeners.forEach(fn => { try { fn() } catch { /* one failing screen must not stop the others */ } })
}

function start() {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('focus', fire)
  document.addEventListener('visibilitychange', fire)
  setInterval(fire, EVERY_MS)
}

// Subscribes fn; returns the unsubscribe function, so it can be returned straight from useEffect
export function onLiveRefresh(fn) {
  start()
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
