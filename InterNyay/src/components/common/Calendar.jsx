import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { formatDate, getDaysInMonth, getFirstDayOfMonth, formatShortDate } from '../../utils/dateUtils'
import { holidayCourtClass, holidayCourtLabel } from '../../constants/holidays'

import Icon from './Icon'
import HearingLimitModal from '../modals/HearingLimitModal'
import { confirmDialog } from '../../utils/confirmDialog'
// Weekday headers for the month grid, starting on Sunday
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// getDay() returns 0 for Sunday
const SUNDAY = 0

// Month calendar with holidays and hearing counts, picking a day selects that date
export default function Calendar() {
  const {
    cases, holidays, hearingCountsByDate,
    calendarDate, setCalendarDate, calendarViewDate, setCalendarViewDate,
    noHearingDates, toggleNoHearingDate, hearingLimitFor,
  } = useApp()

  // Whether the upcoming-holidays list is expanded
  const [holidaysOpen, setHolidaysOpen] = useState(false)
  // Whether the daily hearing limit window is open
  const [limitOpen, setLimitOpen] = useState(false)

  // Month currently being viewed in the grid (not necessarily the selected date)
  const year  = calendarViewDate.getFullYear()
  const month = calendarViewDate.getMonth()
  // Dates are compared as formatted strings, same format as the hearing dates on cases
  const todayStr    = formatDate(new Date())
  const selectedStr = formatDate(calendarDate)

  // Month navigation only changes the viewed month, not the selected date
  const prevMonth = () => setCalendarViewDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCalendarViewDate(new Date(year, month + 1, 1))

  // Lookup so each day cell can check for a holiday quickly
  const holidayByDate = new Map((holidays || []).map(h => [h.date, h]))

  // Holiday (if any) that falls on the selected date
  const selectedHoliday = holidayByDate.get(selectedStr)

  // Sundays are always off for court hearings
  const selectedIsSunday  = calendarDate.getDay() === SUNDAY
  // True if the user has marked this date as a no-hearing day
  const selectedIsCrossed = noHearingDates.has(selectedStr)

  // Limit that applies to the selected date, null when there is none
  const selectedLimit = hearingLimitFor(selectedStr)

  // Mark or unmark a day as no-hearing; warn first if cases are already listed on it because they won't move automatically
  async function toggleCross() {
    const listed = cases.filter(c => c.nextHearing === selectedStr).length
    if (!selectedIsCrossed && listed > 0) {
      const ok = await confirmDialog({
        title: 'Cross out this date?',
        message:
          `${listed} case${listed === 1 ? ' is' : 's are'} already listed for this date.\n\n` +
          `Crossing it out will not move ${listed === 1 ? 'it' : 'them'} — you will need to give ` +
          `${listed === 1 ? 'it' : 'each'} a new hearing date.`,
        confirmLabel: 'Cross out anyway',
        danger: true,
      })
      if (!ok) return
    }
    toggleNoHearingDate(selectedStr)
  }

  // Next three holidays from today, shown in the side list
  const upcomingHolidays = (holidays || [])
    .filter(h => h.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3)

  return (
    <div className="card calendar">
      <div className="calendar__header">
        <span className="calendar__month-label">
          {calendarViewDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
        </span>
        <div className="calendar__nav">
          <button type="button" className="btn-outline calendar__nav-btn" onClick={prevMonth}>‹</button>
          <button type="button" className="btn-outline calendar__nav-btn" onClick={nextMonth}>›</button>
        </div>
      </div>

      <div className="calendar__dow-grid">
        {DAYS.map((d, i) => (
          <div
            key={d}
            className={`calendar__dow${i === SUNDAY ? ' calendar__dow--sunday' : ''}`}
          >
            {d}
          </div>
        ))}
      </div>

      <div className="calendar__days-grid">
        {Array(getFirstDayOfMonth(year, month)).fill(null).map((_, i) => (
          <div key={`e${i}`} />
        ))}

        {Array(getDaysInMonth(year, month)).fill(null).map((_, i) => {
          const day = i + 1
          const d   = new Date(year, month, day)
          const ds  = formatDate(d)
          const isSelected = selectedStr === ds
          const isToday    = todayStr === ds
          const hearingCount = hearingCountsByDate.get(ds) || 0
          const holiday    = holidayByDate.get(ds)
          const dow        = d.getDay()
          const isSundayCell = dow === SUNDAY
          const isCrossed  = noHearingDates.has(ds)
          const dayLimit   = hearingLimitFor(ds)
          const isFull     = dayLimit != null && hearingCount >= dayLimit

          const cls = [
            'cal-day',
            isSelected ? 'cal-day--selected' : '',
            !isSelected && isToday ? 'cal-day--today' : '',
            holiday && !isSelected ? `cal-day--holiday cal-day--holiday-${holidayCourtClass(holiday)}` : '',
            !isSelected && !holiday && isSundayCell ? 'cal-day--sunday' : '',
            isCrossed ? 'cal-day--crossed' : '',
            isFull && !isCrossed ? 'cal-day--full' : '',
          ].filter(Boolean).join(' ')

          return (
            <button
              key={day}
              className={cls}
              title={
                isCrossed ? 'No hearing on this date'
                : holiday ? `${holiday.label} — ${holidayCourtLabel(holiday)} holiday`
                : isSundayCell ? 'Sunday — no hearings'
                : hearingCount > 0 ? `${hearingCount} hearing${hearingCount === 1 ? '' : 's'}${dayLimit != null ? ` of ${dayLimit}${isFull ? ' — full' : ''}` : ''}`
                : undefined
              }
              onClick={() => setCalendarDate(d)}
            >
              {day}
              {isCrossed && (
                <svg className="cal-day__cross" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 5l14 14M19 5L5 19" />
                </svg>
              )}
              {hearingCount > 0 && (
                <span className="cal-day__count">{hearingCount}</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="calendar__legend" aria-label="Holiday colours">
        <span className="calendar__legend-item">
          <span className="holiday-swatch holiday-swatch--district" /> District Court
        </span>
        <span className="calendar__legend-item">
          <span className="holiday-swatch holiday-swatch--high" /> High Court
        </span>
        <span className="calendar__legend-item">
          <span className="holiday-swatch holiday-swatch--both" /> Both
        </span>
        <span className="calendar__legend-item">
          <span className="holiday-swatch holiday-swatch--full" /> Day full
        </span>
      </div>

      <div className="calendar__cross-box">
        {selectedIsSunday ? (
          <p className="calendar__cross-note">Sunday — no hearings can be set on this day.</p>
        ) : (
          <>
            <button
              type="button"
              className={`btn-outline btn-outline--sm calendar__cross-btn${selectedIsCrossed ? ' calendar__cross-btn--on' : ''}`}
              onClick={toggleCross}
              title={selectedIsCrossed
                ? 'Take the cross off — hearings can be set on this date again'
                : 'Mark this date so no hearing can be set on it'}
            >
              {selectedIsCrossed ? <><Icon name="close" /> Remove cross from this date</> : <><Icon name="close" /> Mark as no-hearing date</>}
            </button>
            <button
              type="button"
              className="btn-outline btn-outline--sm calendar__cross-btn calendar__limit-btn"
              onClick={() => setLimitOpen(true)}
              title="Set how many hearings can be listed on this date and on a usual day"
            >
              Daily hearing limit{selectedIsCrossed ? ': 0' : selectedLimit != null ? `: ${selectedLimit}` : ''}
            </button>
            {selectedIsCrossed && (
              <p className="calendar__cross-note">No hearing will be taken on this date.</p>
            )}
          </>
        )}
      </div>

      {selectedHoliday && (
        <div className={`calendar__selected-holiday calendar__selected-holiday--${holidayCourtClass(selectedHoliday)}`}>
          <span className="calendar__selected-holiday-dot" />
          <div>
            <p className="calendar__selected-holiday-label">{selectedHoliday.label}</p>
            <p className="calendar__selected-holiday-court">
              {formatShortDate(selectedHoliday.date)} · {holidayCourtLabel(selectedHoliday)} holiday
            </p>
            {selectedHoliday.description && (
              <p className="calendar__selected-holiday-desc">{selectedHoliday.description}</p>
            )}
          </div>
        </div>
      )}

      {limitOpen && <HearingLimitModal dateStr={selectedStr} onClose={() => setLimitOpen(false)} />}

      {upcomingHolidays.length > 0 && (
        <div className="calendar__upcoming calendar__upcoming--holidays">
          <button
            type="button"
            className="calendar__upcoming-label calendar__upcoming-label--toggle"
            aria-expanded={holidaysOpen}
            onClick={() => setHolidaysOpen(o => !o)}
          >
            <span>UPCOMING HOLIDAYS ({upcomingHolidays.length})</span>
            <span className="calendar__upcoming-caret">{holidaysOpen ? '▾' : '▸'}</span>
          </button>
          {holidaysOpen && upcomingHolidays.map(h => (
            <div key={h.id} className="calendar__upcoming-row">
              <p className="calendar__upcoming-title">
                <span
                  className={`holiday-swatch holiday-swatch--${holidayCourtClass(h)}`}
                  title={`${holidayCourtLabel(h)} holiday`}
                />
                {h.label}
              </p>
              <p className={`calendar__upcoming-date calendar__upcoming-date--holiday calendar__upcoming-date--holiday-${holidayCourtClass(h)}`}>
                {formatShortDate(h.date)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}