import { useId, useMemo } from 'react'
import useSessionState from '../../hooks/useSessionState'
import { groupByYearMonth } from '../../utils/archiveUtils'

function Head({ level, open, label, count, onToggle }) {
  return (
    <button
      type="button"
      className={`archive__head archive__head--${level}`}
      aria-expanded={open}
      onClick={onToggle}
    >
      <span className={`archive__chevron${open ? ' archive__chevron--open' : ''}`} aria-hidden="true" />
      <span className="archive__label">{label}</span>
      <span className="archive__count">{count}</span>
    </button>
  )
}

// Year > month (> day) collapsible list.
// stateKey keeps which groups are open while the admin/advocate stays signed in (a refresh keeps them); without it the state is local
export default function ArchiveTree({ items, getDate, withDays = false, forceOpen = false, defaultMonth, renderItems, stateKey }) {
  const tree = useMemo(() => groupByYearMonth(items, getDate, withDays), [items, getDate, withDays])
  const fallbackId = useId()
  const [overrides, setOverrides] = useSessionState(`archive_${stateKey ?? fallbackId}`, {})

  // Every group key in the tree, for Expand all / Collapse all
  const allKeys = useMemo(() => {
    const keys = []
    tree.forEach(year => {
      keys.push(year.key)
      year.months.forEach(month => {
        keys.push(month.key)
        if (withDays) month.days.forEach(day => keys.push(day.key))
      })
    })
    return keys
  }, [tree, withDays])
  const setAll = open => setOverrides(Object.fromEntries(allKeys.map(k => [k, open])))

  const defaults = useMemo(() => {
    const keys = new Set()
    // Open the given month (YYYY-MM) when it exists, otherwise the newest one
    const wanted = defaultMonth
      ? tree.find(y => y.months.some(m => m.key === defaultMonth))
      : null
    const year = wanted || tree[0]
    const month = wanted ? wanted.months.find(m => m.key === defaultMonth) : year?.months[0]
    if (year) keys.add(year.key)
    if (month) keys.add(month.key)
    if (withDays && month?.days?.[0]) keys.add(month.days[0].key)
    return keys
  }, [tree, withDays, defaultMonth])

  const isOpen = key => forceOpen || (key in overrides ? overrides[key] : defaults.has(key))
  const toggle = key => setOverrides(o => ({ ...o, [key]: !isOpen(key) }))

  return (
    <div className="archive">
      {/* Only worth showing when there is more than a year and a month to open */}
      {!forceOpen && allKeys.length > 2 && (
        <div className="archive__tools">
          <button type="button" className="btn-outline btn-outline--sm" onClick={() => setAll(true)}>Expand all</button>
          <button type="button" className="btn-outline btn-outline--sm" onClick={() => setAll(false)}>Collapse all</button>
        </div>
      )}

      {tree.map(year => {
        const yearKey = year.key
        const yearOpen = isOpen(yearKey)

        return (
          <section key={year.key} className="archive__year">
            <Head level="year" open={yearOpen} label={year.label} count={year.count} onToggle={() => toggle(yearKey)} />

            {yearOpen && (
              <div className="archive__body">
                {year.months.map(month => {
                  const monthKey = month.key
                  const monthOpen = isOpen(monthKey)

                  return (
                    <div key={month.key} className="archive__month">
                      <Head level="month" open={monthOpen} label={month.label} count={month.count} onToggle={() => toggle(monthKey)} />

                      {monthOpen && (
                        <div className="archive__body">
                          {withDays
                            ? month.days.map(day => {
                                const dayKey = day.key
                                const dayOpen = isOpen(dayKey)

                                return (
                                  <div key={day.key} className="archive__day">
                                    <Head level="day" open={dayOpen} label={day.label} count={day.count} onToggle={() => toggle(dayKey)} />
                                    {dayOpen && <div className="archive__body">{renderItems(day.items)}</div>}
                                  </div>
                                )
                              })
                            : renderItems(month.items)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
