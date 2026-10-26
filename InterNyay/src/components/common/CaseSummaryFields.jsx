import { useCourts, caseCourtParts, roomLabel } from '../../constants/courts'
import { caseNatureOf } from '../../utils/caseClassification'
import { formatDisplayDate } from '../../utils/dateUtils'

// Short summary of a case in three columns: the case itself, the court and parties, and relief and numbers
export default function CaseSummaryFields({ caseItem: c }) {
  useCourts()
  // Split the case's court into district and court name
  const { district, court } = caseCourtParts(c)
  const building = roomLabel(c)

  // Small helper to build a label/value row for the summary
  const row = (label, value, opts = {}) => ({ label, value, ...opts })

  // Empty rows are skipped unless marked always
  const shown = rows => rows.filter(f => f.always || (f.value !== '' && f.value != null))

  const columns = [
    shown([
      row('Case Nature', caseNatureOf(c)),
      row('Case Type',   c.caseType),
      row('File No',     c.fileNo),
      row('Filing Date', c.filingDate ? formatDisplayDate(c.filingDate) : ''),
    ]),
    shown([
      row('District',       district),
      row('Court',          court),
      row('Court No',       c.courtNo),
      row('Building',       building),
      row('Opposite Party', c.opposingParty),
    ]),
    shown([
      row('Relief Sought', c.reliefSought),
      row('Case No',       c.caseNo || '—', { always: true }),
      row('CNR No',        c.cnrNo, { mono: true }),
      row('Case Stage',    c.caseStage),
    ]),
  ].filter(col => col.length > 0)

  return (
    <div className="case-summary-fields">
      {columns.map((col, i) => (
        <dl key={i} className="case-summary-fields__col">
          {col.map(f => {
            const empty = f.value === '' || f.value == null
            const cls = ['case-summary-fields__value', f.mono && 'case-summary-fields__value--mono']
              .filter(Boolean).join(' ')

            return (
              <div key={f.label} className="case-summary-fields__row">
                <dt className="case-summary-fields__label">{f.label}</dt>
                <dd className={cls}>{empty ? '—' : f.value}</dd>
              </div>
            )
          })}
        </dl>
      ))}
    </div>
  )
}
