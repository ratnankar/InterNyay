import { useSyncExternalStore } from 'react'

// One shared place that knows which actions (save, upload, refresh, import ...) are running right now, so a button
// stays unavailable until ITS action has really finished, wherever the person went meanwhile:
//   - switching to another case or page and coming back  -> the running calls are kept here, not in the page
//   - refreshing the page or opening the app in a second tab/window -> the server is asked which actions of this account
//     are still running (the server keeps working on a call even when the page that sent it is gone)
// An action is named by method + address + query (never the body): "POST /cases/12/cause-list/refresh?date=2026-11-05".
// The same name is made on the server (InFlightRegistry.actionName), so both sides agree.

// Calls this page started and has not seen finish yet: name -> how many
const local = new Map()
// Calls the server reported as running (covers calls started before a refresh or from another tab/device)
let server = new Set()

const listeners = new Set()
// Bumped on every change, so a component that checks many records in a loop can re-render when anything changes
let version = 0
let busyFlag = false

// Slow jobs (reading eCourts or a court website, imports, admin runs). They lock only their own button (useBusy / useBusyPath),
// not every Save button of the app while they run
const SLOW = /\/(refresh-hearing|cause-list\/refresh|order\/fetch|cnr\/|cause-list-relay|judges-on-leave\/refresh|schedulers\/[^/]+\/run|chat\/eval|chat\/knowledge\/reload)/

const isSave = key => !SLOW.test(key)

function emit() {
  version += 1
  const flag = [...local.keys()].some(isSave) || [...server].some(isSave)
  if (typeof document !== 'undefined' && flag !== busyFlag) {
    busyFlag = flag
    // Gold Save buttons look busy and cannot be clicked while any save is running (styles/pages/landingcards.css)
    document.body.classList.toggle('is-saving', flag)
  }
  listeners.forEach(l => l())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// "POST", "/cases/12/x", { date: '2026-11-05', empty: '' } -> "POST /cases/12/x?date=2026-11-05"
export function actionKey(method, path, params) {
  let pathname = String(path || '')
  const pairs = []
  const q = pathname.indexOf('?')
  if (q >= 0) {
    new URLSearchParams(pathname.slice(q + 1)).forEach((v, k) => { if (v !== '') pairs.push(`${k}=${v}`) })
    pathname = pathname.slice(0, q)
  }
  if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1)
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') pairs.push(`${k}=${v}`)
    })
  }
  pairs.sort()
  return `${String(method).toUpperCase()} ${pathname}${pairs.length ? `?${pairs.join('&')}` : ''}`
}

// A call started on this page
export function beginAction(key) {
  local.set(key, (local.get(key) || 0) + 1)
  emit()
}

// A call finished on this page (success or failure). Whatever the server said earlier about it is out of date now
export function endAction(key) {
  const n = (local.get(key) || 0) - 1
  if (n > 0) local.set(key, n)
  else local.delete(key)
  if (n <= 0 && server.has(key)) server = new Set([...server].filter(k => k !== key))
  emit()
}

export function isActionBusy(key) {
  return local.has(key) || server.has(key)
}

// True while any running action (any method) is on this address or below it, e.g. "/hearings/5" covers the hearing's save,
// delete and order calls, and "/cases/12" everything started on that case. The query part is ignored
export function isActionBusyPath(path) {
  if (!path) return false
  const base = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
  const hit = k => {
    const rest = k.slice(k.indexOf(' ') + 1)
    return rest === base || rest.startsWith(`${base}/`) || rest.startsWith(`${base}?`)
  }
  for (const k of local.keys()) if (hit(k)) return true
  for (const k of server) if (hit(k)) return true
  return false
}

// --- Asking the server ---------------------------------------------------------------------------------------------

let fetcher = null
let timer = null
let syncing = false
// While the server still lists something, ask again at this pace until it is gone
const POLL_MS = 2500

async function syncFromServer() {
  if (!fetcher || syncing) return
  syncing = true
  try {
    const list = await fetcher()
    if (Array.isArray(list)) {
      // A call this page is itself still running is already known; the server list only adds what this page cannot know
      server = new Set(list.filter(k => typeof k === 'string'))
      emit()
    }
  } catch {
    // Not signed in or server unreachable: keep what is known
  } finally {
    syncing = false
    clearTimeout(timer)
    // Poll only for calls this page did not start itself (those finish through endAction)
    if ([...server].some(k => !local.has(k))) timer = setTimeout(syncFromServer, POLL_MS)
  }
}

// Called once by services/api.js with the function that loads the running actions of the signed-in account
export function startServerSync(load) {
  fetcher = load
  if (typeof window === 'undefined') return
  const ask = () => { if (localStorage.getItem('internyay_token')) syncFromServer() }
  ask()
  // Coming back to the tab, a page restored from the back/forward cache, or the network returning
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ask() })
  window.addEventListener('focus', ask)
  window.addEventListener('pageshow', ask)
  window.addEventListener('online', ask)
  // Another tab of this app signed in or started something
  window.addEventListener('storage', e => { if (e.key === 'internyay_token' || e.key === 'internyay_busy_ping') ask() })
}

// Lets other tabs know something started, so they ask the server right away instead of waiting for a focus
export function pingOtherTabs() {
  try { localStorage.setItem('internyay_busy_ping', String(Date.now())) } catch { /* storage unavailable */ }
}

// --- React -----------------------------------------------------------------------------------------------------------

// true while the action (method + address + params, not the body) is running anywhere
export function useBusy(method, path, params) {
  const key = actionKey(method, path, params)
  return useSyncExternalStore(subscribe, () => isActionBusy(key), () => false)
}

// true while anything is running on this address or below it (see isActionBusyPath)
export function useBusyPath(path) {
  return useSyncExternalStore(subscribe, () => isActionBusyPath(path), () => false)
}

// Re-renders the component whenever anything starts or finishes; use with isActionBusy / isActionBusyPath inside loops
export function useBusyTick() {
  return useSyncExternalStore(subscribe, () => version, () => 0)
}
