import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import api from '../services/api'
import { onLiveRefresh } from '../utils/liveRefresh'

// Misc. applications that have a hearing on a date (yyyy-MM-dd), for the dashboard. Reloads when hearings change
export default function useMiscHearingsOn(dateKey) {
  const { hearingsVersion } = useApp()
  const [apps, setApps] = useState([])

  useEffect(() => {
    let cancelled = false
    // quiet: a failed background reload keeps what is shown
    const load = quiet => api.miscApplications.onDate(dateKey)
      .then(rows => { if (!cancelled) setApps(Array.isArray(rows) ? rows : []) })
      .catch(() => { if (!cancelled && !quiet) setApps([]) })
    load(false)
    // Looks again when the tab is back in view and every few minutes, for changes made on another device
    const stopLive = onLiveRefresh(() => { load(true) })
    return () => { cancelled = true; stopLive() }
  }, [dateKey, hearingsVersion])

  return apps
}
