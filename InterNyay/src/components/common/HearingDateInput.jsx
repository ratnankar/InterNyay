import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../../context/AppContext'
import {
  formatDate, formatDisplayDate, getDaysInMonth, getFirstDayOfMonth,
  hearingDateProblem, isSunday, parseIsoDate,
} from '../../utils/dateUtils'

import Icon from './Icon'
// Weekday headers for the popover calendar
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
// Popover size in px, used to keep it inside the window
const POPOVER_W = 296
const POPOVER_H = 360

// Date field for the next hearing, with a calendar popup
export default function HearingDateInput({
  value,
  onChange,
  placeholder = 'Select date',
  clearable = true,
  className = '',
  // Case the date is for: it does not count against the limit of its own date
  caseId = null,
}) {
  // Dates the user crossed out as no-hearing days, and the daily hearing limit
  const { noHearingDates, isDayFull, dayFullProblem, hearingLimitFor, hearingCountsByDate } = useApp()

  // Whether the calendar popover is open
  const [open, setOpen] = useState(false)
  // Month currently shown in the popover
  const [view, setView] = useState(() => startOfMonth(value))
  // Screen position of the popover (it is placed relative to the field)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  // The field button and the popover itself, used for outside-click checks and positioning
  const fieldRef = useRef(null)
  const popRef = useRef(null)

  // Today's date as a formatted string
  const todayStr = formatDate(new Date())
  // Message if the chosen date is not allowed (for example a crossed-out day); marks the field invalid
  const problem = hearingDateProblem(value, noHearingDates, ds => dayFullProblem(ds, caseId))

  // Position the popover under the field, or above it if there isn't room below, and keep it inside the window width
  function place() {
    const el = fieldRef.current
    if (!el) return
    const r = el.getBoundingClientRect()

    const below = r.bottom + 6
    const preferred = below + POPOVER_H > window.innerHeight && r.top - 6 - POPOVER_H > 0
      ? r.top - 6 - POPOVER_H
      : below
    const top = Math.max(8, Math.min(preferred, window.innerHeight - POPOVER_H - 8))
    const left = Math.max(8, Math.min(r.left, window.innerWidth - POPOVER_W - 8))

    setPos({ top, left })
  }

  // Open or close the popover; when opening, jump to the selected month and position it
  function toggle() {
    if (!open) {
      setView(startOfMonth(value))
      place()
    }
    setOpen(o => !o)
  }

  // While open: click outside or Escape closes it, and it follows the field on resize or scroll
  useEffect(() => {
    if (!open) return undefined

    // Close the popup when the click lands outside it
    function onDown(e) {
      if (popRef.current?.contains(e.target) || fieldRef.current?.contains(e.target)) return
      setOpen(false)
    }
    // Escape closes only this popup
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)

    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  // Year and month of the month being displayed
  const year = view.getFullYear()
  const month = view.getMonth()

  // Choose a date, hand it to the parent and close the popover
  function pick(ds) {
    onChange(ds)
    setOpen(false)
  }

  return (
    <div className={`hdi ${className}`.trim()}>
      <div className="hdi__row">
      <button
        type="button"
        ref={fieldRef}
        className={`form-input hdi__field${open ? ' hdi__field--open' : ''}${problem ? ' hdi__field--invalid' : ''}`}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={problem || undefined}
      >
        <span className={value ? '' : 'hdi__placeholder'}>
          {value ? formatDisplayDate(value) : placeholder}
        </span>
        <span className="hdi__icon" aria-hidden="true"><Icon name="calendar" /></span>
      </button>

      {clearable && value && (
        <button
          type="button"
          className="hdi__clear"
          aria-label="Clear date"
          onClick={() => onChange('')}
        >
          <Icon name="close" />
        </button>
      )}
      </div>

      {problem && <p className="hdi__problem">{problem} — pick another date.</p>}

      {open && createPortal(
        <div
          ref={popRef}
          className="hdi__pop"
          role="dialog"
          aria-label="Choose a hearing date"
          style={{ top: pos.top, left: pos.left, width: POPOVER_W }}
        >
          <div className="hdi__head">
            <button type="button" className="hdi__nav" onClick={() => setView(new Date(year, month - 1, 1))} aria-label="Previous month">‹</button>
            <span className="hdi__month">
              {view.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </span>
            <button type="button" className="hdi__nav" onClick={() => setView(new Date(year, month + 1, 1))} aria-label="Next month">›</button>
          </div>

          <div className="hdi__grid">
            {DAYS.map((d, i) => (
              <div key={d} className={`hdi__dow${i === 0 ? ' hdi__dow--sunday' : ''}`}>{d}</div>
            ))}

            {Array(getFirstDayOfMonth(year, month)).fill(null).map((_, i) => <div key={`e${i}`} />)}

            {Array(getDaysInMonth(year, month)).fill(null).map((_, i) => {
              const day = i + 1
              const ds = formatDate(new Date(year, month, day))
              const sunday = isSunday(ds)
              const crossed = noHearingDates.has(ds)
              // A day that already holds its daily limit; the limit can be raised from the dashboard calendar
              const full = !crossed && ds !== value && isDayFull(ds, caseId)
              const blocked = crossed || full

              const cls = [
                'hdi__day',
                ds === value ? 'hdi__day--selected' : '',
                ds === todayStr ? 'hdi__day--today' : '',
                sunday ? 'hdi__day--sunday' : '',
                crossed ? 'hdi__day--crossed' : '',
                full ? 'hdi__day--full' : '',
              ].filter(Boolean).join(' ')

              return (
                <button
                  key={day}
                  type="button"
                  className={cls}
                  disabled={blocked}
                  title={
                    crossed ? 'Marked as a no-hearing date'
                    : full ? `Full — ${hearingCountsByDate.get(ds) || 0} of ${hearingLimitFor(ds)} hearings`
                    : undefined
                  }
                  onClick={() => pick(ds)}
                >
                  {day}
                  {crossed && (
                    <svg className="hdi__cross" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 5l14 14M19 5L5 19" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>

          <p className="hdi__legend">Crossed-out dates and full days can't be chosen.</p>
        </div>,
        document.body
      )}
    </div>
  )
}

// First day of the selected month (or this month if nothing is selected)
function startOfMonth(value) {
  const d = value ? parseIsoDate(value) : new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
