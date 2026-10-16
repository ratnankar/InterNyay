const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function dateKey(value) {
  const s = String(value || '').slice(0, 10)
  return ISO_DATE.test(s) ? s : ''
}

export function formatDayLabel(isoDate) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const newestFirst = (a, b) => {
  if (a === b) return 0
  if (a === '') return 1
  if (b === '') return -1
  return b.localeCompare(a)
}

export function groupByYearMonth(items, getDate, withDays = false) {
  const tree = new Map()

  items.forEach(item => {
    const date = dateKey(getDate(item))
    const year = date ? date.slice(0, 4) : ''
    const month = date ? date.slice(0, 7) : ''
    if (!tree.has(year)) tree.set(year, new Map())
    const months = tree.get(year)
    if (!months.has(month)) months.set(month, [])
    months.get(month).push({ item, date })
  })

  return [...tree.keys()].sort(newestFirst).map(year => {
    const months = tree.get(year)

    const monthNodes = [...months.keys()].sort(newestFirst).map(month => {
      const entries = months.get(month).sort((a, b) => newestFirst(a.date, b.date))

      let days = null
      if (withDays) {
        const byDay = new Map()
        entries.forEach(e => {
          if (!byDay.has(e.date)) byDay.set(e.date, [])
          byDay.get(e.date).push(e.item)
        })
        days = [...byDay.entries()].map(([date, dayItems]) => ({
          key: date || 'undated-day',
          date,
          label: date ? formatDayLabel(date) : 'No date',
          count: dayItems.length,
          items: dayItems,
        }))
      }

      return {
        key: month || 'undated-month',
        label: month ? MONTH_NAMES[Number(month.slice(5, 7)) - 1] : 'No date',
        count: entries.length,
        items: entries.map(e => e.item),
        days,
      }
    })

    return {
      key: year || 'undated-year',
      label: year || 'Undated',
      count: monthNodes.reduce((sum, m) => sum + m.count, 0),
      months: monthNodes,
    }
  })
}
