import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'
import { getErrorMessage } from '../utils/errorMessages'

// How often to check whether notifications changed on the server
const POLL_MS = 5_000

// Loads court notifications (optionally filtered by source) and auto-refreshes when the server reports a change
export default function useNotifications(initialSource = 'All') {
  // Selected source filter ('All' means no filter)
  const [source, setSource] = useState(initialSource)
  // Notifications currently shown
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Last change "stamp" seen from the server; a different stamp means new data is available
  const stampRef = useRef(null)
  // Counter used to ignore responses from older, outdated requests
  const requestRef = useRef(0)

  // Fetch the list. silent = background refresh without spinner or error flash
  const load = useCallback(async ({ silent = false, knownStamp } = {}) => {
    // Tag this request so a slow earlier response can't overwrite a newer one
    const requestId = ++requestRef.current
    if (!silent) {
      setLoading(true)
      setError('')
    }
    try {
      if (knownStamp !== undefined) {
        stampRef.current = knownStamp
      } else {
        try {
          // Read the current stamp first so the next poll can tell if anything changed
          stampRef.current = (await api.notifications.stamp())?.stamp ?? null
        } catch {
          stampRef.current = null
        }
      }

      const data = await api.notifications.list(
        source === 'All' ? undefined : { source }
      )
      // A newer request has started, so discard this result
      if (requestId !== requestRef.current) return
      setItems(Array.isArray(data) ? data : [])
      setError('')
    } catch (err) {
      if (requestId !== requestRef.current) return
      stampRef.current = null
      if (!silent) {
        setItems([])
        setError(getErrorMessage(err, 'Could not load notifications.'))
      }
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }, [source])

  // Manual reload for a refresh button
  const refetch = useCallback(() => load(), [load])

  // Initial load and reload whenever the source filter changes
  useEffect(() => {
    load()
  }, [load])

  // Poll the lightweight stamp endpoint and only reload the full list when the stamp changes
  useEffect(() => {
    let cancelled = false

    // Skip while the tab is hidden
    const check = async () => {
      if (document.hidden) return
      try {
        const stamp = (await api.notifications.stamp())?.stamp ?? null
        if (cancelled || stamp === null) return
        if (stamp !== stampRef.current) load({ silent: true, knownStamp: stamp })
      } catch {
      }
    }

    // Run the check every few seconds
    const timer = setInterval(check, POLL_MS)
    // Check again when the tab becomes visible
    const onVisible = () => { if (!document.hidden) check() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  // Everything the notifications page needs
  return { source, setSource, items, loading, error, refetch }
}
