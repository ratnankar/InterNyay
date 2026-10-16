import { useCourts, courtDistrictLabel } from '../../constants/courts'
import { useState } from 'react'
import HearingLink from './HearingLink'

import Icon from './Icon'
// How many jurisdiction chips show before the "show more" toggle
const COLLAPSED_CHIPS = 6

// Turn a comma separated string into a clean list
function splitList(value) {
  return String(value || '').split(',').map(s => s.trim()).filter(Boolean)
}

// Judge's photo, or a placeholder icon when there is none
function JudgePhoto({ src, name }) {
  if (src) return <img className="judge-card__photo" src={src} alt={name} />
  return <div className="judge-card__photo judge-card__photo--empty" aria-hidden="true"><Icon name="scale" /></div>
}

// One label and value row inside the card
function Field({ label, children }) {
  return (
    <div className="judge-card__field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

// Card for one judge, with a collapsible list of jurisdiction chips
export default function JudgeCard({ judge, actions, tags, note }) {
  useCourts()
  // Whether all jurisdiction chips are expanded
  const [showAll, setShowAll] = useState(false)

  // Jurisdiction (police stations) as a list
  const stations = splitList(judge.jurisdiction)
  // Chips currently visible; hidden is how many are still collapsed
  const shown = showAll ? stations : stations.slice(0, COLLAPSED_CHIPS)
  const hidden = stations.length - shown.length
  // A court with no judge for now (between two transfers)
  const vacant = !!judge.vacant

  return (
    <article className={`judge-card${vacant ? ' judge-card--vacant' : ''}`}>
      <header className="judge-card__head">
        <JudgePhoto src={vacant ? '' : judge.photo} name={judge.name} />
        <div className="judge-card__id">
          <h3 className="judge-card__name">{vacant ? 'No judge at present' : judge.name}</h3>
          {judge.designation && <p className="judge-card__designation">{judge.designation}</p>}
          {judge.court && <p className="judge-card__court">{courtDistrictLabel(judge.court, judge.district)}</p>}
          {(vacant || judge.mahilaCourt || tags) && (
            <div className="judge-card__tags">
              {vacant && <span className="qa-tag qa-tag--vacant">Vacant court</span>}
              {judge.mahilaCourt && <span className="qa-tag qa-tag--muted">Mahila court</span>}
              {tags}
            </div>
          )}
        </div>
      </header>

      {note && <div className="judge-card__note">{note}</div>}

      <dl className="judge-card__fields">
        {judge.courtRoomNo && <Field label="Court No.">{judge.courtRoomNo}</Field>}
        {judge.building && <Field label="Building">{judge.building}</Field>}
        {judge.vcMeetingId && <Field label="VC Meeting ID">{judge.vcMeetingId}</Field>}

        {judge.courtEmail && (
          <Field label="Court Email ID">
            <a className="qa-link" href={`mailto:${judge.courtEmail}`}>{judge.courtEmail}</a>
          </Field>
        )}

        {judge.virtualCourtLink && (
          <Field label="Virtual Court Hearing">
            <HearingLink href={judge.virtualCourtLink} />
          </Field>
        )}

        {(judge.courtReaderName || judge.courtReaderMobile) && (
          <Field label="Court Reader">
            <span className="qa-cell-stack">
              {judge.courtReaderName && <span>{judge.courtReaderName}</span>}
              {judge.courtReaderMobile && (
                <a className="qa-link" href={`tel:${judge.courtReaderMobile.replace(/[\s-]/g, '')}`}>
                  {judge.courtReaderMobile}
                </a>
              )}
            </span>
          </Field>
        )}

        {stations.length > 0 && (
          <Field label={`Jurisdiction (${stations.length})`}>
            <span className="qa-chips">
              {shown.map(s => <span key={s} className="qa-chip">{s}</span>)}
              {(hidden > 0 || showAll) && stations.length > COLLAPSED_CHIPS && (
                <button type="button" className="qa-chip qa-chip--toggle" onClick={() => setShowAll(v => !v)}>
                  {showAll ? 'Show less' : `+${hidden} more`}
                </button>
              )}
            </span>
          </Field>
        )}
      </dl>

      {actions && <footer className="judge-card__actions">{actions}</footer>}
    </article>
  )
}
