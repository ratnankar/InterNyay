import { useState, useEffect, useCallback, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import api from '../services/api'
import { onLiveRefresh } from '../utils/liveRefresh'
import {
  useCourts,
  useCourtSelection,
  courtDistrictLabel,
  hasNamedDistricts,
} from '../constants/courts'

import Icon from '../components/common/Icon'
import ImageViewer from '../components/common/ImageViewer'
import ArchiveTree from '../components/common/ArchiveTree'
import SeeMoreList from '../components/common/SeeMoreList'
import { getErrorMessage } from '../utils/errorMessages'
import { formatDate as isoDate, getDaysInMonth, getFirstDayOfMonth } from '../utils/dateUtils'
import { holidayCourtClass, holidayCourtLabel } from '../constants/holidays'
import { leavesByDate } from '../utils/leaveCounts'
import ModalPortal from '../components/common/ModalPortal'
import useSessionState from '../hooks/useSessionState'

// Each archive entry is dated by the first day of the month it stands for
const archiveEntryDate = e => e.monthStart

const STATUS_TEXT = { today: 'On leave today', upcoming: 'Upcoming leave', past: 'Leave ended' }

// Format a date like '5 Oct 2026', or a dash when empty
function formatDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const MS_DAY = 86400000

// Parse 'YYYY-MM-DD' as a local date at midnight, or null when unreadable
function parseDay(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str || ''))
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

// Number of days between two dates, both days included
function inclusiveDays(from, to) {
  return Math.round((to - from) / MS_DAY) + 1
}

