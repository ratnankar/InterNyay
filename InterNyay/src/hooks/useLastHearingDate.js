import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import api from '../services/api'
import { formatDate } from '../utils/dateUtils'
import { isMiscOnlyHearing } from '../components/misc/miscUtils'

export default function useLastHearingDate(caseId, enabled = true) {
  const { hearingsVersion } = useApp()
  const [date, setDate] = useState('')

  useEffect(() => {
    if (!enabled || !caseId) {
      setDate('')
      return undefined
    }

    let cancelled = false
    const today = formatDate(new Date())

    api.cases.hearings(caseId)
      .then(rows => {
        if (cancelled) return
        const dates = (Array.isArray(rows) ? rows : [])
          .filter(h => h?.date && !isMiscOnlyHearing(h) && h.date <= today)
          .map(h => h.date)
          .sort()
        setDate(dates.length ? dates[dates.length - 1] : '')
      })
      .catch(() => { if (!cancelled) setDate('') })

    return () => { cancelled = true }
  }, [caseId, enabled, hearingsVersion])

  return date
}
