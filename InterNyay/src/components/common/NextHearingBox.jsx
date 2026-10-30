import { useState } from 'react'
import { formatDisplayDate, hearingBoxPhase, hearingCountdown } from '../../utils/dateUtils'
import useClockTick from '../../hooks/useClockTick'
import Icon from './Icon'

// The "Next Hearing" box on a case / misc. application card.
// - normally: calendar icon, date and countdown
// - on the hearing day after 5 PM: the same, plus a refresh symbol
// - from 12 AM, when the date was not updated: the old date is removed and only the refresh symbol is shown
// onRefresh may return a promise; the symbol spins until it settles.
export default function NextHearingBox({ date, onRefresh, refreshTitle = 'Refresh the next hearing date' }) {
  const now = useClockTick()
  const [busy, setBusy] = useState(false)
  const phase = hearingBoxPhase(date, now)
  const cd = phase === 'normal' || phase === 'refresh' ? hearingCountdown(date) : null

  async function refresh(e) {
    e.stopPropagation()
    if (busy || !onRefresh) return
    setBusy(true)
    try { await onRefresh() } finally { setBusy(false) }
  }

  const refreshButton = phase !== 'normal' && onRefresh && (
    <button type="button"
      className={`case-card__hearing-refresh${busy ? ' case-card__hearing-refresh--busy' : ''}`}
      title={refreshTitle}
      aria-label={refreshTitle}
      disabled={busy}
      onClick={refresh}
      onKeyDown={e => e.stopPropagation()}
    >
      <Icon name="refresh" />
    </button>
  )

  if (phase !== 'normal' && onRefresh) {
    return (
      <div className="case-card__hearing case-card__hearing--update">
        <span className="case-card__hearing-icon" aria-hidden="true"><Icon name="calendar" /></span>
        <div className="case-card__hearing-text">
          <p className="case-card__hearing-label">Next Hearing</p>
          <div className="case-card__hearing-update">{refreshButton}</div>
        </div>
      </div>
    )
  }

  if (phase === 'expired') {
    return (
      <div className="case-card__hearing case-card__hearing--expired">
        {refreshButton}
      </div>
    )
  }

  return (
    <div className="case-card__hearing">
      <span className="case-card__hearing-icon" aria-hidden="true"><Icon name="calendar" /></span>
      <div className="case-card__hearing-text">
        <p className="case-card__hearing-label">Next Hearing</p>
        <p className="case-card__hearing-date">{formatDisplayDate(date)}</p>
        {cd && <p className={`case-card__hearing-when case-card__hearing-when--${cd.tone}`}>{cd.text}</p>}
      </div>
      {refreshButton}
    </div>
  )
}
