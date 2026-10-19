import { useState, useEffect, useCallback, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { formatCurrency } from '../utils/formatUtils'
import { formatDisplayDate } from '../utils/dateUtils'
import { PERIOD_PRESETS, periodRange } from '../utils/txnPeriods'
import api from '../services/api'
import useOverlayClose from '../hooks/useOverlayClose'
import useUnsavedGuard from '../hooks/useUnsavedGuard'
import useImageCrop from '../hooks/useImageCrop'
import Dropdown from '../components/common/Dropdown'
import useSeeMore from '../hooks/useSeeMore'
import SeeMore from '../components/common/SeeMore'

import Icon from '../components/common/Icon'
import { getErrorMessage } from '../utils/errorMessages'
import ModalPortal from '../components/common/ModalPortal'
import ClearableDateInput from '../components/common/ClearableDateInput'
// Payment status filters
const STATUS_FILTERS = ['All', 'Paid', 'Due']
// Blank values for the Add Expense form
const EMPTY_FORM = { description: '', amount: '' }

// Expenses show all dates until a period is picked
const DEFAULT_EXPENSE_PERIOD = 'all'

// Format a date like '5 Oct 2026', or a dash when empty
function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Day an expense was submitted, as YYYY-MM-DD
function expenseDay(exp) {
  return exp?.createdAt ? String(exp.createdAt).slice(0, 10) : ''
}

// Keep only the expenses submitted inside the date range
function filterExpensesByRange(rows, { from = '', to = '' } = {}) {
  if (!from && !to) return rows
  return rows.filter(exp => {
    const d = expenseDay(exp)
    if (!d) return false
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  })
}

// Years that have expenses (plus the current year), newest first
function expenseYears(rows, today = new Date()) {
  const years = new Set([today.getFullYear()])
  rows.forEach(exp => {
    const y = Number(expenseDay(exp).slice(0, 4))
    if (y) years.add(y)
  })
  return [...years].sort((a, b) => b - a)
}

// Readable text for the selected date range
function describeRange({ from, to }) {
  if (from && to) return `${formatDisplayDate(from)} – ${formatDisplayDate(to)}`
  if (from) return `From ${formatDisplayDate(from)}`
  if (to) return `Up to ${formatDisplayDate(to)}`
  return 'All dates'
}

// Expenses page: office expenses submitted by the advocate and associates, with payment tracking (embedded hides the page title)
export default function Expenses({ embedded = false }) {
  const { currentUser, isAssociate, addToast, handleUpdateQrCode, handleUpdateUpiId } = useApp()

  // UPI ID being edited and whether it is being saved
  const [upiIdInput, setUpiIdInput] = useState(currentUser?.upiId || '')
  const [savingUpiId, setSavingUpiId] = useState(false)

  // Loaded expenses with their loading and error state, and the status filter
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  // Associate filter, the advocate's associates, and whether the payment details card is open
  const [associateFilter, setAssociateFilter] = useState('all')
  const [associates, setAssociates] = useState([])
  const [paymentOpen, setPaymentOpen] = useState(false)
  // Selected period preset, year and custom from/to dates
  const [period, setPeriod] = useState(DEFAULT_EXPENSE_PERIOD)
  const [year, setYear] = useState(new Date().getFullYear())
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // Add Expense popup: visibility, form values, saving state, expense being saved or removed, and the expense waiting for delete confirmation
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  // QR code shown full size in a popup
  const [qrPreview, setQrPreview] = useState(null)

  // Picker with a square crop window for the UPI QR code
  const { pick: pickQr, cropper: qrCropper } = useImageCrop({
    shape: 'square',
    title: 'Adjust QR code',
    onError: msg => addToast(msg, 'error'),
  })

  // Reset the file input, then crop and save the chosen QR code
  function onQrSelected(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    pickQr(file, dataUrl => handleUpdateQrCode(dataUrl))
  }

  // Keep the UPI ID input in step with the saved value
  useEffect(() => {
    setUpiIdInput(currentUser?.upiId || '')
  }, [currentUser?.upiId])

  // Save the UPI ID, skipping the request when it has not changed
  async function saveUpiId() {
    const value = upiIdInput.trim()
    if (value === (currentUser?.upiId || '')) return
    setSavingUpiId(true)
    try {
      await handleUpdateUpiId(value)
    } finally {
      setSavingUpiId(false)
    }
  }

  // Load all office expenses
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await api.officeExpenses.list()
      setExpenses(rows)
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load expenses'))
    } finally {
      setLoading(false)
    }
  }, [])

  // Load the expenses once on mount
  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    // Advocates load their associates for the payment details card and the filter; associates skip this
    if (isAssociate) return
    api.auth.associates()
      .then(rows => setAssociates(Array.isArray(rows) ? rows : []))
      .catch(() => setAssociates([]))
  }, [isAssociate])

  // Date range for the selected period
  const range = useMemo(
    () => periodRange({ period, year, from: fromDate, to: toDate }),
    [period, year, fromDate, toDate]
  )

  // Years that have expenses, for the year dropdown
  const years = useMemo(() => expenseYears(expenses), [expenses])

  // Expenses in the date range, limited to one submitter when an associate filter is chosen (totals use this list)
  const scoped = useMemo(() => {
    let rows = filterExpensesByRange(expenses, range)
    if (!isAssociate) {
      if (associateFilter === 'me') rows = rows.filter(e => e.submittedByAdvocate)
      else if (associateFilter !== 'all') rows = rows.filter(e => String(e.submittedById) === associateFilter)
    }
    return rows
  }, [expenses, isAssociate, range, associateFilter])

  // Scoped expenses that also match the Paid / Due filter
  const filtered = useMemo(() => {
    if (statusFilter === 'All') return scoped
    return scoped.filter(e => (e.paid ? 'Paid' : 'Due') === statusFilter)
  }, [scoped, statusFilter])

  // Total submitted, paid and due for the scoped expenses
  const totals = useMemo(() => {
    const total = scoped.reduce((s, e) => s + Number(e.amount || 0), 0)
    const paid = scoped.filter(e => e.paid).reduce((s, e) => s + Number(e.amount || 0), 0)
    return { total, paid, due: total - paid }
  }, [scoped])

  // Show the rows a page at a time; starts again when the status, period or submitter changes
  const rowsStep = 25
  const {
    visible: visibleRows,
    remaining: rowsRemaining,
    showMore: showMoreRows,
  } = useSeeMore(filtered, [statusFilter, period, year, fromDate, toDate, associateFilter].join('|'), rowsStep)

  // Select a period preset
  function pickPeriod(key) {
    setPeriod(key)
  }

  // Select a whole year from the dropdown
  function pickYear(value) {
    if (!value) return
    setYear(Number(value))
    setPeriod('year')
  }

  // Switch to a custom range, starting from the current range
  function pickCustom() {
    if (period !== 'custom') {
      setFromDate(range.from)
      setToDate(range.to)
    }
    setPeriod('custom')
  }

  // Close the Add Expense popup and clear the form (not while saving)
  function closeAdd() {
    if (saving) return
    setShowAdd(false)
    setForm({ ...EMPTY_FORM })
  }

  // Submit a new expense and add it to the top of the list
  async function submitExpense() {
    if (!form.description.trim() || !form.amount || saving) return
    setSaving(true)
    try {
      const created = await api.officeExpenses.create({
        description: form.description.trim(),
        amount: Number(form.amount),
      })
      setExpenses(list => [created, ...list])
      setForm({ ...EMPTY_FORM })
      setShowAdd(false)
      addToast('Expense submitted')
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not submit expense'), 'error')
    } finally {
      setSaving(false)
    }
  }

  // Mark an expense as paid or unpaid
  async function togglePaid(exp) {
    setBusyId(exp.id)
    try {
      const updated = await api.officeExpenses.setPaid(exp.id, !exp.paid)
      setExpenses(list => list.map(e => (e.id === exp.id ? updated : e)))
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not update status'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  // Delete an expense after confirmation
  async function removeExpense(exp) {
    setBusyId(exp.id)
    try {
      await api.officeExpenses.remove(exp.id)
      setExpenses(list => list.filter(e => e.id !== exp.id))
      addToast('Expense removed')
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not remove expense'), 'error')
    } finally {
      setBusyId(null)
      setDeleteTarget(null)
    }
  }

  // Only unpaid expenses can be deleted, and associates can delete only their own
  const canDelete = exp => !exp.paid && (!isAssociate || exp.submittedById === currentUser?.id)

  // Close handlers for the Add, Delete and QR popups when their overlay is clicked
  // Clicking outside the Add Expense form never closes it; the cross asks to save or discard what was typed
  const { requestClose: requestCloseAdd, dialog: addDialog, overlayHandlers } = useUnsavedGuard({
    dirty: showAdd && !!(form.description.trim() || form.amount),
    onSave: submitExpense,
    onDiscard: closeAdd,
  })
  const deleteOverlayHandlers = useOverlayClose(() => { if (busyId === null) setDeleteTarget(null) })
  const qrOverlayHandlers = useOverlayClose(() => setQrPreview(null))

  return (
    <div>
      {/* QR code crop window */}
      {qrCropper}
      <div className={`page-header${embedded ? ' page-header--top' : ''}`}>
        {/* Page title and subtitle (hidden when embedded in Transaction History) */}
        {!embedded && (
          <div>
            <h1 className="page-title">Expenses</h1>
            <p className="page-subtitle">
              {isAssociate
                ? 'Submit what you spend on the office\u2019s behalf. Set your UPI ID and QR code once (below), so the advocate can always pay you back.'
                : 'Everything associates (and you) have submitted for the office — mark each paid once reimbursed.'}
            </p>
          </div>
        )}
        {embedded && <h2 className="section-title section-title--lg u-m-0" >Expenses</h2>}
        <button type="button" className="btn-gold" onClick={() => setShowAdd(true)}>
          + Add Expense
        </button>
      </div>

      {/* Stat cards: total submitted, paid and due */}
      <div className="txn-summary-row">
        <div className="stat-card">
          <p className="stat-card__label">{isAssociate ? 'Your Total Submitted' : 'Total Submitted'}</p>
          <p className="stat-card__value stat--navy">{formatCurrency(totals.total)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Total Paid</p>
          <p className="stat-card__value stat--active">{formatCurrency(totals.paid)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Total Due</p>
          <p className="stat-card__value stat--due">{formatCurrency(totals.due)}</p>
        </div>
      </div>

      {/* Associate payment details: UPI ID and QR code used to reimburse them */}
      {isAssociate && (
        <div className="card profile-card payment-details-card u-mb-20">
          <h3 className="section-title">Your Payment Details</h3>
          <p className="profile-note">
            Set your UPI ID and QR code once here so the advocate always has up-to-date
            payment details on hand — no need to attach them to every expense.
          </p>

          <div className="expenses-row">
            <input
              className="form-input"
              type="text"
              placeholder="UPI ID — name@okhdfcbank"
              value={upiIdInput}
              onChange={e => setUpiIdInput(e.target.value)}
              onBlur={saveUpiId}
              disabled={savingUpiId}
            />
          </div>

          <div className="expenses-row expenses-row--upload">
            <label className="btn-outline btn-outline--sm u-pointer u-inline-flex">
              <Icon name="upload" /> {currentUser?.qrImage ? 'Change QR' : 'Upload QR'}
              <input type="file" accept="image/*" className="u-hidden" onChange={onQrSelected} />
            </label>
            {/* QR code thumbnail (click to enlarge) and a Remove button */}
            {currentUser?.qrImage && (
              <>
                <img
                  src={currentUser.qrImage}
                  alt="UPI QR"
                  className="qr-thumb"
                  title="Click to view full size"
                  role="button"
                  tabIndex={0}
                  onClick={() => setQrPreview({ image: currentUser.qrImage, label: 'Your QR code' })}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setQrPreview({ image: currentUser.qrImage, label: 'Your QR code' }) } }}
                />
                <button
                  type="button"
                  className="avatar-upload__remove"
                  onClick={() => handleUpdateQrCode('')}
                >
                  Remove
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Advocate view: collapsible card with each associate's UPI ID and QR code */}
      {!isAssociate && associates.length > 0 && (
        <div className={`exp-card exp-card--section${paymentOpen ? ' exp-card--open' : ''}`}>
          <button
            type="button"
            className="exp-card__head"
            aria-expanded={paymentOpen}
            onClick={() => setPaymentOpen(v => !v)}
          >
            <div className="exp-card__avatar"><Icon name="card" /></div>
            <div className="exp-card__titles">
              <p className="exp-card__primary">Associate Payment Details</p>
              <p className="exp-card__secondary">
                {associates.length} {associates.length === 1 ? 'associate' : 'associates'}
              </p>
            </div>
            <span className="exp-card__arrow">{paymentOpen ? '▲' : '▼'}</span>
          </button>

          {/* Associate payment details, shown when the card is open */}
          {paymentOpen && (
            <div className="exp-card__body">
              <p className="profile-note">
                Each associate's UPI ID and QR code, as currently set on their own account — one
                place to look them up instead of on every expense they submit.
              </p>

              <div className="payment-list">
                {associates.map(a => (
                  <div key={a.id} className="payment-row">
                    {a.qrImage ? (
                      <img
                        className="payment-row__qr"
                        src={a.qrImage}
                        alt={`${a.name}'s UPI QR`}
                        title="Click to view full size"
                        role="button"
                        tabIndex={0}
                        onClick={() => setQrPreview({ image: a.qrImage, label: `${a.name}'s QR code` })}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setQrPreview({ image: a.qrImage, label: `${a.name}'s QR code` }) } }}
                      />
                    ) : (
                      <div className="payment-row__qr payment-row__qr--empty" title="No QR on file">
                        —
                      </div>
                    )}
                    <div className="payment-row__text">
                      <p className="payment-row__name">{a.name}</p>
                      <p className="profile-note payment-row__upi">
                        {a.upiId ? a.upiId : 'No UPI ID on file'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Expense popup */}
      {showAdd && (
        <>
        <ModalPortal>
          <div className="overlay" {...overlayHandlers}>
            <div className="modal modal--sm" onClick={e => e.stopPropagation()}>
              <div className="modal__header">
                <h2 className="modal__title">New Expense</h2>
                <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={requestCloseAdd}><Icon name="close" /></button>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">What was it for? *</label>
                  <input
                    className="form-input"
                    autoFocus
                    placeholder="e.g. Stamp paper, courier, stationery"
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Amount *</label>
                  <div className="form-input-wrap">
                    <span className="form-input-prefix">₹</span>
                    <input
                      className="form-input form-input--prefix"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      value={form.amount}
                      onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Note that payment goes to the UPI details set above */}
              {isAssociate && (
                <p className="profile-note u-mt-8">
                  Paid using the UPI ID / QR code set above. Update those any time — no need to
                  re-enter them here.
                </p>
              )}

              <div className="form-actions">
                <button type="button" className="btn-outline" onClick={closeAdd} disabled={saving}>
                  Cancel
                </button>
                <button type="button"
                  className="btn-gold"
                  disabled={saving || !form.description.trim() || !form.amount}
                  onClick={submitExpense}
                >
                  {saving ? 'Submitting…' : 'Submit Expense'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
        {addDialog}
        </>
      )}

      {/* Filters: submitted by, Paid / Due and period */}
      <div className="list-toolbar">
        {/* Submitted By dropdown (advocate only) */}
        {!isAssociate && (
          <div className="sort-control">
            <label htmlFor="expense-associate-filter">Submitted By:</label>
            <Dropdown
              id="expense-associate-filter"
              className="form-input"
              value={associateFilter}
              onChange={e => setAssociateFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="me">Office</option>
              {associates.map(a => (
                <option key={a.id} value={String(a.id)}>{a.name}</option>
              ))}
            </Dropdown>
          </div>
        )}

        <div className="case-filters u-mb-0">
          {/* Paid / Due filter buttons */}
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              className={`case-filter-btn${statusFilter === s ? ' case-filter-btn--active' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Period selector: presets, year, custom range and all time */}
      <div className="txn-period">
        <p className="form-label txn-period__label">Period</p>

        <div className="txn-period__chips">
            {PERIOD_PRESETS.map(p => (
              <button
                key={p.key}
                className={`case-filter-btn${period === p.key ? ' case-filter-btn--active' : ''}`}
                onClick={() => pickPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}

            <Dropdown
              className={`form-input txn-year-select${period === 'year' ? ' txn-year-select--active' : ''}`}
              aria-label="Pick a year"
              searchable={false}
              value={period === 'year' ? String(year) : ''}
              onChange={e => pickYear(e.target.value)}
            >
              <option value="">Year</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </Dropdown>

            <button
              className={`case-filter-btn${period === 'custom' ? ' case-filter-btn--active' : ''}`}
              onClick={pickCustom}
            >
              Custom Range
            </button>

            <button
              className={`case-filter-btn${period === 'all' ? ' case-filter-btn--active' : ''}`}
              onClick={() => pickPeriod('all')}
            >
              All Time
            </button>
        </div>

        {/* From and To date inputs for the custom range */}
        {period === 'custom' && (
          <div className="txn-timeline-filter">
            <div className="txn-timeline-filter__field">
              <label className="form-label">From</label>
              <ClearableDateInput
                className="form-input"
                
                value={fromDate}
                max={toDate || undefined}
                onChange={e => setFromDate(e.target.value)}
              />
            </div>
            <div className="txn-timeline-filter__field">
              <label className="form-label">To</label>
              <ClearableDateInput
                className="form-input"
                
                value={toDate}
                min={fromDate || undefined}
                onChange={e => setToDate(e.target.value)}
              />
            </div>
          </div>
        )}

        <p className="txn-period__range">Showing {describeRange(range)}</p>
      </div>

      {/* Expenses table */}
      <div className="card txn-table-wrap">
        {/* Loading, error, empty state, or the table */}
        {loading ? (
          <p className="profile-note">Loading…</p>
        ) : error ? (
          <p className="account-modal__error">{error}</p>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon"><Icon name="receipt" duotone /></div>
            <p className="empty-state__title">
              {expenses.length === 0 ? 'No expenses yet' : 'No expenses match this filter'}
            </p>
            <p className="empty-state__desc">
              {expenses.length > 0
                ? 'Try a different submitter, period or status.'
                : isAssociate
                  ? 'Spent something on the office\u2019s behalf? Add it above so the advocate can pay you back.'
                  : 'Expenses your associates (or you) submit will show up here.'}
            </p>
          </div>
        ) : (
          <table className="fee-summary__table txn-table">
            <thead>
              <tr>
                {!isAssociate && <th>Submitted By</th>}
                <th>Description</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* One row per expense */}
              {visibleRows.map(exp => (
                <tr key={exp.id}>
                  {!isAssociate && <td>{exp.submittedByAdvocate ? 'Office' : exp.submittedByName}</td>}
                  <td>{exp.description}</td>
                  <td>{formatDateTime(exp.createdAt)}</td>
                  <td>{formatCurrency(exp.amount)}</td>
                  <td>
                    {/* Status: read-only for associates, fixed as Paid for office expenses, otherwise a button to mark paid */}
                    {isAssociate ? (
                      <span className={`badge ${exp.paid ? 'badge--paid' : 'badge--due'}`}>
                        {exp.paid ? <>Paid <Icon name="check" /></> : 'Due'}
                      </span>
                    ) : exp.submittedByAdvocate ? (
                      <span
                        className="badge badge--paid"
                        title="Office expenses are settled automatically and can't be changed"
                      >
                        Paid <Icon name="check" />
                      </span>
                    ) : (
                      <button
                        className={`badge fee-status-btn ${exp.paid ? 'badge--paid' : 'badge--due'}`}
                        disabled={busyId === exp.id}
                        onClick={() => togglePaid(exp)}
                      >
                        {exp.paid ? <>Paid <Icon name="check" /></> : 'Mark Paid'}
                      </button>
                    )}
                  </td>
                  <td>
                    {/* Remove button, or a lock for paid expenses */}
                    {canDelete(exp) ? (
                      <button type="button"
                        className="btn-outline btn-outline--sm btn-outline--danger"
                        disabled={busyId === exp.id}
                        onClick={() => setDeleteTarget(exp)}
                        title="Remove this entry"
                      >
                        <Icon name="trash" /> Remove
                      </button>
                    ) : exp.paid ? (
                      <span className="profile-note" title="Paid expenses are a settled record and can't be removed">
                        <Icon name="lock" /> Paid
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <SeeMore remaining={rowsRemaining} onClick={showMoreRows} step={rowsStep} />
      </div>

      {/* Confirmation popup for removing an expense */}
      {deleteTarget && (
        <ModalPortal>
          <div className="overlay" {...deleteOverlayHandlers}>
            <div className="modal modal--sm" onClick={e => e.stopPropagation()}>
              <div className="modal__header">
                <h2 className="modal__title">Remove expense</h2>
                <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={() => setDeleteTarget(null)} disabled={busyId === deleteTarget.id}><Icon name="close" /></button>
              </div>

              <p className="account-modal__text">
                Remove <strong>“{deleteTarget.description}”</strong> for {formatCurrency(deleteTarget.amount)},
                submitted {formatDateTime(deleteTarget.createdAt)}? This can't be undone.
              </p>

              <div className="form-actions">
                <button type="button"
                  className="btn-outline"
                  onClick={() => setDeleteTarget(null)}
                  disabled={busyId === deleteTarget.id}
                >
                  Cancel
                </button>
                <button type="button"
                  className="btn-outline btn-outline--danger"
                  disabled={busyId === deleteTarget.id}
                  onClick={() => removeExpense(deleteTarget)}
                >
                  {busyId === deleteTarget.id ? 'Removing…' : 'Remove Expense'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Full-size QR code popup */}
      {qrPreview && (
        <ModalPortal>
          <div className="overlay overlay--stacked" {...qrOverlayHandlers}>
            <div className="modal modal--sm" onClick={e => e.stopPropagation()}>
              <div className="modal__header">
                <h2 className="modal__title">{qrPreview.label}</h2>
                <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={() => setQrPreview(null)}><Icon name="close" /></button>
              </div>
              <img
                src={qrPreview.image}
                alt={qrPreview.label}
                className="qr-preview__img"
              />
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}