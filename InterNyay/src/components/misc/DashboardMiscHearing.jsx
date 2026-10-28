import { Fragment, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { navToPath } from '../../routes/paths'
import { caseCourtParts, roomLabel } from '../../constants/courts'
import { formatDisplayDate } from '../../utils/dateUtils'
import Icon from '../common/Icon'
import { isDisposed, statusSlug } from './miscUtils'
import MiscHearingPanel from './MiscHearingPanel'

// One misc. application with a hearing on the selected date. It shows the application's own details, not the case's
export default function DashboardMiscHearing({ app, dateKey, caseItem }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const disposed = isDisposed(app)
  // Listed for a later date now (or disposed off), so this date is a past one
  const heard = disposed || app.hearingDate !== dateKey
  const { district, court } = caseCourtParts({ court: app.court, district: app.district })
  const dash = v => (v === '' || v == null ? '—' : v)
  // Same table as the case's details: label and value, two pairs to a row
  const fields = [
    ['Application', app.applicationType],
    ['Status', disposed && app.disposalOutcome ? `${app.status} - ${app.disposalOutcome}` : app.status],
    ['Case', app.caseTitle],
    ['Case No', app.caseNo],
    ['Client', app.clientName],
    ['Court', court],
    ['District', district],
    ['Filing Date', app.filingDate ? formatDisplayDate(app.filingDate) : ''],
    ...(disposed ? [['Disposed Off On', app.disposedOn ? formatDisplayDate(app.disposedOn) : '']] : []),
  ].map(([label, value]) => ({ label, value: dash(value) }))
  const pairRows = list => list.reduce((rows, f, i) => (i % 2 ? (rows[rows.length - 1].push(f), rows) : [...rows, [f]]), [])
  const caseLine = [app.caseTitle, app.caseNo].filter(Boolean).join(' • ')

  return (
    <div className={`hearing-card hearing-card--misc${open ? ' hearing-card--expanded' : ''}`}>
      <div className="hearing-row" onClick={() => setOpen(v => !v)}>
        <div className="hearing-row__bar hearing-row__bar--misc" />

        <div className="hearing-row__body">
          <div className="hearing-row__heading">
            <p className="hearing-row__title">
              <span className="hearing-row__caret">{open ? '▾' : '▸'}</span>
              {app.applicationType}
            </p>
            <span className={`misc-status misc-status--${statusSlug(app.status)}`}>{app.status}</span>
            {disposed && app.disposalOutcome && (
              <span className={`misc-status misc-status--${statusSlug(app.disposalOutcome)}`}>{app.disposalOutcome}</span>
            )}
            <span className="badge badge--nature">Misc. Application</span>
          </div>
          {!open && (
            <div className="hearing-row__chips">
              {caseItem?.courtNo && <span className="hearing-row__court-no" title="Court number">Court No. {caseItem.courtNo}</span>}
              {caseItem && roomLabel(caseItem) && <span className="hearing-row__file-no" title="Building and floor">{roomLabel(caseItem)}</span>}
              {caseItem?.fileNo && <span className="hearing-row__file-no" title="File number">File No. {caseItem.fileNo}</span>}
            </div>
          )}
          {caseLine && <p className="hearing-row__meta">Filed in: <strong>{caseLine}</strong></p>}
        </div>

        <div className="hearing-row__side" data-no-compact>
          {heard && <span className="hearing-row__past" title="Heard on this date">Heard</span>}
        </div>
      </div>

      {open && (
        <div className="hearing-card__detail">
          <table className="case-fields">
            <tbody>
              {pairRows(fields).map((pair, i) => (
                <tr key={i}>
                  {pair.map(f => (
                    <Fragment key={f.label}>
                      <th scope="row" className="case-fields__label">{f.label}</th>
                      <td className="case-fields__value" colSpan={pair.length === 1 ? 3 : 1}>{f.value}</td>
                    </Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <MiscHearingPanel app={app} />

          <div className="hearing-card__footer">
            <button type="button" className="btn-outline btn-outline--sm hearing-card__open"
              onClick={e => { e.stopPropagation(); navigate(navToPath('miscapps'), { state: { openId: app.id } }) }}>
              Open Application <Icon name="arrow-right" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
