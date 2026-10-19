import { useState } from 'react'
import { formatDisplayDate } from '../../utils/dateUtils'
import Icon from '../common/Icon'
import MiscNextHearingModal from './MiscNextHearingModal'

// The next hearing date of one misc. application with its own Update button, which opens the Update Next Hearing window. The date of the application is kept apart
// from the case's own next hearing date, so changing one never changes the other.
// showName puts the application's name in front (used in the case page, where several applications are listed)
export default function MiscHearingUpdate({ app, onChange, showName = false, showLabel = true }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {showName && <span className="misc-hearing__name">{app.applicationType}</span>}

      {/* Same block as the case's Next Hearing */}
      <div className="hearing-history__next">
        {showLabel && <span className="hearing-history__next-label">Next Hearing</span>}
        <strong className="hearing-history__next-date">{app.hearingDate ? formatDisplayDate(app.hearingDate) : '—'}</strong>
        <button type="button" className="btn-outline btn-outline--sm" onClick={() => setOpen(true)}>
          <Icon name="edit" /> {app.hearingDate ? 'Update' : 'Add date'}
        </button>
      </div>

      {/* The window is drawn elsewhere on the page, but its clicks must not reach the card this sits in */}
      {open && (
        <div onClick={e => e.stopPropagation()}>
          <MiscNextHearingModal app={app} onChange={onChange} onClose={() => setOpen(false)} />
        </div>
      )}
    </>
  )
}
