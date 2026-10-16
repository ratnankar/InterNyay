// Phones: wide data tables (expenses, transactions, every admin list) are shown as one card per row instead of a sideways scroll.
// This copies each column heading onto its cells (data-label) so the card can say what every value is. The look itself is
// CSS only (styles/mobile-final.css, tables up to 640px wide); on a wide screen nothing changes.
const SELECTOR = 'table.txn-table, table.admin__table'

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

export function stackTables() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
  let queued = false
  const run = () => { queued = false; document.querySelectorAll(SELECTOR).forEach(label) }
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(run) } }
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true })
  schedule()
}