import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { feeTypesFor, feeTypeLabel, feeTypeIcon, stageTotal } from '../../utils/feeUtils'
import { formatCurrency } from '../../utils/formatUtils'
import { formatDisplayDate } from '../../utils/dateUtils'
import api from '../../services/api'

import Icon from '../common/Icon'
// Small note showing the date a fee amount was set, hidden when there is no date
function FeeAmountDateNote({ date }) {
  if (!date) return null
  return (
    <p className="fee-amount-date-note">
      Set on {formatDisplayDate(date)}
    </p>
  )
}

// Toggle that marks a fee as paid or unpaid
function PaidStatusToggle({ paid, onChange }) {
  return (
    <div className="paid-status-toggle" role="group" aria-label="Payment status">
      <button
        type="button"
        className={`paid-status-btn paid-status-btn--unpaid${!paid ? ' paid-status-btn--active' : ''}`}
        onClick={() => onChange(false)}
      >
        Unpaid
      </button>
      <button
        type="button"
        className={`paid-status-btn paid-status-btn--paid${paid ? ' paid-status-btn--active' : ''}`}
        onClick={() => onChange(true)}
      >
        Paid
      </button>
    </div>
  )
}

// One editable row for a hearing fee: amount decided, amount received and whether it is paid
function HearingFeeUpdateRow({ row, decidedAmount, dateLabel, onChange, onRemove, receivedOnly = false, showDate = true }) {
  const hasDecided = Number(decidedAmount) > 0
  const askFee = !hasDecided && !receivedOnly

  const received = row.amountReceived === '' || row.amountReceived == null ? '' : row.amountReceived
  const ownAmount = row.amount === '' || row.amount == null ? '' : row.amount
  const feeAmount = hasDecided ? Number(decidedAmount) || 0 : ownAmount

  const remaining = Math.max((Number(feeAmount) || 0) - (Number(received) || 0), 0)

  return (
    <div className="fee-hearing-update-row">
      {(showDate || hasDecided) && (
        <div className="fee-hearing-update-row__head">
          {showDate && <span className="fee-hearing-update-row__date"><Icon name="calendar" /> {dateLabel}</span>}
          {hasDecided && (
            <span className="fee-hearing-update-row__ref">Hearing Fee: {formatCurrency(decidedAmount)}</span>
          )}
        </div>
      )}

      <div className={`fee-hearing-update-row__inputs${!askFee ? ' fee-hearing-update-row__inputs--single' : ''}`}>
        {askFee && (
          <div className="form-input-wrap">
            <span className="form-input-prefix">₹</span>
            <input
              className="form-input form-input--prefix"
              type="number"
              min="0"
              placeholder="Fee for this hearing"
              aria-label="Fee for this hearing"
              value={ownAmount}
              onChange={e => onChange('amount', e.target.value)}
            />
          </div>
        )}

        <div className="form-input-wrap">
          <span className="form-input-prefix">₹</span>
          <input
            className="form-input form-input--prefix"
            type="number"
            min="0"
            placeholder="Received today"
            aria-label="Amount received"
            value={received}
            onChange={e => onChange('amountReceived', e.target.value)}
          />
        </div>

        {onRemove && (
          <button type="button" className="btn-icon" title="Remove this fee entry" aria-label="Remove this fee entry" onClick={onRemove}>
            <Icon name="close" />
          </button>
        )}
      </div>

      {!receivedOnly && feeAmount !== '' && (
        <p className={`fee-hearing-update-row__remaining${remaining === 0 ? ' fee-hearing-update-row__remaining--clear' : ''}`}>
          {remaining > 0 ? `Remaining: ${formatCurrency(remaining)}` : <>Fully received <Icon name="check" /></>}
        </p>
      )}
    </div>
  )
}

