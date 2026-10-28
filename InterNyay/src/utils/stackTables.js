// Phones: wide data tables (expenses, transactions, every admin list) are shown as one card per row instead of a sideways scroll.
// This copies each column heading onto its cells (data-label) so the card can say what every value is. The look itself is
// CSS only (styles/responsive/small-screen-extra.css, tables up to 640px wide); on a wide screen nothing changes.
const SELECTOR = 'table.txn-table, table.admin__table'

// The cards only exist up to 640px wide, so nothing needs labelling on a bigger screen
const PHONE = '(max-width: 640px)'

function label(table) {
  const head = table.tHead?.rows[0]
  if (!head) return
  const names = []
  for (const th of head.cells) {
    for (let i = 0; i < (th.colSpan || 1); i++) names.push((th.textContent || '').replace(/\s+/g, ' ').trim())
  }
  for (const body of table.tBodies) {
    for (const row of body.rows) {
      let col = 0
      for (const cell of row.cells) {
        const name = names[col] || ''
        if (cell.dataset.label !== name) cell.dataset.label = name
        col += cell.colSpan || 1
      }
    }
  }
  table.classList.add('is-stackable')
}

// True when a change to the page touched a table (a table or row added or removed, or something inside one changed)
function touchesTable(mutations) {
  for (const m of mutations) {
    if (m.target.closest?.(SELECTOR)) return true
    for (const n of m.addedNodes) {
      if (n.nodeType === 1 && (n.matches(SELECTOR) || n.querySelector(SELECTOR))) return true
    }
  }
  return false
}

export function stackTables() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
  const phone = window.matchMedia(PHONE)
  let queued = false
  const run = () => { queued = false; if (phone.matches) document.querySelectorAll(SELECTOR).forEach(label) }
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(run) } }
  new MutationObserver(mutations => { if (phone.matches && touchesTable(mutations)) schedule() }).observe(document.body, { childList: true, subtree: true })
  // A window or tablet made narrower: label the tables that were already on the page
  phone.addEventListener?.('change', schedule)
  schedule()
}
