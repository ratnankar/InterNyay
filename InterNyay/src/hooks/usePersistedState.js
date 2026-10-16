import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'

function readStored(storageKey, initial, allowed) {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw === null) return initial
    const value = JSON.parse(raw)
    return !allowed || allowed.includes(value) ? value : initial
  } catch {
    return initial
  }
}

export default function usePersistedState(name, initial, allowed) {
  const { currentUser } = useApp()
  const storageKey = `internyay_pref_${currentUser?.id ?? 'guest'}_${name}`
  const [value, setValue] = useState(() => readStored(storageKey, initial, allowed))

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value))
    } catch {
      return
    }
  }, [storageKey, value])

  return [value, setValue]
}
