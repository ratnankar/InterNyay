import { caseCourtParts } from '../../constants/courts'
import { MISC_DISPOSED } from '../../constants/data'
import { formatDisplayDate } from '../../utils/dateUtils'

// Short summary of a misc. application on its card: label above value, same look as the case cards
export default function MiscSummaryFields({ app: a }) {
  const { district, court } = caseCourtParts({ court: a.court, district: a.district })

  const rows = [
    { label: 'Case', value: a.caseTitle },
    { label: 'Case No', value: a.caseNo || '—', always: true },
    { label: 'CNR No', value: a.portalSynced ? a.cnrNo : '' },
    { label: 'Court No', value: a.portalSynced && a.courtNo ? a.courtNo : '' },
    { label: 'Cause List No', value: a.portalSynced && a.causeListNo != null && a.listingDate === a.hearingDate ? a.causeListNo : '' },
    { label: 'Client', value: a.clientName },
    { label: 'Court', value: court },
    { label: 'District', value: district },
    { label: 'Filing Date', value: a.filingDate ? formatDisplayDate(a.filingDate) : '' },
    { label: 'Disposed On', value: a.status === MISC_DISPOSED && a.disposedOn ? formatDisplayDate(a.disposedOn) : '' },
  ].filter(f => f.always || (f.value !== '' && f.value != null))

  return (
    <div className="case-summary-fields">
      <dl className="case-summary-fields__col">
        {rows.map(f => (
          <div key={f.label} className="case-summary-fields__row">
            <dt className="case-summary-fields__label">{f.label}</dt>
            <dd className="case-summary-fields__value">{f.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
