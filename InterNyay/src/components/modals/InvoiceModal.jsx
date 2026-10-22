import { useApp } from '../../context/AppContext'
import { formatCurrency } from '../../utils/formatUtils'
import { formatDisplayDate } from '../../utils/dateUtils'
import useOverlayClose from '../../hooks/useOverlayClose'
import { useCourts, caseCourtLabel } from '../../constants/courts'

import BrandMark from '../common/BrandMark'
import Icon from '../common/Icon'
import ModalPortal from '../../components/common/ModalPortal'
// Popup with the invoice of a case's fees
export default function InvoiceModal() {
  useCourts()
  const {
    invoiceCaseId, setInvoiceCaseId,
    cases, clients, currentUser,
    getCaseFeeSummary, toggleFeePaid,
  } = useApp()

  // Closes the modal when the backdrop is clicked
  const overlayHandlers = useOverlayClose(close)

  // Nothing to show when no invoice is open
  if (!invoiceCaseId) return null

  // The case the invoice is for
  const c = cases.find(x => x.id === invoiceCaseId)

  if (!c) return null

  // Client linked to the case
  const client = clients.find(cl => Number(cl.id) === Number(c.clientId))
  // Fee totals and payments for this case
  const feeSummary = getCaseFeeSummary(c)
  // Invoice number built from the case id, e.g. INV-0012
  const invoiceNo = `INV-${String(c.id).padStart(4, '0')}`
  // Invoice date as YYYY-MM-DD
  const today = new Date().toISOString().slice(0, 10)

  // Close the invoice
  function close() {
    setInvoiceCaseId(null)
  }

  return (
    <ModalPortal>
      <div className="overlay overlay--stacked" {...overlayHandlers}>
        <div id="invoice-print-root" className="modal modal--lg invoice-modal" onClick={e => e.stopPropagation()}>

          <div className="modal__header no-print">
            <h2 className="modal__title">Invoice</h2>
            <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={close}><Icon name="close" /></button>
          </div>

          <div className="invoice">
            <div className="invoice__top">
              <div>
                <p className="invoice__brand"><BrandMark size="md" /><span>InterNyay</span></p>
                <p className="invoice__brand-tag">Legal Practice Management</p>
              </div>
              <div className="invoice__meta">
                <p><strong>Invoice No:</strong> {invoiceNo}</p>
                <p><strong>Date:</strong> {formatDisplayDate(today)}</p>
              </div>
            </div>

            <div className="invoice__parties">
              <div>
                <p className="invoice__label">From</p>
                <p className="invoice__value invoice__value--bold">{currentUser?.name || 'Advocate'}</p>
                {currentUser?.barNo && <p className="invoice__value">Bar No: {currentUser.barNo}</p>}
                {currentUser?.chamber && <p className="invoice__value">{currentUser.chamber}</p>}
                {currentUser?.phone && <p className="invoice__value">{currentUser.phone}</p>}
                {currentUser?.email && <p className="invoice__value">{currentUser.email}</p>}
              </div>
              <div>
                <p className="invoice__label">Billed To</p>
                <p className="invoice__value invoice__value--bold">{client?.name || c.clientName || 'Client'}</p>
                {client?.email && <p className="invoice__value">{client.email}</p>}
                {(client?.whatsappPhone || client?.phone) && (
                  <p className="invoice__value">{client.whatsappPhone || client.phone}</p>
                )}
                {client?.address && <p className="invoice__value">{client.address}</p>}
              </div>
            </div>

            <div className="invoice__case-info">
              <p><strong>Case:</strong> {c.title}</p>
              <p>{c.caseNo && <><strong>Case No:</strong> {c.caseNo} • </>}{caseCourtLabel(c)}</p>
            </div>

            <table className="invoice__table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th className="no-print">Status</th>
                </tr>
              </thead>
              <tbody>
                {feeSummary.items.map(item => (
                  <tr key={item.key}>
                    <td>{item.label}</td>
                    <td>{item.date ? formatDisplayDate(item.date) : '—'}</td>
                    <td>{formatCurrency(item.amount)}</td>
                    <td className="no-print">
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
            </table>

            <div className="invoice__totals">
              <div className="invoice__totals-row">
                <span>Total Billed</span>
                <span>{formatCurrency(feeSummary.total)}</span>
              </div>
              <div className="invoice__totals-row">
                <span>Amount Paid</span>
                <span>{formatCurrency(feeSummary.paid)}</span>
              </div>
              <div className="invoice__totals-row invoice__totals-row--due">
                <span>Balance Due</span>
                <span>{formatCurrency(feeSummary.due)}</span>
              </div>
            </div>

            <p className="invoice__footer-note">
              Thank you for engaging our services. Please contact us for any billing queries.
            </p>
          </div>

          <div className="form-actions no-print">
            <button type="button" className="btn-outline" onClick={close}>Close</button>
            <button type="button" className="btn-gold" onClick={() => window.print()}><Icon name="print" /> Print Invoice</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
