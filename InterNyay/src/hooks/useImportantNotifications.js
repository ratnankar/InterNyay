import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'

// How often to check the server for new important notifications
const POLL_MS = 10_000

// Polls for "important" admin notifications and queues them so they can be shown one by one as popups
export default function useImportantNotifications(enabled) {
  // Popups waiting to be shown, oldest first
  const [queue, setQueue] = useState([])

  // Ids the user already closed, so they don't pop up again before the server marks them read
  const dismissedRef = useRef(new Set())

  // Fetch pending notifications, drop dismissed ones and merge new ones into the queue without reordering the existing ones
  const poll = useCallback(async () => {
    try {
      const data = await api.notifications.pendingImportant()
      const fresh = (Array.isArray(data) ? data : []).filter(n => !dismissedRef.current.has(n.id))
      const freshById = new Map(fresh.map(n => [n.id, n]))

      // Keep the ones still pending (with fresh data) and add any new arrivals at the end
      setQueue(prev => {
        const kept = prev.filter(n => freshById.has(n.id)).map(n => freshById.get(n.id))
        const keptIds = new Set(kept.map(n => n.id))
        return [...kept, ...fresh.filter(n => !keptIds.has(n.id))]
      })
    // Polling is best-effort; ignore network errors and try again next tick
    } catch {
    }
  }, [])

  // Start polling when enabled (user logged in) and also poll when the tab becomes visible again
  useEffect(() => {
    if (!enabled) {
      setQueue([])
      return undefined
    }

    poll()
    // Skip polling while the tab is hidden to save requests
    const timer = setInterval(() => { if (!document.hidden) poll() }, POLL_MS)
    // Check again when the tab becomes visible
    const onVisible = () => { if (!document.hidden) poll() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, poll])

  // Remove the popup locally right away and tell the backend it was seen
  const dismiss = useCallback((id) => {
    dismissedRef.current.add(id)
    setQueue(q => q.filter(n => n.id !== id))
    api.notifications.dismiss(id).catch(() => {})
  }, [])

  // current = popup to show now, remaining = how many are still queued
  return { current: queue[0] || null, remaining: queue.length, dismiss }
}
