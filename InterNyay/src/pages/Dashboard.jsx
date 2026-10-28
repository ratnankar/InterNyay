import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import Calendar from '../components/common/Calendar'
import Notifications from '../components/common/Notifications'
import CaseHearings from '../components/common/CaseHearings'
import { isClosedCase, STATUS_COLORS } from '../constants/data'
import { formatDisplayDate } from '../utils/dateUtils'
import CaseFields from '../components/common/CaseFields'
import { caseNatureOf } from '../utils/caseClassification'
import useHearingLeave from '../hooks/useHearingLeave'
import useMiscHearingsOn from '../hooks/useMiscHearingsOn'
import DashboardMiscHearing from '../components/misc/DashboardMiscHearing'
import { useMyCourts, roomLabel } from '../constants/courts'

import Icon from '../components/common/Icon'
import { greetingName } from '../utils/nameUtils'
// Greeting that depends on the time of day
function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good Morning'
  if (hour < 17) return 'Good Afternoon'
  return 'Good Evening'
}

// "Today" or "Tomorrow" when the selected calendar date is today or tomorrow, otherwise an empty text
function dayWord(date) {
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOfDay(date) - startOfDay(new Date())) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  return ''
}

// Greeting, today's date and the New Case button. Kept in its own memoised component so that hearing and reminder
// updates elsewhere on the dashboard never re-render or re-measure it (that made the New Case button flicker)
const DashboardHeader = memo(function DashboardHeader({ userName, onNewCase }) {
  // Greeting name: first name (with title). When even that does not fit on one line, "Counsel" is shown instead
  const titleRef = useRef(null)
  const [tooLong, setTooLong] = useState(false)
  const [viewWidth, setViewWidth] = useState(() => window.innerWidth)
  const shownName = greetingName(userName)
  useEffect(() => {
    const onResize = () => setViewWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // A new name or screen width starts from the real name again
  useLayoutEffect(() => { setTooLong(false) }, [shownName, viewWidth])
  // Only when the name, width or fit state changes: if the line is wider than its space, switch to "Counsel"
  useLayoutEffect(() => {
    const el = titleRef.current
    if (el && !tooLong && el.scrollWidth > el.clientWidth + 1) setTooLong(true)
  }, [shownName, viewWidth, tooLong])

  return (
    <div className="page-header page-header--hero">
      <div className="page-header__main">
        <h1 className="page-title page-title--one-line" ref={titleRef}>{getGreeting()}, <span className="page-title__name">{(!tooLong && shownName) || 'Counsel'}</span></h1>
        <p className="page-subtitle">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>
      <button type="button" className="btn-gold" onClick={onNewCase}>+ New Case</button>
    </div>
  )
})

// Dashboard: hearings for the selected calendar date, with the calendar and notifications beside them
export default function Dashboard() {
  const {
    cases, clients, calendarDate, calendarDateKey, todayCases,
    openCase, setShowAddCase,
    expandedHearingCaseId, setExpandedHearingCaseId,
    whatsappBusy, sendHearingReminder, toggleCaseReminders, caseRemindersOn, caseHasReminderNumber,
    openEditFee, currentUser,
  } = useApp()

  // The user's courts, most cases first. Hearings at these courts come first, grouped under a court heading
  const myPlaces = useMyCourts()
  // Misc. applications listed on the selected date: their own cards, with the application's details
  const miscToday = useMiscHearingsOn(calendarDateKey)
  // Cases and misc. applications of the day in one list: grouped by court, each court's cases first, then its applications
  const sortedRows = useMemo(() => {
    const rank = new Map()
    myPlaces.forEach(p => { if (!rank.has(p.court)) rank.set(p.court, rank.size) })
    const rankOf = row => (rank.has(row.court) ? rank.get(row.court) : rank.size)
    const rows = [
      ...todayCases.map(c => ({ court: c.court || '', caseItem: c })),
      ...miscToday.map(a => ({ court: a.court || '', miscApp: a })),
    ]
    // Stable sort: the original order is kept inside each court
    return rows.sort((a, b) => {
      const byCourt = rankOf(a) - rankOf(b)
      return byCourt || a.court.localeCompare(b.court) || (a.caseItem ? 0 : 1) - (b.caseItem ? 0 : 1)
    })
  }, [todayCases, miscToday, myPlaces])
  // Court headings only help when the day has hearings at more than one court
  const showCourtHeadings = new Set(sortedRows.map(r => r.court)).size > 1

  const openNewCase = useCallback(() => setShowAddCase(true), [setShowAddCase])

  const hearingTotal = todayCases.length + miscToday.length

  // Judge, cause list number and leave details for each hearing on the selected date
  const hearingInfo = useHearingLeave(calendarDate, todayCases)

  // Scroll the expanded hearing card into view
  useEffect(() => {
    if (expandedHearingCaseId == null) return
    const el = document.getElementById(`hearing-card-${expandedHearingCaseId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [expandedHearingCaseId, calendarDateKey])

  // Expand a hearing card, or collapse it if it is already open
  function toggleExpanded(caseId) {
    setExpandedHearingCaseId(expandedHearingCaseId === caseId ? null : caseId)
  }

  // Open the case on the Cases page; stopPropagation keeps the card from toggling
  function openInCases(e, c) {
    e.stopPropagation()
    openCase(c)
  }

  return (
    <div>
      <DashboardHeader userName={currentUser?.name} onNewCase={openNewCase} />

      {/* Main column with hearings, side column with calendar and notifications */}
      <div className="dashboard__grid">
        <div className="dashboard__main">

        {/* Hearings for the selected date */}
        <div className="card hearings-panel">
          {/* Panel title and hearing count */}
          <div className="hearings-panel__header">
            <h2 className="section-title">
              Hearings — {dayWord(calendarDate) && `${dayWord(calendarDate)}, `}{calendarDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </h2>
            <span className="hearings-panel__count">
              {hearingTotal} hearing{hearingTotal !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Empty state, otherwise one card per hearing */}
          {hearingTotal === 0 ? (
            <div className="empty-state">
              <div className="empty-state__icon"><Icon name="scale" duotone /></div>
              <p className="empty-state__desc">No hearings scheduled for {dayWord(calendarDate).toLowerCase() || 'this date'}</p>
            </div>
          ) : null}

          {sortedRows.map((row, index) => {
            // Court heading before the first hearing of each court (cases and applications share them)
            const heading = showCourtHeadings && (index === 0 || sortedRows[index - 1].court !== row.court)
              ? <p className="hearings-court">{row.court || 'No court'}</p>
              : null

            // A misc. application sits in its own court, after that court's cases
            if (row.miscApp) {
              return (
                <Fragment key={`misc-${row.miscApp.id}`}>
                  {heading}
                  <DashboardMiscHearing app={row.miscApp} dateKey={calendarDateKey}
                    caseItem={cases.find(x => String(x.id) === String(row.miscApp.caseId))} />
                </Fragment>
              )
            }

            const c = row.caseItem
            // Judge and cause list details for this case, and whether its card is expanded
            const info = hearingInfo[c.id]
            const causeListNo = info?.causeListNo
            const hasCauseListNo = causeListNo != null && causeListNo !== ''
            const nature = caseNatureOf(c)
            const expanded = expandedHearingCaseId === c.id

            // Whether this date is the case's next hearing and whether reminders are on
            const scheduled = c.nextHearing === calendarDateKey
            const remindersOn = caseRemindersOn(c)
            const hasReminderNumber = caseHasReminderNumber(c)

            // Badge showing the nature of the case
            const natureBadge = nature ? <span className="badge badge--nature">{nature}</span> : null

            // 'Heard' tag for cases heard on this date but since listed for another date
            const heardTag = !scheduled && (
              <span className="hearing-row__past" title="Heard on this date; the case has since been listed for another day">
                Heard
              </span>
            )

            // WhatsApp reminder toggle and Remind button, for scheduled hearings of open cases
            const reminderControls = scheduled && !isClosedCase(c) && (
              <>
                <button
                  type="button"
                  className={`wa-icon-btn wa-icon-btn--${remindersOn ? 'on' : 'off'}`}
                  aria-pressed={remindersOn}
                  aria-label="Automatic reminder"
                  title={!hasReminderNumber
                    ? 'No phone number saved — click to add one'
                    : remindersOn
                      ? 'Automatic reminder is ON for this case — click to turn it off'
                      : 'Automatic reminder is OFF for this case — click to turn it on'}
                  disabled={!!whatsappBusy[`case-${c.id}`]}
                  onClick={e => {
                    e.stopPropagation()
                    toggleCaseReminders(c)
                  }}
                >
                  <Icon name={remindersOn ? 'bell' : 'bell-off'} />
                </button>
                <button
                  className="btn-outline btn-outline--sm wa-remind-btn"
                  title="Send the client a WhatsApp reminder now"
                  disabled={!!whatsappBusy[`hearing-${c.id}`]}
                  onClick={e => {
                    e.stopPropagation()
                    sendHearingReminder(c)
                  }}
                >
                  <Icon name="chat" /> Remind
                </button>
              </>
            )

            const courtHeading = heading

            return (
              <Fragment key={c.id}>
              {courtHeading}
              <div id={`hearing-card-${c.id}`} className={`hearing-card${expanded ? ' hearing-card--expanded' : ''}`}>

                {/* Collapsed row: accent bar, title, badges, court details and reminder controls */}
                <div className="hearing-row" onClick={() => toggleExpanded(c.id)}>
                  <div
                    className="hearing-row__bar"
                    style={{ background: STATUS_COLORS[c.status] || undefined }}
                    title={c.status || undefined}
                  />

                  <div className="hearing-row__body">
                    <div className="hearing-row__heading">
                      <p className="hearing-row__title">
                        <span className="hearing-row__caret">{expanded ? '▾' : '▸'}</span>
                        {c.title}
                      </p>
                      {c.status && (
                        <span
                          className="badge"
                          style={{
                            background: (STATUS_COLORS[c.status] || '#999') + '18',
                            color: STATUS_COLORS[c.status] || '#999',
                          }}
                          title="Case status"
                        >
                          {c.status}
                        </span>
                      )}
                      {natureBadge}
                      {c.caseType && (
                        <span className="hearing-row__case-type" title="Case type">{c.caseType}</span>
                      )}
                    </div>

                    {/* Court, file and cause list details, shown only when the card is collapsed */}
                    {!expanded && (
                      <>
                        {c.court && !showCourtHeadings && (
                          <p className="hearing-row__meta">
                            Court: <strong>{c.court}</strong>
                          </p>
                        )}
                        <div className="hearing-row__chips">
                          {c.courtNo && (
                            <span className="hearing-row__court-no" title="Court number">
                              Court No. {c.courtNo}
                            </span>
                          )}
                          {roomLabel(c) && (
                            <span className="hearing-row__file-no" title="Building and floor">
                              {roomLabel(c)}
                            </span>
                          )}
                          {c.fileNo && (
                            <span className="hearing-row__file-no" title="File number">
                              File No. {c.fileNo}
                            </span>
                          )}
                          {hasCauseListNo && (
                            <span className="hearing-row__cause-list-no" title="Serial number in the cause list">
                              Cause List No. {causeListNo}
                            </span>
                          )}
                        </div>
                        {info?.judgeName && (
                          <p className="hearing-row__judge">
                            Judge: <strong>{info.judgeName}</strong>
                          </p>
                        )}
                      </>
                    )}

                    {/* Warning when the judge is on leave, with dates and reason */}
                    {info?.onLeave && (
                      <p className="hearing-row__leave">
                        <Icon name="warning" /> Judge is on leave
                        {info.leaveFrom && info.leaveTo && ` (${formatDisplayDate(info.leaveFrom)} – ${formatDisplayDate(info.leaveTo)})`}
                        {info.reason && ` · ${info.reason}`}
                      </p>
                    )}
                  </div>

                  {/* Heard tag and reminder buttons */}
                  <div className="hearing-row__side" data-no-compact>
                    {heardTag}
                    {reminderControls}
                  </div>
                </div>

                {/* Expanded details: case fields, hearing history and fee and open buttons */}
                {expanded && (
                  <div className="hearing-card__detail">
                    <CaseFields
                      caseItem={c}
                      clients={clients}
                      hearing={{ causeListNo, judgeName: info?.judgeName }}
                    />

                    <CaseHearings caseItem={c} dashboard />

                    {/* Fee button (not for closed cases unless stagewise) and Open in Cases button */}
                    <div className="hearing-card__footer">
                      {(!isClosedCase(c) || c.feeType === 'STAGEWISE') && (
                      <button type="button"
                        className="btn-outline btn-outline--sm"
                        onClick={e => {
                          e.stopPropagation()
                          openEditFee(
                            c,
                            c.feeType === 'STAGEWISE'
                              ? { readOnly: true }
                              : { focusDate: calendarDateKey }
                          )
                        }}
                      >
                        {c.feeType === 'STAGEWISE' ? <><Icon name="eye" /> View Fee</> : <><Icon name="money" /> Update Fee</>}
                      </button>
                      )}
                      <button type="button"
                        className="btn-outline btn-outline--sm hearing-card__open"
                        onClick={e => openInCases(e, c)}
                      >
                        Open in Cases <Icon name="arrow-right" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
              </Fragment>
            )
          })}
        </div>

        </div>

        {/* Calendar and notifications */}
        <div className="dashboard__side">
          <Calendar />
          <Notifications />
        </div>
      </div>
    </div>
  )
}