// One archive entry for every calendar month the leave covers, each with the days that fall in that month
function expandByMonth(j, status) {
  const from = parseDay(j.leaveFrom)
  const to = parseDay(j.leaveTo)
  if (!from || !to || to < from) return [{ ...j, status, monthStart: j.leaveFrom, monthDays: 0, entryKey: `${j.id}` }]

  const entries = []
  let cursor = new Date(from.getFullYear(), from.getMonth(), 1)
  while (cursor <= to) {
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    const start = cursor < from ? from : cursor
    const end   = monthEnd > to ? to : monthEnd
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-01`
    entries.push({
      ...j,
      status,
      monthStart: key,
      monthDays: inclusiveDays(start, end),
      entryKey: `${j.id}|${key}`,
    })
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }
  return entries
}

// Placeholder rows while data loads
function LoadingRows() {
  return (
    <div className="qa-skeleton-wrap">
      {[1,2,3].map(i => <div key={i} className="qa-skeleton-row" />)}
    </div>
  )
}

// Error message with a Retry button
function ErrorState({ message, onRetry }) {
  return (
    <div className="qa-error-state">
      <span><Icon name="warning" /> {message || 'Failed to load data.'}</span>
      <button type="button" className="qa-retry-btn" onClick={onRetry}>Retry</button>
    </div>
  )
}

// Court buttons and, for courts with named districts, district buttons
function CourtFilter({ court, setCourt, district, setDistrict }) {
  const { courtNames, hierarchy } = useCourts()
  return (
    <div className="qa-court-filter">
      <div className="qa-filter-row">
        {courtNames.map(c => (
          <button
            key={c}
            className={`qa-filter-btn${court === c ? ' active' : ''}`}
            onClick={() => {
              setCourt(c)
              setDistrict(hierarchy[c][0])
            }}
          >{c}</button>
        ))}
      </div>

      {/* District buttons for the selected court */}
      {court !== 'All' && hasNamedDistricts(court) && (
        <div className="qa-filter-row qa-filter-row--sub">
          {hierarchy[court].map(d => (
            <button
              key={d}
              className={`qa-filter-btn qa-filter-btn--sub${district === d ? ' active' : ''}`}
              onClick={() => setDistrict(d)}
            >{d}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// Judge's photo from the Judges List in a circle, or the scales icon when there is no photo (or it fails to load)
function JudgeAvatar({ photo, name, large, onView }) {
  // Switch to the icon if the photo can't be loaded
  const [failed, setFailed] = useState(false)
  const size = large ? ' leave-avatar--lg' : ''

  if (photo && !failed) {
    const img = <img src={photo} alt={name || 'Judge'} onError={() => setFailed(true)} />
    // Only the detail popup makes the photo clickable
    return onView ? (
      <button type="button" className={`leave-avatar leave-avatar--photo leave-avatar--zoom${size}`} title="View full size" onClick={onView}>
        {img}
      </button>
    ) : (
      <div className={`leave-avatar leave-avatar--photo${size}`}>{img}</div>
    )
  }

  return <div className={`leave-avatar${size}`}><Icon name="scale" /></div>
}

// Popup with one judge's leave details and a button to jump to the Judges List
function JudgeLeaveDetailModal({ judge, status, onClose, onViewInList }) {
  // True while the judge's photo is open full size
  const [viewPhoto, setViewPhoto] = useState(false)

  // Nothing is shown until a judge is selected
  if (!judge) return null

  return (
    <ModalPortal>
      <div className="overlay" onClick={onClose}>
        <div className="modal modal--sm" onClick={e => e.stopPropagation()}>
          {/* Full-size view of the judge's photo */}
          {viewPhoto && judge.photo && (
            <ImageViewer src={judge.photo} alt={judge.name} caption={judge.name} onClose={() => setViewPhoto(false)} />
          )}
          <div className="modal__header">
            <h2 className="modal__title">Judge on Leave</h2>
            <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={onClose}><Icon name="close" /></button>
          </div>

          <div className="qa-leave-detail">
            <div className="qa-leave-detail__head">
              <JudgeAvatar
                photo={judge.photo}
                name={judge.name}
                large
                onView={judge.photo ? () => setViewPhoto(true) : undefined}
              />
              <div>
                <p className="qa-leave-detail__name">{judge.name}</p>
                <p className="qa-leave-detail__court">{courtDistrictLabel(judge.court, judge.district)}</p>
              </div>
            </div>

            {/* Status, reason and leave period */}
            <dl className="qa-leave-detail__fields">
              <div className="qa-leave-detail__field">
                <dt>Status</dt>
                <dd>
                  <span className={`qa-tag ${status === 'today' ? 'qa-tag--leave' : 'qa-tag--muted'}`}>
                    {STATUS_TEXT[status]}
                  </span>
                </dd>
              </div>

              {judge.reason && (
                <div className="qa-leave-detail__field">
                  <dt>Reason</dt>
                  <dd>{judge.reason}</dd>
                </div>
              )}

              <div className="qa-leave-detail__field">
                <dt>Leave Period</dt>
                <dd>{formatDate(judge.leaveFrom)} – {formatDate(judge.leaveTo)}</dd>
              </div>
            </dl>
          </div>

          {/* Close and View in Judges List buttons */}
          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={onClose}>Close</button>
            <button type="button" className="btn-gold" onClick={() => onViewInList(judge.name)}>
              View in Judges List
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

// Weekday headers for the leave calendar, starting on Sunday
const CAL_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// Month calendar showing how many judges are on leave each day; picking a day lists those judges
function LeaveCalendar({ leaves, holidays, onSelectJudge, todayList, upcomingList, renderToday, renderUpcoming, resetKey, searching }) {
  // Month being viewed and the day picked (a 'YYYY-MM-DD' string)
  const todayStr = isoDate(new Date())
  const [viewDate, setViewDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selected, setSelected] = useState(todayStr)

  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()

  // All holidays keyed by date; the court type decides the colour (green District, red High Court, split Both)
  const holidayByDate = useMemo(
    () => new Map((holidays || []).map(h => [h.date, h])),
    [holidays]
  )

  // Leaves that count on each date: none on Sundays, and a holiday removes the judges of the court it applies to
  // (District holiday: District judges; High Court holiday: High Court judges; Both: everyone)
  const byDay = useMemo(() => leavesByDate(leaves, holidays), [leaves, holidays])

  const goMonth = delta => setViewDate(new Date(year, month + delta, 1))
  const goToday = () => {
    setViewDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
    setSelected(todayStr)
  }

  // Leaves on the selected day, and the day's holiday, if any
  const dayLeaves  = byDay.get(selected) || []
  const dayHoliday = holidayByDate.get(selected)
  const selectedDate = parseDay(selected)
  const isSundaySel  = selectedDate?.getDay() === 0

  // Today's list follows the same rule as the numbers: nobody is listed on a Sunday or on a holiday of their court
  const countedTodayIds = new Set((byDay.get(todayStr) || []).map(({ j }) => j.id))
  const visibleToday    = todayList.filter(j => countedTodayIds.has(j.id))

  return (
    <div className="leave-cal">
      <div className="leave-cal__grid-wrap card calendar">
        <div className="calendar__header">
          <span className="calendar__month-label">
            {viewDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </span>
          <div className="calendar__nav">
            <button type="button" className="btn-outline calendar__nav-btn" onClick={goToday} title="Go to today">Today</button>
            <button type="button" className="btn-outline calendar__nav-btn" aria-label="Previous month" onClick={() => goMonth(-1)}>‹</button>
            <button type="button" className="btn-outline calendar__nav-btn" aria-label="Next month" onClick={() => goMonth(1)}>›</button>
          </div>
        </div>

        <div className="calendar__dow-grid">
          {CAL_DAYS.map((d, i) => (
            <div key={d} className={`calendar__dow${i === 0 ? ' calendar__dow--sunday' : ''}`}>{d}</div>
          ))}
        </div>

        <div className="calendar__days-grid">
          {Array(getFirstDayOfMonth(year, month)).fill(null).map((_, i) => <div key={`e${i}`} />)}

          {Array(getDaysInMonth(year, month)).fill(null).map((_, i) => {
            const day = i + 1
            const d   = new Date(year, month, day)
            const ds  = isoDate(d)
            const count   = byDay.get(ds)?.length || 0
            const holiday = holidayByDate.get(ds)
            const isSun   = d.getDay() === 0
            // Shade by absolute number of judges: 1 = light, 2-3 = medium, 4+ = dark
            const level = count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : 3

            const cls = [
              'cal-day',
              ds === selected ? 'cal-day--selected' : '',
              ds !== selected && ds === todayStr ? 'cal-day--today' : '',
              count && ds !== selected ? `cal-day--leave cal-day--leave-l${level}` : '',
              holiday && ds !== selected ? `cal-day--holiday cal-day--holiday-${holidayCourtClass(holiday)}` : '',
              ds !== selected && !holiday && isSun ? 'cal-day--sunday' : '',
              count && holiday && ds !== selected ? 'cal-day--leave-holiday' : '',
            ].filter(Boolean).join(' ')

            return (
              <button
                key={day}
                type="button"
                className={cls}
                aria-pressed={ds === selected}
                title={
                  count ? `${count} judge${count === 1 ? '' : 's'} on leave${holiday ? ` — ${holiday.label} holiday` : ''}`
                  : holiday ? `${holiday.label} — ${holidayCourtLabel(holiday)} holiday`
                  : isSun ? 'Sunday' : undefined
                }
                onClick={() => setSelected(ds)}
              >
                {day}
                {count > 0 && <span className="cal-day__count cal-day__count--leave">{count}</span>}
              </button>
            )
          })}
        </div>

        <div className="calendar__legend" aria-label="Calendar key">
          <span className="calendar__legend-item"><span className="holiday-swatch holiday-swatch--district" /> District Court holiday</span>
          <span className="calendar__legend-item"><span className="holiday-swatch holiday-swatch--high" /> High Court holiday</span>
          <span className="calendar__legend-item"><span className="holiday-swatch holiday-swatch--both" /> Both</span>
        </div>
      </div>

      {/* Judges on leave on the picked day */}
      <div className="leave-cal__day-panel">
        <div className="qa-section-header leave-cal__day-title">
          <span>
            {selectedDate
              ? selectedDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
              : selected}
            {selected === todayStr ? ' — Today' : ` (${dayLeaves.length})`}
          </span>
        </div>

        {dayHoliday && (
          <div className={`calendar__selected-holiday calendar__selected-holiday--${holidayCourtClass(dayHoliday)}`}>
            <span className="calendar__selected-holiday-dot" />
            <div>
              <p className="calendar__selected-holiday-label">{dayHoliday.label}</p>
              <p className="calendar__selected-holiday-court">{holidayCourtLabel(dayHoliday)} holiday</p>
            </div>
          </div>
        )}
        {!dayHoliday && isSundaySel && <p className="qa-empty">Sunday — courts are closed.</p>}

        {selected === todayStr ? <>
          {/* Today: who is on leave now, and the leave still to come */}
          <div className="qa-section-header">
            <span className="qa-dot qa-dot--red" />
            <span>On Leave Today ({visibleToday.length})</span>
          </div>
          {visibleToday.length === 0
            ? <p className="qa-empty">{searching ? 'No matching judges on leave today.' : 'No judges on leave today.'}</p>
            : (
              <SeeMoreList items={visibleToday} step={20} resetKey={`today|${resetKey}`}>
                {shown => shown.map(renderToday)}
              </SeeMoreList>
            )}

          <div className="qa-section-header qa-section-header--spaced">
            <span className="qa-dot qa-dot--amber" />
            <span>Upcoming Leave ({upcomingList.length})</span>
          </div>
          {upcomingList.length === 0
            ? <p className="qa-empty">{searching ? 'No matching upcoming leave.' : 'No upcoming leave.'}</p>
            : (
              <SeeMoreList items={upcomingList} step={20} resetKey={`upcoming|${resetKey}`}>
                {shown => shown.map(renderUpcoming)}
              </SeeMoreList>
            )}
        </> : <>
        {dayLeaves.length === 0
          ? <p className="qa-empty">No judges on leave on this day.</p>
          : (
            <SeeMoreList items={dayLeaves} step={20} resetKey={`cal|${selected}`}>
              {shown => shown.map(({ j, status }) => (
                <div
                  className="qa-row qa-row--clickable"
                  key={j.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectJudge(j, status)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectJudge(j, status) }
                  }}
                >
                  <div className="qa-row__left">
                    <JudgeAvatar photo={j.photo} name={j.name} />
                    <div>
                      <p className="qa-row__primary">{j.name}</p>
                      <p className="qa-row__secondary">{courtDistrictLabel(j.court, j.district)}</p>
                    </div>
                  </div>
                  <div className="qa-row__tags">
                    {j.reason && <span className="qa-tag qa-tag--leave">{j.reason}</span>}
                    <span className="qa-tag qa-tag--muted">{formatDate(j.leaveFrom)} – {formatDate(j.leaveTo)}</span>
                  </div>
                </div>
              ))}
            </SeeMoreList>
          )}
        </>}
      </div>
    </div>
  )
}

// List of judges on leave today and upcoming, with search and court filters
function JudgesOnLeaveBody({ onSelectJudge }) {
  // Selected court and district, search text, loaded data, loading and error state, and the judge shown in the popup
  const { court, setCourt, district, setDistrict, ready } = useCourtSelection()
  const { holidays } = useApp()
  const [query,      setQuery]      = useState('')
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [detail,     setDetail]     = useState(null)
  // 'current' shows today and upcoming leave, 'archive' shows the history of ended leave
  const [view,       setView]       = useSessionState('judges_leave_view', 'current')

  // Load judges on leave for the selected court and district
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(null) }
    try {
      const result = await api.quickAccess.getJudgesOnLeave({
        court:  court  !== 'All' ? court  : undefined,
        district:  district  !== 'All' ? district  : undefined,
      })
      setData(result)
    } catch (e) { if (!silent) setError(getErrorMessage(e, "We couldn't load the judges on leave. Please try again.")) }
    finally { if (!silent) setLoading(false) }
  }, [court, district])

  // Reload whenever the court or district changes
  useEffect(() => { if (ready) fetchData() }, [fetchData, ready])
  useEffect(() => onLiveRefresh(() => { if (ready) fetchData(true) }), [fetchData, ready])

  // Check the search text against name, court, district and reason
  const matchesQuery = useCallback((j) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return [j.name, j.court, j.district, j.reason]
      .filter(Boolean)
      .some(v => v.toLowerCase().includes(q))
  }, [query])

  // Build a row renderer for a status ('today' or 'upcoming'); clicking or pressing Enter opens the detail popup
  const makeRow = status => (j) => (
    <div
      className="qa-row qa-row--clickable"
      key={j.id}
      role="button"
      tabIndex={0}
      onClick={() => setDetail({ judge: j, status })}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setDetail({ judge: j, status })
        }
      }}
    >
      <div className="qa-row__left">
        <JudgeAvatar photo={j.photo} name={j.name} />
        <div>
          <p className="qa-row__primary">{j.name}</p>
          <p className="qa-row__secondary">
            {courtDistrictLabel(j.court, j.district)}
          </p>
        </div>
      </div>
      <div className="qa-row__tags">
        {j.reason && <span className="qa-tag qa-tag--leave">{j.reason}</span>}
        <span className="qa-tag qa-tag--muted">{formatDate(j.leaveFrom)} – {formatDate(j.leaveTo)}</span>
      </div>
    </div>
  )

  // Row renderers for each list
  const RowToday    = makeRow('today')
  const RowUpcoming = makeRow('upcoming')

  // Archive row: shows the full duration, the days in that month, and whether the dates are final or still a reference
  const RowArchive = (e) => {
    const reference = e.status !== 'past'
    return (
      <div
        className="qa-row qa-row--clickable"
        key={e.entryKey}
        role="button"
        tabIndex={0}
        onClick={() => setDetail({ judge: e, status: e.status })}
        onKeyDown={ev => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault()
            setDetail({ judge: e, status: e.status })
          }
        }}
      >
        <div className="qa-row__left">
          <JudgeAvatar photo={e.photo} name={e.name} />
          <div>
            <p className="qa-row__primary">{e.name}</p>
            <p className="qa-row__secondary">{courtDistrictLabel(e.court, e.district)}</p>
          </div>
        </div>
        <div className="qa-row__tags">
          {reference && (
            <span className={`qa-tag ${e.status === 'today' ? 'qa-tag--leave' : 'qa-tag--muted'}`}>
              {e.status === 'today' ? 'On leave now' : 'Upcoming'}
            </span>
          )}
          {e.reason && <span className="qa-tag qa-tag--leave">{e.reason}</span>}
          <span className="qa-tag qa-tag--muted">
            {formatDate(e.leaveFrom)} – {formatDate(e.leaveTo)}
          </span>
        </div>
      </div>
    )
  }

  // Judges on leave today and upcoming leave, after the search filter
  const today    = (data?.onLeaveToday || []).filter(matchesQuery)
  const upcoming = (data?.upcoming     || []).filter(matchesQuery)
  const past     = (data?.past         || []).filter(matchesQuery)

  // Archive: every leave, ended or not, repeated under each month it covers.
  // Leaves still current or upcoming carry their scraped dates for reference until they end.
  const archiveEntries = useMemo(() => {
    const all = [
      ...past.map(j => ({ j, status: 'past' })),
      ...today.map(j => ({ j, status: 'today' })),
      ...upcoming.map(j => ({ j, status: 'upcoming' })),
    ].sort((a, b) =>
      String(b.j.leaveFrom).localeCompare(String(a.j.leaveFrom)) ||
      String(a.j.name).localeCompare(String(b.j.name)))
    return all.flatMap(({ j, status }) => expandByMonth(j, status))
  }, [past, today, upcoming])
  const archiveLeaveCount = past.length + today.length + upcoming.length
  // Every leave with its status, for the calendar
  const calendarLeaves = useMemo(() => [
    ...past.map(j => ({ j, status: 'past' })),
    ...today.map(j => ({ j, status: 'today' })),
    ...upcoming.map(j => ({ j, status: 'upcoming' })),
  ], [past, today, upcoming])
  const now = new Date()
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  return (
    <div>
      {/* Search box */}
      <input
        className="qa-search"
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search by judge name, court, district or reason"
      />

      {/* Court and district filters, with the archive button on the same line so no empty row is left above the calendar */}
      <div className="leave-filterbar">
        <CourtFilter court={court} setCourt={setCourt} district={district} setDistrict={setDistrict} />

        {/* The calendar is the main view; the archive of ended leave opens from this button */}
        <button
          type="button"
          className="qa-filter-btn leave-filterbar__archive"
          onClick={() => setView(view === 'archive' ? 'current' : 'archive')}
        >
          {view === 'archive' ? '← Back to calendar' : `Leave archive${data ? ` (${archiveLeaveCount})` : ''}`}
        </button>
      </div>

      {/* Loading, error, or the lists */}
      {loading ? <LoadingRows /> : error ? <ErrorState message={error} onRetry={fetchData} /> : <>
        {/* Note explaining where Rouse Avenue leave data comes from */}
        {court === 'Rouse Avenue' && (
          <p className="qa-empty u-mb-12">
            Rouse Avenue publishes no leave list of its own. These are the judges
            on the Central and New Delhi lists who also sit at Rouse Avenue,
            matched against the Rouse Avenue Judges List.
          </p>
        )}

        {view === 'current' && (
          <LeaveCalendar
            leaves={calendarLeaves}
            holidays={holidays}
            onSelectJudge={(judge, status) => setDetail({ judge, status })}
            todayList={today}
            upcomingList={upcoming}
            renderToday={RowToday}
            renderUpcoming={RowUpcoming}
            resetKey={`${court}|${district}|${query}`}
            searching={!!query.trim()}
          />
        )}

        {view === 'archive' && <>
          {/* Archive: every leave under each month it covers, by year and month */}
          <div className="qa-section-header qa-section-header--spaced">
            <span className="qa-dot qa-dot--grey" />
            <span>Leave Archive ({archiveLeaveCount})</span>
          </div>
          <p className="qa-empty u-mb-12">
            A leave appears under every month it covers.
          </p>
          {archiveEntries.length === 0
            ? <p className="qa-empty">{query.trim() ? 'No matching leave in the archive.' : 'No leave in the archive.'}</p>
            : (
              <ArchiveTree
  stateKey="judges_leave"
                items={archiveEntries}
                getDate={archiveEntryDate}
                forceOpen={!!query.trim()}
                defaultMonth={currentMonthKey}
                renderItems={monthItems => (
                  <SeeMoreList items={monthItems} step={25} resetKey={query.trim()}>
                    {shown => shown.map(RowArchive)}
                  </SeeMoreList>
                )}
              />
            )}
        </>}
      </>}

      {/* Detail popup; View in Judges List closes it and jumps to that judge */}
      <JudgeLeaveDetailModal
        judge={detail?.judge}
        status={detail?.status}
        onClose={() => setDetail(null)}
        onViewInList={name => {
          setDetail(null)
          onSelectJudge?.(name)
        }}
      />
    </div>
  )
}

// Judges on Leave page wrapper
export default function JudgesOnLeavePage() {
  const { setActiveNav, setJudgeLeaveJumpQuery } = useApp()

  // Open the Judges List in Quick Access, searching for the given judge
  const jumpToJudgesList = name => {
    setJudgeLeaveJumpQuery(name)
    setActiveNav('quickaccess')
  }

  return (
    <div>
      {/* Page title and subtitle */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Judges on Leave</h1>
          <p className="page-subtitle">Current, upcoming &amp; past judicial leave — Delhi District Courts</p>
        </div>
      </div>

      {/* Panel containing the judges on leave list */}
      <div className="qa-panel card">
        <div className="qa-panel__body">
          <JudgesOnLeaveBody onSelectJudge={jumpToJudgesList} />
        </div>
      </div>
    </div>
  )
}