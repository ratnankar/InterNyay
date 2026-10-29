import { Fragment } from 'react'
import { useCourts, caseCourtParts, roomLabel } from '../../constants/courts'
import { caseClientLabels } from '../../utils/caseClients'
import { nonClientsOf, opponentsOf, partyText } from '../../utils/caseParties'
import { caseNatureOf } from '../../utils/caseClassification'
import { formatDisplayDate } from '../../utils/dateUtils'
import useLastHearingDate from '../../hooks/useLastHearingDate'
import { formatCurrency } from '../../utils/formatUtils'

// Detail rows of a case, with an optional hearing
export default function CaseFields({ caseItem: c, clients = [], hearing = null, showParties = true, withLastHearing = false, hearingDate = '' }) {
  useCourts()
  const lastHearingDate = useLastHearingDate(c.id, withLastHearing, hearingDate)
  // Split the case's court into district and court name
  const { district, court } = caseCourtParts(c)
  // Building and floor of the court room
  const building = roomLabel(c)
  // Names of the clients linked to this case
  const clientNames = caseClientLabels(c, clients)

  const nature = caseNatureOf(c)
  // Relief sought; caseType is hidden when it just repeats the relief
  const relief = c.reliefSought || ''
  const caseType = c.caseType && c.caseType.toLowerCase() !== relief.toLowerCase() ? c.caseType : ''

  // True when this table is shown for a hearing row instead of the case itself
  const isHearing = !!hearing
  // Hearing-specific details override the case's own judge where present
  const causeListNo = hearing?.causeListNo
  const judge = hearing?.judgeName || c.judgeName

  // Small helper to build a label/value row for the table
  const row = (label, value, opts = {}) => ({ label, value, ...opts })

  // People on our side who are not saved as clients, with their role
  const nonClients = nonClientsOf(c).map(n => (n.subType ? `${n.name} (${n.subType})` : n.name))
  // One opposite party keeps the separate rows; several are listed in one row, numbered
  const opponents = opponentsOf(c)
  const opponentRows = opponents.length > 1
    ? [row('Opposite Parties', opponents.map((o, i) => `${i + 1}. ${partyText(o)}`).join('\n'), { multiline: true })]
    : [
        row('Opposite Party', opponents[0]?.name || c.opposingParty),
        row("Father's Name",  opponents[0]?.fatherName),
        row('Address',        opponents[0]?.address),
        row('Phone',          opponents[0]?.phone),
      ]

  // Court No, cause list number and judge rows for a hearing
  const hearingRows = [
    row('Court No',       c.courtNo),
    row('Building',       building),
    row('Cause List No',  causeListNo != null && causeListNo !== '' ? causeListNo : ''),
    row('Judge',          judge),
  ]

  // Main case details table; empty values are filtered out when rendering
  const fields = [
    ...(isHearing ? [] : [row('Case Nature', nature)]),
    row('Relief Sought', relief),
    ...(isHearing ? [] : [row('Case Type', caseType)]),
    row('Case No',       c.caseNo || '—', { always: true }),
    ...(isHearing ? hearingRows : []),
    row('File No',       c.fileNo),
    row('CNR No',        c.cnrNo, { mono: true }),
    row('Filing Date',   c.filingDate ? formatDisplayDate(c.filingDate) : ''),
    row('Registration Date', c.registrationDate ? formatDisplayDate(c.registrationDate) : ''),
    row('First Hearing',  c.firstHearingDate ? formatDisplayDate(c.firstHearingDate) : ''),
    row('Last Hearing',   lastHearingDate ? formatDisplayDate(lastHearingDate) : ''),
    row('Case Stage',    c.caseStage),
    // A police challan case keeps the same text in Section (firSection) and Acts & Sections, so only Acts & Sections is shown
    // (older cases with just the challan Section fall back to it)
    row('Acts & Sections', c.actsSections || c.firSection),
    row('District',      district),
    row('Court',         court),
    ...(isHearing ? [] : [
      row('Court No',    c.courtNo),
      row('Building',    building),
      row('Judge',       judge),
    ]),
    row('Decision Date',  c.decisionDate ? formatDisplayDate(c.decisionDate) : ''),
    row('Nature of Disposal', c.disposalNature),
    row('FIR No',         c.firNo),
    row('Police Station', c.policeStation),
    ...(showParties ? [
      row(clientNames.length > 1 ? 'Clients' : 'Client', clientNames.join(', '), { always: true }),
      row(nonClients.length > 1 ? 'Non-clients' : 'Non-client', nonClients.join(', ')),
      ...opponentRows,
    ] : []),
    row('Description',    c.description, { multiline: true }),
  ].filter(f => f.always || (f.value !== '' && f.value != null))

  // Extra rows for cheque bounce cases; only filled-in ones are kept
  const chequeFields = [
    row('Cheque No',       c.chequeNo),
    row('Cheque Date',     c.chequeDate ? formatDisplayDate(c.chequeDate) : ''),
    row('Memo Date',       c.memoDate ? formatDisplayDate(c.memoDate) : ''),
    row('Bouncing Reason', c.bouncingReason),
    row('Claim Amount',    c.claimAmount != null && c.claimAmount !== '' ? formatCurrency(c.claimAmount) : ''),
    row('Notice Date',     c.noticeDate ? formatDisplayDate(c.noticeDate) : ''),
  ].filter(f => f.value !== '' && f.value != null)

  // Group rows two per line so the table is compact
  const pairRows = list => {
    const rows = []
    let pending = null

    list.forEach(f => {
      if (f.multiline) {
        if (pending) { rows.push([pending]); pending = null }
        rows.push([f])
      } else if (pending) {
        rows.push([pending, f])
        pending = null
      } else {
        pending = f
      }
    })
    if (pending) rows.push([pending])

    return rows
  }

  // Render a list of fields as a two-column-pair table
  const renderTable = list => (
    <table className="case-fields">
      <tbody>
        {pairRows(list).map((pair, i) => (
          <tr key={i}>
            {pair.map(f => {
              const empty = f.value === '' || f.value == null
              const cls = [
                'case-fields__value',
                f.mono && 'case-fields__value--mono',
                f.multiline && 'case-fields__value--multiline',
              ].filter(Boolean).join(' ')

              const stretch = pair.length === 1

              return (
                <Fragment key={f.label}>
                  <th scope="row" className="case-fields__label">{f.label}</th>
                  <td className={cls} colSpan={stretch ? 3 : 1}>{empty ? '—' : f.value}</td>
                </Fragment>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <>
      {renderTable(fields)}
      {chequeFields.length > 0 && (
        <>
          <p className="case-fields__section-title">Cheque Dishonour Details (Sec 138 NI Act)</p>
          {renderTable(chequeFields)}
        </>
      )}
    </>
  )
}