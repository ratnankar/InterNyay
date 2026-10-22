import { useSyncExternalStore } from 'react'

let pending = new Set()
const listeners = new Set()

function emit() {
  pending = new Set(pending)
  listeners.forEach(fn => fn())
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function snapshot() {
  return pending
}

export function beginOrderTask(id) {
  if (pending.has(id)) return false
  pending.add(id)
  emit()
  return true
}

export function endOrderTask(id) {
  if (!pending.delete(id)) return
  emit()
}

export function usePendingOrders() {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
