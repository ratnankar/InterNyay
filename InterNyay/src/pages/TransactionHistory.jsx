import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { formatCurrency } from '../utils/formatUtils'
import { formatDisplayDate } from '../utils/dateUtils'
import {
  DEFAULT_PERIOD,
  PERIOD_PRESETS,
  availableYears,
  filterByRange,
  periodRange,
} from '../utils/txnPeriods'
import Expenses from './Expenses'
import Dropdown from '../components/common/Dropdown'
import useSeeMore from '../hooks/useSeeMore'
import usePlanFeatures from '../hooks/usePlanFeatures'
import SeeMore from '../components/common/SeeMore'

import Icon from '../components/common/Icon'
import useSessionState from '../hooks/useSessionState'
import ClearableDateInput from '../components/common/ClearableDateInput'
// Payment status filters
const STATUS_FILTERS = ['All', 'Paid', 'Due']
// Tabs at the top of the page (transactions and expenses)
const SUB_TABS = [
  { key: 'transactions', label: 'Fees' },
  { key: 'expenses',     label: 'Expenses', feature: 'office_expenses' },
]

// Readable text for the selected date range
function describeRange({ from, to }) {
  if (from && to) return `${formatDisplayDate(from)} – ${formatDisplayDate(to)}`
  if (from) return `From ${formatDisplayDate(from)}`
  if (to) return `Up to ${formatDisplayDate(to)}`
  return 'All dates'
}

