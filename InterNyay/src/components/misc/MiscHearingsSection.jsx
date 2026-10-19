import { MISC_APP_NAME } from '../../constants/data'
import useSessionState from '../../hooks/useSessionState'
import { isDisposed, statusSlug } from './miscUtils'
import MiscHearingPanel from './MiscHearingPanel'

// Expandable "Misc. Application Hearings" label above a case's hearing history: every application filed in the case,
// with its own next hearing date (updated here) and its own hearing history
export default function MiscHearingsSection({ caseId, apps, onChange }) {
  const [open, setOpen] = useSessionState(`misc_hearings_open_${caseId}`, false)

  if (!apps.length) return null

  return (
    <div className="misc-hearings">
      <button type="button" className="hearing-history__toggle" aria-expanded={open} onClick={() => setOpen(v => !v)}>
        <span className={`hearing-history__caret${open ? ' hearing-history__caret--open' : ''}`}>▸</span>
        {MISC_APP_NAME.short} Hearings ({apps.length})
      </button>

      {open && (
        <div className="misc-hearings__list">
          {apps.map(a => (
            <div key={a.id} className="misc-hearings__app">
              <div className="misc-hearings__head">
                <span className="misc-hearings__name">{a.applicationType}</span>
                <span className={`misc-status misc-status--${statusSlug(a.status)}`}>{a.status}</span>
                {isDisposed(a) && a.disposalOutcome && (
                  <span className={`misc-status misc-status--${statusSlug(a.disposalOutcome)}`}>{a.disposalOutcome}</span>
                )}
              </div>
              <MiscHearingPanel app={a} onChange={onChange} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
