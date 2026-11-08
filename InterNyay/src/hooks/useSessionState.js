import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { sessionStore } from '../utils/sessionStore'

// Search text, opened cards and other short-lived screen state: kept while moving between pages of the app,
// forgotten on a reload or sign-out
export default function useSessionState(name, initial) {
  const { currentUser } = useApp()
  const key = `${currentUser?.id ?? 'guest'}:${name}`
  const [value, setValue] = useState(() => (sessionStore.has(key) ? sessionStore.get(key) : initial))

  // Another account took over while this screen stayed mounted: show that account's value, do not write the old one over it
  const loadedKey = useRef(key)
  useEffect(() => {
    if (loadedKey.current === key) return
    loadedKey.current = key
    setValue(sessionStore.has(key) ? sessionStore.get(key) : initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    if (loadedKey.current !== key) return
    sessionStore.set(key, value)
  }, [key, value])

  return [value, setValue]
}