// List of hearing fee rows with a button to add another one
function AdHocHearingFeeList({ hearingFees, addRow, updateRow, removeRow, showDate = true, buttonLabel = '+ Add Hearing Fee', label = 'Hearing Fees' }) {
  return (
    <div className="fee-hearing-list">
      <div className="fee-hearing-list__header">
        <p className="form-label u-mb-0">{label}</p>
        <button type="button" className="btn-outline btn-outline--sm" onClick={addRow}>
          {buttonLabel}
        </button>
      </div>

      {hearingFees.length === 0 && (
        <p className="fee-hearing-empty">
          No hearing fees added yet — record a payment collected at a specific hearing.
        </p>
      )}

      {hearingFees.map(row => (
        <div
          key={row.id}
          className={`fee-hearing-row${showDate ? ' fee-hearing-row--adhoc' : ' fee-hearing-row--single'}`}
        >
          {showDate && (
            <input
              className="form-input"
              type="date"
              aria-label="Hearing date"
              value={row.date}
              onChange={e => updateRow(row.id, 'date', e.target.value)}
            />
          )}
          <div className="form-input-wrap">
            <span className="form-input-prefix">₹</span>
            <input
              className="form-input form-input--prefix"
              type="number"
              min="0"
              placeholder="Received"
              aria-label="Amount received"
              value={row.amountReceived ?? ''}
              onChange={e => updateRow(row.id, 'amountReceived', e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn-icon"
            title="Remove"
            onClick={() => removeRow(row.id)}
          >
            <Icon name="close" />
          </button>
        </div>
      ))}
    </div>
  )
}

// One label and amount line in the read-only fee view
function FeeViewRow({ label, amount }) {
  return (
    <div className="fee-view__row">
      <span className="fee-view__name">{label || 'Untitled'}</span>
      <strong className="fee-view__amount">{formatCurrency(Number(amount) || 0)}</strong>
    </div>
  )
}

// Read-only summary of the stage fees
function StageFeeView({ stageFees, feeType }) {
  return (
    <div className="fee-view">
      <p className="fee-type-locked">
        <span className="fee-type-locked__label">Fee Type</span>
        <span className="fee-type-locked__value">
          <span className="fee-type-locked__icon"><Icon name={feeTypeIcon(feeType)} /></span>
          {feeTypeLabel(feeType)}
        </span>
      </p>

      <div className="fee-view__group">
        <p className="form-label">Stages</p>
        {stageFees.length === 0 && <p className="fee-hearing-empty">No stages have been set for this case.</p>}
        {stageFees.map(row => (
          <FeeViewRow key={row.id} label={row.name} amount={row.amount} />
        ))}
        {stageFees.length > 0 && (
          <div className="fee-view__total">
            <span>Total across {stageFees.length} {stageFees.length === 1 ? 'stage' : 'stages'}</span>
            <strong>{formatCurrency(stageTotal(stageFees))}</strong>
          </div>
        )}
      </div>

    </div>
  )
}

// Fee section of the case form. Works on the new-case form by default or on a form passed in as props
export default function CaseFeeSection({
  form,
  setForm,
  addRow,
  updateRow,
  removeRow,
  corporatePanel = false,
  hasClient = true,
  updateMode = false,
  caseId = null,
  focusDate = null,
  readOnly = false,
  hideHearingFees = false,
}) {
  // Falls back to the shared form state in AppContext when no form is passed in
  const {
    newCaseForm, setNewCaseForm,
    addHearingFeeRow, updateHearingFeeRow, removeHearingFeeRow,
  } = useApp()

  // Props take priority, otherwise the AppContext form and handlers are used
  const feeForm = form || newCaseForm
  const setFeeForm = setForm || setNewCaseForm
  const addHearingRow = addRow || addHearingFeeRow
  const updateHearingRow = updateRow || updateHearingFeeRow
  const removeHearingRow = removeRow || removeHearingFeeRow

  // Fee amounts and dates stored on the form
  const {
    totalFeeAmount, totalFeeAmountDate,
    initialAmount, initialAmountDate,
    dateWiseAmount, hearingFees,
  } = feeForm

  // Stage fees default to an empty list
  const stageFees = feeForm.stageFees || []

  // Fee types allowed for this client, which depends on corporate panel and client selection
  const feeTypes = feeTypesFor({ corporatePanel, hasClient })
  const allowed = feeTypes.map(t => t.value)

  // Use the selected fee type only if it is allowed, else the first allowed one
  const feeType = allowed.includes(feeForm.feeType) ? feeForm.feeType : allowed[0]

  // Reset the form's fee type when the allowed list changes and the current one is no longer valid
  const allowedKey = allowed.join('|')
  useEffect(() => {
    setFeeForm(f => (allowed.includes(f.feeType) ? f : { ...f, feeType: allowed[0] }))
  }, [allowedKey])

  // Stage fee helpers: add, update and remove a row by id
  const addStage = () =>
    setFeeForm(f => ({
      ...f,
      stageFees: [...(f.stageFees || []), { id: Date.now(), name: '', amount: '', paid: false }],
    }))

  const updateStage = (id, field, value) =>
    setFeeForm(f => ({
      ...f,
      stageFees: (f.stageFees || []).map(row => (row.id === id ? { ...row, [field]: value } : row)),
    }))

  const removeStage = id =>
    setFeeForm(f => ({ ...f, stageFees: (f.stageFees || []).filter(row => row.id !== id) }))

  // Dashboard view is update mode opened for one specific hearing date
  const dashboardView = updateMode && !!focusDate

  // True while the case hearings are being loaded
  const [hearingsLoading, setHearingsLoading] = useState(false)

  // In update mode for date wise fees, load the case's hearing dates and merge them with the fee rows already on the form
  useEffect(() => {
    if (!updateMode || feeType !== 'DATEWISE' || !caseId) return

    let cancelled = false
    setHearingsLoading(true)

    api.cases.hearings(caseId)
      .then(rows => {
        if (cancelled) return

        const dates = (Array.isArray(rows) ? rows : [])
          .map(h => h.date)
          .filter(Boolean)

        setFeeForm(f => {
          const existingByDate = new Map((f.hearingFees || []).map(r => [r.date, r]))

          const merged = dates.map(date =>
            existingByDate.get(date) || { id: `h-${date}`, date, amount: '', amountReceived: '', paid: false }
          )

          if (focusDate && !merged.some(r => r.date === focusDate)) {
            merged.push(
              existingByDate.get(focusDate) || { id: `h-${focusDate}`, date: focusDate, amount: '', amountReceived: '', paid: false }
            )
          }

          return { ...f, hearingFees: merged }
        })
      })
      .catch(() => { })
      .finally(() => { if (!cancelled) setHearingsLoading(false) })

    return () => { cancelled = true }
  }, [updateMode, feeType, caseId, focusDate])

  // Fee rows to display, limited to the focus date when there is one, sorted by date
  const datewiseRows = useMemo(() => {
    const rows = focusDate ? hearingFees.filter(r => r.date === focusDate) : hearingFees
    return [...rows].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  }, [hearingFees, focusDate])

  // The extra hearing fee row already added for the focus date, if any
  const todaysAdHocRow = hearingFees.find(r => r.date === focusDate)

  // Adds a hearing fee row for the focus date
  const addTodaysHearingFeeRow = () =>
    setFeeForm(f => ({
      ...f,
      hearingFees: [...(f.hearingFees || []), { id: Date.now(), date: focusDate, amount: '', amountReceived: '', paid: false }],
    }))

  // Read-only mode shows the fee summary and nothing editable
  if (readOnly) {
    return (
      <div className="fee-section">
        <StageFeeView stageFees={stageFees} feeType={feeForm.feeType} />
      </div>
    )
  }

  // Editable fee section
  return (
    <div className="fee-section">
      <p className="client-section__label">Fees</p>

      {/* Fee type is locked when updating a case, otherwise the user picks it with buttons */}
      {updateMode ? (
        <p className="fee-type-locked">
          <span className="fee-type-locked__label">Fee Type</span>
          <span className="fee-type-locked__value">
            <span className="fee-type-locked__icon"><Icon name={feeTypeIcon(feeType)} /></span>
            {feeTypeLabel(feeType)}
          </span>
        </p>
      ) : (
        <div className="fee-type-toggle">
          {feeTypes.map(t => (
            <button
              key={t.value}
              type="button"
              className={`fee-type-btn${feeType === t.value ? ' fee-type-btn--active' : ''}`}
              onClick={() => setFeeForm(f => ({ ...f, feeType: t.value }))}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Corporate panel clients are always billed stage wise */}
      {corporatePanel && (
        <p className="fee-panel-note">Corporate Panel client — billed stage wise.</p>
      )}

      {/* Stage wise fees: a list of named stages with amount and paid status */}
      {feeType === 'STAGEWISE' && (
        <div className="fee-stagewise">
          <div className="fee-hearing-list__header">
            <p className="form-label u-mb-0">
              Stages
            </p>
            <button type="button" className="btn-outline btn-outline--sm" onClick={addStage}>
              + Add Stage
            </button>
          </div>

          {stageFees.length === 0 && (
            <p className="fee-hearing-empty">
              No stages added yet. Add a stage, name it — Notice, Reply, Evidence, Arguments… — and enter its fee.
            </p>
          )}

          {stageFees.map((row, i) => (
            <div key={row.id} className="fee-hearing-row fee-additional-row">
              <input
                className="form-input"
                type="text"
                maxLength={255}
                placeholder={`Stage ${i + 1} name, e.g. Notice`}
                aria-label={`Stage ${i + 1} name`}
                value={row.name}
                onChange={e => updateStage(row.id, 'name', e.target.value)}
              />
              <div className="form-input-wrap fee-hearing-row__amount">
                <span className="form-input-prefix">₹</span>
                <input
                  className="form-input form-input--prefix"
                  type="number"
                  min="0"
                  placeholder="Amount"
                  aria-label={`Stage ${i + 1} amount`}
                  value={row.amount}
                  onChange={e => updateStage(row.id, 'amount', e.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn-icon"
                title="Remove stage"
                onClick={() => removeStage(row.id)}
              >
                <Icon name="close" />
              </button>
            </div>
          ))}

          {stageFees.length > 0 && (
            <p className="fee-commission__preview">
              Total across {stageFees.length} {stageFees.length === 1 ? 'stage' : 'stages'}:{' '}
              <strong>{formatCurrency(stageTotal(stageFees))}</strong>
            </p>
          )}
        </div>
      )}

      {/* One time total fee (the dashboard view only records the amount received) */}
      {feeType === 'TOTAL' && (
        dashboardView ? (
          <div className="fee-onetime-dashboard">
            {todaysAdHocRow ? (
              <HearingFeeUpdateRow
                row={todaysAdHocRow}
                decidedAmount={0}
                receivedOnly
                dateLabel={formatDisplayDate(focusDate)}
                onChange={(field, value) => updateHearingRow(todaysAdHocRow.id, field, value)}
                onRemove={() => removeHearingRow(todaysAdHocRow.id)}
              />
            ) : (
              <button type="button" className="btn-outline btn-outline--sm" onClick={addTodaysHearingFeeRow}>
                + Add Hearing Fee
              </button>
            )}
          </div>
        ) : (
          <div className="fee-onetime">
            <div className="fee-commission__inputs">
              <div>
                <label className="form-label">Initial Amount</label>
                <div className="form-input-wrap">
                  <span className="form-input-prefix">₹</span>
                  <input
                    className="form-input form-input--prefix"
                    type="number"
                    min="0"
                    placeholder="Paid at the start"
                    value={initialAmount}
                    onChange={e =>
                      setFeeForm(f => ({ ...f, initialAmount: e.target.value }))
                    }
                  />
                </div>
                <FeeAmountDateNote date={initialAmountDate} />
                <PaidStatusToggle
                  paid={!!feeForm.initialPaid}
                  onChange={val => setFeeForm(f => ({ ...f, initialPaid: val }))}
                />
              </div>

              <div>
                <label className="form-label">One-Time Fee Amount</label>
                <div className="form-input-wrap">
                  <span className="form-input-prefix">₹</span>
                  <input
                    className="form-input form-input--prefix"
                    type="number"
                    min="0"
                    placeholder="e.g. 50000"
                    value={totalFeeAmount}
                    onChange={e =>
                      setFeeForm(f => ({ ...f, totalFeeAmount: e.target.value }))
                    }
                  />
                </div>
                <FeeAmountDateNote date={totalFeeAmountDate} />
              </div>
            </div>

            {/* Hearing fees are added later, when the case is edited */}
            {!hideHearingFees && (
              <AdHocHearingFeeList
                hearingFees={hearingFees}
                addRow={addHearingRow}
                updateRow={updateHearingRow}
                removeRow={removeHearingRow}
              />
            )}
          </div>
        )
      )}

      {/* Date wise fees: an initial amount plus a fee for each hearing date */}
      {feeType === 'DATEWISE' && (
        <div className="fee-datewise">
          {!dashboardView && (
            <div className="fee-commission__inputs">
              <div>
                <label className="form-label">Initial Amount</label>
                <div className="form-input-wrap">
                  <span className="form-input-prefix">₹</span>
                  <input
                    className="form-input form-input--prefix"
                    type="number"
                    min="0"
                    placeholder="Paid at filing"
                    value={initialAmount}
                    onChange={e =>
                      setFeeForm(f => ({ ...f, initialAmount: e.target.value }))
                    }
                  />
                </div>
                <FeeAmountDateNote date={initialAmountDate} />
                <PaidStatusToggle
                  paid={!!feeForm.initialPaid}
                  onChange={val => setFeeForm(f => ({ ...f, initialPaid: val }))}
                />
              </div>

              <div>
                <label className="form-label">Date-wise Amount</label>
                <div className="form-input-wrap">
                  <span className="form-input-prefix">₹</span>
                  <input
                    className="form-input form-input--prefix"
                    type="number"
                    min="0"
                    placeholder="Charged at every hearing"
                    value={dateWiseAmount}
                    onChange={e =>
                      setFeeForm(f => ({ ...f, dateWiseAmount: e.target.value }))
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* Hearing dates are added later, when the case or its fee is edited */}
          {!(hideHearingFees && !updateMode) && (
          <div className="fee-hearing-list">
            <div className="fee-hearing-list__header">
              <p className="form-label u-mb-0">
                {dashboardView ? "Today's Hearing Fee" : 'Hearing Dates'}
              </p>
              {!updateMode && (
                <button
                  type="button"
                  className="btn-outline btn-outline--sm"
                  onClick={addHearingRow}
                >
                  + Add Date
                </button>
              )}
            </div>

            {updateMode ? (
              <>
                {hearingsLoading && (
                  <p className="fee-hearing-empty">Loading hearing history…</p>
                )}

                {!hearingsLoading && datewiseRows.length === 0 && (
                  <p className="fee-hearing-empty">
                    {focusDate
                      ? 'No hearing recorded for this date yet.'
                      : "No hearings recorded for this case yet — fee rows follow the case's hearing history."}
                  </p>
                )}

                {!hearingsLoading && datewiseRows.map(row => (
                  <HearingFeeUpdateRow
                    key={row.id}
                    row={row}
                    decidedAmount={Number(dateWiseAmount) || 0}
                    dateLabel={row.date ? formatDisplayDate(row.date) : 'No date'}
                    onChange={(field, value) => updateHearingRow(row.id, field, value)}
                  />
                ))}
              </>
            ) : (
              <>
                {hearingFees.length === 0 && (
                  <p className="fee-hearing-empty">
                    No hearing dates added yet. Each date charges the Date-wise Amount above.
                  </p>
                )}

                {hearingFees.map(row => (
                  <div key={row.id} className="fee-hearing-row fee-hearing-row--single">
                    <input
                      className="form-input"
                      type="date"
                      value={row.date}
                      onChange={e => updateHearingRow(row.id, 'date', e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn-icon"
                      title="Remove"
                      onClick={() => removeHearingRow(row.id)}
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                ))}

                {hearingFees.length > 0 && (
                  <p className="fee-commission__preview">
                    {hearingFees.length} {hearingFees.length === 1 ? 'date' : 'dates'} ×{' '}
                    {formatCurrency(Number(dateWiseAmount) || 0)}:{' '}
                    <strong>{formatCurrency(hearingFees.length * (Number(dateWiseAmount) || 0))}</strong>
                  </p>
                )}
              </>
            )}
          </div>
          )}
        </div>
      )}
    </div>
  )
}
