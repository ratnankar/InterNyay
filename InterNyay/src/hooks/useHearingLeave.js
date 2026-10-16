import { useEffect, useState } from 'react'
import api from '../services/api'
import { formatDate } from '../utils/dateUtils'

// How often (in ms) the judge / leave / cause-list details are re-fetched while the page is open
const REFRESH_MS = 10 * 60 * 1000

// Loads judge, leave and court-number details for the hearings listed on a given date, and keeps them fresh
export default function useHearingLeave(date, hearings) {
  // Hearing details keyed by case id
  const [infoByCase, setInfoByCase] = useState({})

  // The date as a string, used as a stable dependency for the effect below
  const dateKey = formatDate(date)
  // Compact fingerprint of the hearings (id, court, district, court no.) so we reload only when something relevant changes
  const signature = hearings
    .map(c => `${c.id}:${c.court}:${c.district}:${c.courtNo || ''}`)
    .join('|')
  // No hearings means nothing to fetch
  const needed = hearings.length > 0

  // Fetch on mount and whenever the date or hearings change, then refresh on a timer and when the tab becomes visible again
  useEffect(() => {
    if (!needed) {
      setInfoByCase({})
      return undefined
    }

    // Guards against setting state after the effect was cleaned up
    let alive = true

    // Calls the backend and turns the returned rows into a lookup map by case id
    function load() {
      api.cases.hearingLeave({ date: dateKey })
        .then(rows => {
          if (!alive) return
          const map = {}
          ;(Array.isArray(rows) ? rows : []).forEach(r => { map[r.caseId] = r })
          setInfoByCase(map)
        })
        .catch(err => {
          console.warn('Could not load hearing details (judge / leave / cause list no.):', err?.message || err)
        })
    }

    // Refresh as soon as the user returns to this tab
    function onVisible() {
      if (document.visibilityState === 'visible') load()
    }

    load()
    // Keep the data fresh while the page stays open
    const timer = setInterval(load, REFRESH_MS)
    document.addEventListener('visibilitychange', onVisible)

    // Cleanup: stop the timer and listener so nothing leaks
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [dateKey, signature, needed])

  // Components read this map to show judge / leave / court-no. next to each case
  return infoByCase
}
