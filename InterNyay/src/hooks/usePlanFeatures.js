import { useEffect, useState } from 'react'
import { plansApi } from '../services/api'
import { useApp } from '../context/AppContext'

// Tells components which features the user's subscription plan includes
export default function usePlanFeatures() {
  const { loggedIn, currentUser, isAdmin } = useApp()
  // Feature keys allowed by the plan; null while unknown (everything stays allowed until we know)
  const [keys, setKeys] = useState(null)
  // Changes when a different user logs in, so features are reloaded
  const who = `${currentUser?.id ?? currentUser?.email ?? ''}:${currentUser?.planCode ?? ''}`
  // Fetch the plan's feature list after login; admins are not limited by plans
  useEffect(() => {
    if (!loggedIn || isAdmin) { setKeys(null); return }
    let cancelled = false
    plansApi.features().then(k => { if (!cancelled) setKeys(k) }).catch(() => { if (!cancelled) setKeys(null) })
    return () => { cancelled = true }
  }, [loggedIn, isAdmin, who])
  // can('feature_key') returns true if the plan includes it (or if plan info isn't loaded yet)
  return { keys, can: key => keys == null || keys.includes(key) }
}
