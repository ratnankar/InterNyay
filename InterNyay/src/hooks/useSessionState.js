import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { sessionStore } from '../utils/sessionStore'

export default function useSessionState(name, initial) {
  const { currentUser } = useApp()
  const key = `${currentUser?.id ?? 'guest'}:${name}`
  const [value, setValue] = useState(() => (sessionStore.has(key) ? sessionStore.get(key) : initial))

  useEffect(() => {
    sessionStore.set(key, value)
  }, [key, value])

  return [value, setValue]
}
