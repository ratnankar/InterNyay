import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'

// Sort order, filters, chips, tabs and view settings are remembered per signed-in user in this browser,
// so they are still there after a reload, a sign-out or a visit to another page
function readStored(storageKey, initial, allowed) {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw === null) return initial
    const value = JSON.parse(raw)
    if (typeof allowed === 'function') return allowed(value) ? value : initial
    return !allowed || allowed.includes(value) ? value : initial
  } catch {
    return initial
  }
}

// usePersistedState(name, initial, allowed?)
//   allowed: an array of accepted values, or a function (value => boolean). A stored value that is no longer
//   accepted (an option that was removed, a hand-edited entry) falls back to `initial`.
// The value is read again when the account changes (so switching accounts shows that account's choices)
// and is kept in step across browser tabs.
export default function usePersistedState(name, initial, allowed) {
  const { currentUser } = useApp()
  const storageKey = `internyay_pref_${currentUser?.id ?? 'guest'}_${name}`
  const [value, setValue] = useState(() => readStored(storageKey, initial, allowed))

  // Latest `initial` / `allowed` without re-running the effects below when a caller passes a fresh array each render
  const latest = useRef({ initial, allowed })
  latest.current = { initial, allowed }

  // Account changed while this screen stays mounted: load that account's choice instead of writing the old one over it
  const loadedKey = useRef(storageKey)
  useEffect(() => {
    if (loadedKey.current === storageKey) return
    loadedKey.current = storageKey
    setValue(readStored(storageKey, latest.current.initial, latest.current.allowed))
  }, [storageKey])

  useEffect(() => {
    if (loadedKey.current !== storageKey) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(value))
    } catch {}
  }, [storageKey, value])

  // Another browser tab changed the same setting
  useEffect(() => {
    const onStorage = e => {
      if (e.key !== storageKey || e.newValue === null) return
      setValue(readStored(storageKey, latest.current.initial, latest.current.allowed))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [storageKey])

  // Back to the default (and forget the stored choice)
  const reset = useCallback(() => setValue(latest.current.initial), [])

  return [value, setValue, reset]
}
