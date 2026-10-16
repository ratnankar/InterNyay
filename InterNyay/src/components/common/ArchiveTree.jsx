import { useMemo, useState } from 'react'
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

export default function ArchiveTree({ items, getDate, withDays = false, forceOpen = false, defaultMonth, renderItems }) {
  const tree = useMemo(() => groupByYearMonth(items, getDate, withDays), [items, getDate, withDays])
  const [overrides, setOverrides] = useState({})

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