// Transaction History page: fee entries with totals, status and period filters, invoices and payment reminders (embedded hides the header and tabs)
export default function TransactionHistory({ embedded = false }) {
  const {
    transactions, setInvoiceCaseId, toggleFeePaid,
    sendPaymentReminder, whatsappBusy,
  } = useApp()
  // Selected status filter and sub tab
  const [statusFilter, setStatusFilter] = useState('All')

  const [subTab, setSubTab] = useSessionState('transactions_tab', 'transactions')
  // Tabs the plan includes (Expenses needs the office expenses feature)
  const { can } = usePlanFeatures()
  const visibleTabs = SUB_TABS.filter(t => !t.feature || can(t.feature))
  const showExpenses = can('office_expenses')

  // Client name typed in the search box
  const [clientSearch, setClientSearch] = useState('')

  // Selected period preset, year and custom from/to dates
  const [period, setPeriod] = useState(DEFAULT_PERIOD)
  const [year, setYear] = useState(new Date().getFullYear())
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // Date range for the selected period
  const range = useMemo(
    () => periodRange({ period, year, from: fromDate, to: toDate }),
    [period, year, fromDate, toDate]
  )

  // Years that have transactions, for the year dropdown
  const years = useMemo(() => availableYears(transactions), [transactions])

  // Transactions inside the date range that match the status filter
  const filtered = useMemo(() => {
    let rows = filterByRange(transactions, range)

    if (statusFilter !== 'All') {
      rows = rows.filter(t => t.status === statusFilter)
    }

    // Keep only fees of clients whose name matches the search text (any client on the case)
    const q = clientSearch.trim().toLowerCase()
    if (q) {
      rows = rows.filter(t =>
        (t.clientNames?.length ? t.clientNames : [t.clientName])
          .some(name => String(name || '').toLowerCase().includes(q))
      )
    }

    return rows
  }, [transactions, range, statusFilter, clientSearch])

  // Total billed, received and still due for the filtered rows
  const totals = useMemo(() => {
    const billed = filtered.reduce((s, t) => s + t.amount, 0)
    const received = filtered
      .filter(t => t.status === 'Paid')
      .reduce((s, t) => s + t.amount, 0)
    return { billed, received, due: billed - received }
  }, [filtered])

  // Show the rows a page at a time; starts again when the status, period or search changes
  const rowsStep = 25
  const {
    visible: visibleRows,
    remaining: rowsRemaining,
    showMore: showMoreRows,
  } = useSeeMore(filtered, [statusFilter, period, year, fromDate, toDate, clientSearch].join('|'), rowsStep)

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

  return (
    <div>
      {/* Page title and the Fees / Expenses tabs (hidden when embedded) */}
      {!embedded && (
        <div className="page-header">
          <div>
            <h1 className="page-title">Transaction History</h1>
            <p className="page-subtitle">
              {subTab === 'expenses' ? 'Office expenses and what is still to be paid' : 'Fees received and pending across your cases'}
            </p>
          </div>
          {visibleTabs.length > 1 && (
          <div className="case-filters">
            {visibleTabs.map(t => (
              <button
                key={t.key}
                className={`case-filter-btn${subTab === t.key ? ' case-filter-btn--active' : ''}`}
                onClick={() => setSubTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          )}
        </div>
      )}

      {/* Expenses tab, otherwise the transactions view */}
      {!embedded && subTab === 'expenses' && showExpenses ? (
        <Expenses embedded />
      ) : (
      <>
      {/* Stat cards: total billed, received and due */}
      <div className="txn-summary-row">
        <div className="stat-card">
          <p className="stat-card__label">Total Billed</p>
          <p className="stat-card__value stat--navy">{formatCurrency(totals.billed)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Total Received</p>
          <p className="stat-card__value stat--active">{formatCurrency(totals.received)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Total Due</p>
          <p className="stat-card__value u-critical">
            {formatCurrency(totals.due)}
          </p>
        </div>
      </div>

      {/* Search transactions by client name */}
      <div className="list-toolbar">
        <div className="doc-search-wrap">
          <span className="doc-search-icon"><Icon name="search" /></span>
          <input
            className="form-input doc-search-input"
            type="text"
            placeholder="Search transactions by client name…"
            aria-label="Search transactions by client name"
            value={clientSearch}
            onChange={e => setClientSearch(e.target.value)}
          />
          {/* Button to clear the search text */}
          {clientSearch && (
            <button type="button" className="doc-search-clear" aria-label="Clear search" onClick={() => setClientSearch('')}>
              <Icon name="close" />
            </button>
          )}
        </div>
      </div>

      {/* Paid / Due filter buttons */}
      <div className="case-filters">
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

      {/* Hint about the Remind button, only shown when something is due */}
      {totals.due > 0 && (
        <p className="txn-hint">
          <Icon name="chat" /> <strong>Remind</strong> sends the client one WhatsApp message with the
          total still due on that case.
        </p>
      )}

      {/* Transactions table */}
      <div className="card txn-table-wrap">
        {/* Empty state, otherwise the table */}
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon"><Icon name="receipt" duotone /></div>
            <p className="empty-state__title">No transactions found</p>
            <p className="empty-state__desc">
              {transactions.length === 0
                ? 'Fee entries added to cases will show up here.'
                : clientSearch.trim()
                  ? `No transactions found for "${clientSearch.trim()}" in this period or status — try another period, or All Time.`
                  : 'Nothing falls in this period or status — try another period, or All Time.'}
            </p>
          </div>
        ) : (
          <table className="fee-summary__table txn-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Case</th>
                <th>Description</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Invoice</th>
                <th>Reminder</th>
              </tr>
            </thead>
            <tbody>
              {/* One row per fee entry */}
              {visibleRows.map(t => (
                <tr key={t.id}>
                  <td>{t.clientName}</td>
                  <td>{t.caseTitle} <span className="case-card__info">({t.caseNo})</span></td>
                  <td>{t.description}</td>
                  <td>
                    {/* Fee date, or the day the case was added when the fee has no date of its own */}
                    {t.date ? formatDisplayDate(t.date) : t.recordedOn ? (
                      <span className="txn-date--case" title="This fee has no date of its own — the day its case was added">
                        {formatDisplayDate(t.recordedOn)}
                      </span>
                    ) : '—'}
                  </td>
                  <td>{formatCurrency(t.amount)}</td>
                  <td>
                    {/* Paid or Due badge; clicking toggles the fee's paid status */}
                    <button
                      className="badge fee-status-btn"
                      style={{
                        background: t.status === 'Paid' ? '#0F6E5615' : '#A32D2D15',
                        color: t.status === 'Paid' ? 'var(--color-active)' : 'var(--color-critical)',
                      }}
                      onClick={() => {
                        const itemKey = t.id.replace(`${t.caseId}-`, '')
                        toggleFeePaid(t.caseId, itemKey)
                      }}
                    >
                      {t.status === 'Paid' ? <>Paid <Icon name="check" /></> : 'Due'}
                    </button>
                  </td>
                  <td>
                    {/* Open the invoice for this case */}
                    <button type="button"
                      className="btn-outline btn-outline--sm"
                      onClick={() => setInvoiceCaseId(t.caseId)}
                    >
                      <Icon name="receipt" /> View
                    </button>
                  </td>
                  <td>
                    {/* WhatsApp reminder button for unpaid fees */}
                    {t.status === 'Due' ? (
                      <button
                        className="btn-outline btn-outline--sm"
                        title="WhatsApp the client the total due on this case"
                        disabled={!!whatsappBusy[`payment-${t.caseId}`]}
                        onClick={() => sendPaymentReminder(t.caseId)}
                      >
                        <Icon name="chat" /> Remind
                      </button>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <SeeMore remaining={rowsRemaining} onClick={showMoreRows} step={rowsStep} />
      </div>
      </>
      )}
    </div>
  )
}
