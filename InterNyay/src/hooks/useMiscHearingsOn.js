import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import api from '../services/api'

// Misc. applications that have a hearing on a date (yyyy-MM-dd), for the dashboard. Reloads when hearings change
export default function useMiscHearingsOn(dateKey) {
  const { hearingsVersion } = useApp()
  const [apps, setApps] = useState([])

  useEffect(() => {
    let cancelled = false
    api.miscApplications.onDate(dateKey)
      .then(rows => { if (!cancelled) setApps(Array.isArray(rows) ? rows : []) })
      .catch(() => { if (!cancelled) setApps([]) })
    return () => { cancelled = true }
  }, [dateKey, hearingsVersion])

  return apps
}
