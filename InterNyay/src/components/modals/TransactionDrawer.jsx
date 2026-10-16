import { useApp } from '../../context/AppContext'
import useOverlayClose from '../../hooks/useOverlayClose'
import { formatDisplayDate } from '../../utils/dateUtils'
import { formatCurrency } from '../../utils/formatUtils'
import { feeTypeLabel } from '../../utils/feeUtils'

import Icon from '../common/Icon'
import ModalPortal from '../../components/common/ModalPortal'
// Side drawer with the fees and payments of one case
export default function TransactionDrawer() {
  // Cases and the fee actions come from AppContext
  const {
    cases,
    transactionCaseId,
    setTransactionCaseId,
    getCaseFeeSummary,
    toggleFeePaid,
    openEditFee,
    setInvoiceCaseId,
    sendPaymentReminder,
    whatsappBusy,
  } = useApp()

  // Close the drawer
  const close = () => setTransactionCaseId(null)
  // Closes the drawer when the backdrop is clicked
  const overlayHandlers = useOverlayClose(close)

  // Case whose fees are shown; nothing renders if it isn't found
  const c = cases.find(item => item.id === transactionCaseId)
  if (!c) return null

  // Fee totals and payment status for this case
  const fees = getCaseFeeSummary(c)

  return (
    <ModalPortal>
      <div className="overlay drawer-overlay" {...overlayHandlers}>
        <aside className="drawer" onClick={e => e.stopPropagation()}>

          <div className="drawer__header">
            <div>
              <h2 className="modal__title">Transaction Details</h2>
              <p className="drawer__subtitle">
                {c.title}{c.caseNo ? ` • ${c.caseNo}` : ''}
              </p>
            </div>
            <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={close}><Icon name="close" /></button>
          </div>

          <div className="drawer__body">

            {fees.items.length === 0 ? (
              <div className="fee-summary__empty">
                <p className="fee-hearing-empty u-mb-8">
                  No fee details added for this case yet.
                </p>
                <button type="button"
                  className="btn-outline btn-outline--sm"
                  onClick={() => openEditFee(c)}
                >
                  + Add Fee Details
                </button>
              </div>
            ) : (
              <>
                <p className="drawer__section-label">
                  {feeTypeLabel(c.feeType)}
                </p>

                <div className="drawer__table-wrap">
                  <table className="fee-summary__table">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fees.items.map(item => (
                        <tr key={item.key}>
                          <td>{item.label}</td>
                          <td>{item.date ? formatDisplayDate(item.date) : '—'}</td>
                          <td>{formatCurrency(item.amount)}</td>
                          <td>
                            <button
                              className={`badge fee-status-btn ${item.paid ? 'badge--paid' : 'badge--due'}`}
                              onClick={() => toggleFeePaid(c.id, item.key)}
                            >
                              {item.paid ? <>Paid <Icon name="check" /></> : 'Mark Paid'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td>Total</td>
                        <td></td>
                        <td>{formatCurrency(fees.total)}</td>
                        <td className={fees.due > 0 ? 'fee-summary__due' : 'fee-summary__clear'}>
                          {fees.due > 0 ? `Due ${formatCurrency(fees.due)}` : 'Fully Paid'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>

          <div className="drawer__footer">
            <button type="button" className="btn-outline" onClick={() => openEditFee(c)}>
              <Icon name="edit" /> Edit Fee
            </button>

            {fees.due > 0 && (
              <button
                className="btn-outline"
                title="Send the client a WhatsApp message with the amount due"
                disabled={!!whatsappBusy[`payment-${c.id}`]}
                onClick={() => sendPaymentReminder(c)}
              >
                <Icon name="chat" /> Payment Reminder
              </button>
            )}

            {fees.items.length > 0 && (
              <button type="button" className="btn-gold" onClick={() => setInvoiceCaseId(c.id)}>
                <Icon name="receipt" /> View Invoice
              </button>
            )}
          </div>
        </aside>
      </div>
    </ModalPortal>
  )
}
