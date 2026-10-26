import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { needsNextHearingUpdate } from '../../utils/hearingSync'
import Icon from './Icon'

// Refresh button that asks eCourts for the new next hearing date of a case. It shows only while the date is over (from
// 6 PM on the hearing day, for an open case with a CNR) and goes away by itself once the case gets a later date.
//  fallback - what to show instead while the date is NOT over (the card passes its date and countdown here, so the date
//             is replaced by the button when it has passed and comes back with the new date)
//  hint     - small text next to the button
export default function SyncNextHearingButton({ caseItem, fallback = null, hint = '' }) {
  const { syncNextHearing } = useApp()
  const [busy, setBusy] = useState(false)
  // Re-checked every minute, so the button appears at 6 PM without a reload
  const [, tick] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => tick(n => n + 1), 60_000)
    return () => clearInterval(timer)
  }, [])

  if (!needsNextHearingUpdate(caseItem)) return fallback

  async function run(e) {
    // The card opens and closes on click: this button must not toggle it
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try { await syncNextHearing(caseItem.id) } finally { setBusy(false) }
  }

  return (
    <span className="sync-next">
      <button type="button" className="btn-refresh" onClick={run} disabled={busy}
        title="Update next date from eCourts" aria-label="Update next date from eCourts">
        <Icon name="refresh" className={busy ? 'icon--spin' : ''} />
      </button>
      {hint && <span className="sync-next__hint">{hint}</span>}
    </span>
  )
}
