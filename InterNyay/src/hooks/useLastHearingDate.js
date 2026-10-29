import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import api from '../services/api'
import { formatDate } from '../utils/dateUtils'
import { isMiscOnlyHearing } from '../components/misc/miscUtils'

// before: when given (the date of the hearing being viewed), the last hearing is the latest one strictly before that date;
// otherwise it is the latest one up to today
export default function useLastHearingDate(caseId, enabled = true, before = '') {
  const { hearingsVersion } = useApp()
  const [date, setDate] = useState('')

  useEffect(() => {
    if (!enabled || !caseId) {
      setDate('')
      return undefined
    }

    let cancelled = false
    const today = formatDate(new Date())
    const inPast = before ? (d => d < before) : (d => d <= today)

    api.cases.hearings(caseId)
      .then(rows => {
        if (cancelled) return
        const dates = (Array.isArray(rows) ? rows : [])
          .filter(h => h?.date && !isMiscOnlyHearing(h) && inPast(h.date))
          .map(h => h.date)
          .sort()
        setDate(dates.length ? dates[dates.length - 1] : '')
      })
      .catch(() => { if (!cancelled) setDate('') })

    return () => { cancelled = true }
  }, [caseId, enabled, before, hearingsVersion])

  return date
}
