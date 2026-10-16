import { FEE_TYPES, STAGEWISE_FEE_TYPE } from '../constants/data'

// Every fee type including stage wise
const ALL_FEE_TYPES = [...FEE_TYPES, STAGEWISE_FEE_TYPE]

// Fee types the user may choose from: corporate panel clients only get stage wise, normal cases hide stage wise
export function feeTypesFor({ corporatePanel = false, hasClient = true } = {}) {
  if (corporatePanel) return [STAGEWISE_FEE_TYPE]
  if (hasClient) return FEE_TYPES
  return ALL_FEE_TYPES
}

// Display name of a fee type (defaults to One-Time)
export function feeTypeLabel(feeType) {
  return ALL_FEE_TYPES.find(t => t.value === feeType)?.label || 'One-Time'
}

// Icon name used for each fee type
const FEE_TYPE_ICONS = {
  TOTAL: 'money',
  DATEWISE: 'calendar',
  STAGEWISE: 'stairs',
}

// Icon for a fee type, defaulting to the one-time icon
export function feeTypeIcon(feeType) {
  return FEE_TYPE_ICONS[feeType] || FEE_TYPE_ICONS.TOTAL
}

// Sum of all stage fee amounts
export function stageTotal(rows) {
  return (Array.isArray(rows) ? rows : []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
}

// Removes completely empty stage rows and trims the names before saving
export function cleanStageFees(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter(r => String(r.name || '').trim() !== '' || String(r.amount ?? '') !== '')
    .map(r => ({ ...r, name: String(r.name || '').trim() }))
}

// Keeps only hearing fee rows that have a date and some amount or paid status
export function cleanHearingFees(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter(r => String(r.date || '').trim() !== '')
    .filter(r =>
      String(r.amount ?? '').trim() !== '' ||
      String(r.amountReceived ?? '').trim() !== '' ||
      !!r.paid
    )
}

// Builds the full fee picture of a case: list of fee items plus total, paid and due, depending on the fee type
export function caseFeeSummary(c) {

  if (!c) {
    return { total: 0, paid: 0, due: 0, items: [] }
  }

  const items = []

  // Adds one item per hearing fee row, working out the amount and how much has been received
  function pushHearingFees(rows, referenceAmount) {
    ;(rows || []).forEach(row => {
      // A row can have its own amount; otherwise the fixed per-date amount (or the received amount) is used
      const hasOwnAmount = row.amount !== '' && row.amount != null
      const hasReceived = row.amountReceived !== '' && row.amountReceived != null
      const received = hasReceived ? Number(row.amountReceived) || 0 : 0

      const amount = hasOwnAmount
        ? Number(row.amount) || 0
        : referenceAmount != null
          ? Number(referenceAmount) || 0
          : received

      // If no received amount was entered, a paid row counts as fully received
      const finalReceived = hasReceived ? received : (row.paid ? amount : 0)

      items.push({
        key: `hearing-${row.id}`,
        label: row.date ? `Hearing Fee — ${row.date}` : 'Hearing Fee',
        date: row.date,
        amount,
        paid: amount > 0 && finalReceived >= amount,
        amountReceived: finalReceived,
        remaining: Math.max(amount - finalReceived, 0),
      })
    })
  }

  // Date wise: optional initial amount plus a fee for each hearing date
  if (c.feeType === 'DATEWISE') {

    // Initial amount paid when the case is taken
    if (c.initialAmount) {
      items.push({
        key: 'initial',
        label: 'Initial Amount',
        date: c.initialAmountDate || null,
        amount: Number(c.initialAmount) || 0,
        paid: !!c.initialPaid
      })
    }

    // Each hearing uses the fixed date wise amount unless it has its own
    pushHearingFees(c.hearingFees, c.dateWiseAmount)

  // Stage wise: one fee per stage of the case
  } else if (c.feeType === 'STAGEWISE') {

    ;(c.stageFees || []).forEach(row => {
      const name   = String(row.name || '').trim()
      const amount = Number(row.amount) || 0

      if (!name && !amount) return

      items.push({
        key: `stage-${row.id}`,
        label: name ? `Stage — ${name}` : 'Stage',
        date: null,
        amount,
        paid: !!row.paid
      })
    })

  // One-time (total) fee: initial amount, total fee and any hearing fees
  } else {

    // Initial amount
    if (c.initialAmount) {
      items.push({
        key: 'initial',
        label: 'Initial Amount',
        date: c.initialAmountDate || null,
        amount: Number(c.initialAmount) || 0,
        paid: !!c.initialPaid
      })
    }

    // One-time fee for the whole case
    if (c.totalFeeAmount) {
      items.push({
        key: 'total',
        label: 'One-Time Fee',
        date: c.totalFeeAmountDate || null,
        amount: Number(c.totalFeeAmount) || 0,
        paid: !!c.totalFeePaid
      })
    }

    // Extra hearing fees
    pushHearingFees(c.hearingFees, null)
  }

  // Totals: what was charged, what has been received and what is still due
  const total = items.reduce((s, i) => s + i.amount, 0)
  // Received amount per item is capped at the item amount
  const paid  = items.reduce((s, i) => {
    if (i.amountReceived != null) return s + Math.min(i.amountReceived, i.amount)
    return s + (i.paid ? i.amount : 0)
  }, 0)

  return { total, paid, due: total - paid, items }
}