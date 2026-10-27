import { useEffect, useState } from 'react'

// Current time that re-renders the component every 30 seconds, so time based views (5 PM and 12 AM switches) change without a page reload
export default function useClockTick() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000)
    const onVisible = () => { if (!document.hidden) setNow(new Date()) }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [])
  return now
}
