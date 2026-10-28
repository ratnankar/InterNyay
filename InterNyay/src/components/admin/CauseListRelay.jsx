import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import { formatDate, formatDisplayDate, formatTimestamp } from '../../utils/dateUtils'
import { getErrorMessage } from '../../utils/errorMessages'
import ClearableDateInput from '../common/ClearableDateInput'
import '../../styles/admin/cause-relay.css'
import Icon from '../common/Icon'

function tomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return formatDate(d)
}

// "5 PM" for an hour of the day (0-23)
function hourLabel(h) {
  const twelve = h % 12 === 0 ? 12 : h % 12
  return `${twelve} ${h < 12 ? 'AM' : 'PM'}`
}

// "5 PM to 11 PM" when the hours are one unbroken stretch, otherwise the list
function hoursText(hours = []) {
  if (!hours.length) return 'no hours set'
  const consecutive = hours.every((h, i) => i === 0 || h === hours[i - 1] + 1)
  if (hours.length > 2 && consecutive) return `every hour, ${hourLabel(hours[0])} to ${hourLabel(hours[hours.length - 1])}`
  return hours.map(hourLabel).join(', ')
}

const STATUS_LABEL = {
  RUNNING: 'Running',
  SUCCESS: 'Done',
  PARTIAL: 'Partly done',
  NOTHING_TO_DO: 'Nothing to do',
  FAILED: 'Failed',
  ABANDONED: 'Left open',
}

const STATUS_TONE = {
  RUNNING: 'info',
  SUCCESS: 'ok',
  PARTIAL: 'warn',
  NOTHING_TO_DO: 'muted',
  FAILED: 'bad',
  ABANDONED: 'muted',
}

// How a line of the session log is coloured
function levelOf(text) {
  const t = text.toLowerCase()
  if (/failed|error|not found|no judge|not matched|portal returned no|stopped/.test(t)) return 'bad'
  if (/skipped|not accepted|expired|not in the list|could not|cannot/.test(t)) return 'warn'
  if (/saved|refreshed|finished/.test(t)) return 'ok'
  return 'info'
}

function clock() {
  return new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
}

function StatusBadge({ status }) {
  return <span className={`relay__badge relay__badge--${STATUS_TONE[status] || 'muted'}`}>{STATUS_LABEL[status] || status}</span>
}

export default function CauseListRelay() {
  const { addToast } = useApp()

  const [date, setDate] = useState(tomorrow)
  const [step, setStep] = useState(null)
  const [captcha, setCaptcha] = useState('')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState([])
  const [schedule, setSchedule] = useState(null)
  const [runs, setRuns] = useState([])
  const [loadingRuns, setLoadingRuns] = useState(true)
  const [startingAuto, setStartingAuto] = useState(false)
  const closed = useRef(false)

  useEffect(() => { closed.current = false; return () => { closed.current = true } }, [])

  const addLog = useCallback(lines => {
    const list = (Array.isArray(lines) ? lines : [lines]).filter(Boolean)
    if (!list.length) return
    const time = clock()
    setLog(prev => [...list.map(text => ({ time, text, level: levelOf(text) })).reverse(), ...prev])
  }, [])

  // Scheduler card and run history
  const loadRuns = useCallback(async () => {
    try {
      const [sched, list] = await Promise.all([api.admin.causeListRelay.schedule(), api.admin.causeListRelay.runs(30)])
      if (closed.current) return
      setSchedule(sched)
      setRuns(Array.isArray(list) ? list : [])
    } catch (e) {
      if (!closed.current) addToast(getErrorMessage(e, 'Could not load the cause list runs'), 'error')
    } finally {
      if (!closed.current) setLoadingRuns(false)
    }
  }, [addToast])

  useEffect(() => { loadRuns() }, [loadRuns])

  // While an automatic run is going the history follows it
  const anyRunning = runs.some(r => r.status === 'RUNNING') || !!schedule?.running
  useEffect(() => {
    if (!anyRunning) return undefined
    const id = setInterval(loadRuns, 4000)
    return () => clearInterval(id)
  }, [anyRunning, loadRuns])

  const apply = next => {
    addLog([...(next.skipped || []), ...(next.message ? [next.message] : [])])
    setStep(next)
    setCaptcha('')
  }

  const run = async action => {
    setBusy(true)
    try {
      let next = await action()
      if (closed.current) return
      apply(next)
      // The server reads CAPTCHAs by itself for a while per request, then asks to be called again
      while (next.status === 'WORKING' && !closed.current) {
        next = await api.admin.causeListRelay.next()
        if (closed.current) return
        apply(next)
      }
      if (next.status === 'DONE' || next.status === 'EXPIRED') loadRuns()
    } catch (e) {
      const message = getErrorMessage(e, 'Cause list relay failed')
      addLog(`Failed: ${message}`)
      if (!closed.current) addToast(message, 'error')
    } finally {
      if (!closed.current) setBusy(false)
    }
  }

  const start = () => {
    setLog([])
    addLog(`Started for ${formatDisplayDate(date)}`)
    run(() => api.admin.causeListRelay.start(date))
  }

  const refreshNumbers = async () => {
    setBusy(true)
    try {
      const r = await api.admin.causeListRelay.refreshDate(date)
      const line = `${date}: ${r.causeListNosSaved} number(s) refreshed from ${r.casesChecked} High Court case(s)`
      addLog(line)
      addToast(line, 'success')
    } catch (e) {
      const message = getErrorMessage(e, 'Could not refresh the cause list numbers')
      addLog(`Failed: ${message}`)
      addToast(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const runAuto = async () => {
    setStartingAuto(true)
    try {
      await api.admin.causeListRelay.runAuto(date)
      addToast(`Automatic lookup started for ${formatDisplayDate(date)}`, 'success')
      await loadRuns()
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not start the automatic lookup'), 'error')
    } finally {
      if (!closed.current) setStartingAuto(false)
    }
  }

  const copyLog = async () => {
    const text = [...log].reverse().map(l => `${l.time}  ${l.text}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      addToast('Log copied', 'success')
    } catch {
      addToast('Could not copy the log', 'error')
    }
  }

  const submit = () => {
    if (!captcha.trim() || !step?.sessionId) return
    run(() => api.admin.causeListRelay.answer(step.sessionId, captcha.trim()))
  }

  const onKeyDown = e => {
    if (e.key === 'Enter') submit()
  }

  const waiting = step?.status === 'CAPTCHA'
  const working = step?.status === 'WORKING'
  const total = step ? (step.done || 0) + (step.remaining || 0) + (waiting ? 1 : 0) : 0
  const percent = total > 0 ? Math.min(100, Math.round(((step.done || 0) / total) * 100)) : 0
  const autoRunning = !!schedule?.running

  return (
    <div className="relay">
      <p className="admin__note">
        Cause list numbers are looked up automatically for the next hearing date every evening (see below). Use this page to
        run it yourself, to finish the court rooms whose CAPTCHA could not be read, or to refresh High Court numbers.
        Start reads district court cause lists from the eCourts Services portal: for each court room that has cases on the
        chosen date (including cases already recorded as heard on that date) the CAPTCHA is read for you, and you type it
        below only when it cannot be read; the cause list numbers are then saved on those cases and on their hearing entry.
        Refresh High Court numbers re-reads the Delhi High Court cause list PDFs for the chosen date (no CAPTCHA) and
        overwrites the numbers already saved. Cases that already have a number for the date are skipped by Start. The portal may
        not show cause lists for dates that are long past.
      </p>

      <section className="relay__card relay__card--wide" aria-label="Automatic lookup">
        <div className="relay__head">
          <div className="relay__title">Automatic lookup</div>
          {schedule && (
            <span className={`relay__badge relay__badge--${!schedule.enabled ? 'muted' : autoRunning ? 'info' : 'ok'}`}>
              {!schedule.enabled ? 'Off' : autoRunning ? 'Running now' : 'On'}
            </span>
          )}
        </div>

        {!schedule && loadingRuns && <div className="relay__progress">Loading…</div>}

        {schedule && (
          <dl className="relay__facts">
            <div>
              <dt>Runs</dt>
              <dd>
                {schedule.enabled
                  ? <>{hoursText(schedule.hours)} (IST)</>
                  : 'Switched off in the server settings'}
              </dd>
            </div>
            <div>
              <dt>Next run</dt>
              <dd>
                {schedule.nextRunAt
                  ? <>{formatTimestamp(schedule.nextRunAt)} for hearings on {formatDisplayDate(schedule.nextRunFor)}</>
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>Last run</dt>
              <dd>
                {schedule.lastRun
                  ? <>{formatTimestamp(schedule.lastRun.startedAt)} · <StatusBadge status={schedule.lastRun.status} /> {schedule.lastRun.summary}</>
                  : 'None yet'}
              </dd>
            </div>
            <div>
              <dt>CAPTCHA reader</dt>
              <dd>
                {schedule.captchaSolverAvailable
                  ? 'Available'
                  : 'Not available: district court rooms are left for you to finish below'}
              </dd>
            </div>
          </dl>
        )}

        <div className="relay__actions">
          <button type="button" className="btn-outline" onClick={runAuto} disabled={startingAuto || autoRunning || !date}>
            {autoRunning ? 'Run in progress…' : `Run now for ${date ? formatDisplayDate(date) : 'the chosen date'}`}
          </button>
        </div>
      </section>

      <div className="admin__toolbar">
        <ClearableDateInput className="form-input" value={date} onChange={e => setDate(e.target.value)} disabled={busy} />
        <button type="button" className="btn-gold" onClick={start} disabled={busy || !date}>
          {waiting ? 'Restart' : 'Start'}
        </button>
        <button type="button" className="btn-outline" onClick={refreshNumbers} disabled={busy || !date}>
          Refresh High Court numbers
        </button>
      </div>

      {waiting && (
        <div className="relay__card">
          <div className="relay__title">
            {step.court} / {step.district} / Court {step.courtNo}
          </div>
          <div className="relay__progress">
            {step.caseCount} case(s) · {step.done} done · {step.remaining} more after this · {step.saved} number(s) saved
          </div>
          <div className="relay__bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${percent}%` }} />
          </div>

          <img className="relay__image" src={step.captchaImage} alt="CAPTCHA" />

          <input
            className="form-input relay__input"
            value={captcha}
            onChange={e => setCaptcha(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type the CAPTCHA"
            autoComplete="off"
            autoFocus
            disabled={busy}
          />

          <div className="relay__actions">
            <button type="button" className="btn-gold" onClick={submit} disabled={busy || !captcha.trim()}>
              Get cause list
            </button>
            <button
              type="button"
              className="btn-refresh"
              onClick={() => run(() => api.admin.causeListRelay.refresh(step.sessionId))}
              disabled={busy}
              title="New image"
              aria-label="New image"
            >
              <Icon name="refresh" />
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={() => run(() => api.admin.causeListRelay.skip(step.sessionId))}
              disabled={busy}
            >
              Skip this court
            </button>
          </div>
        </div>
      )}

      {working && (
        <div className="relay__card">
          <div className="relay__title">Reading the CAPTCHAs automatically…</div>
          <div className="relay__progress">
            {step.done} court room(s) handled · {step.remaining} to go · {step.saved} number(s) saved
          </div>
          <div className="relay__bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      {step?.status === 'DONE' && (
        <div className="relay__card">
          <div className="relay__title">Finished</div>
          <div className="relay__progress">
            {step.done} court room(s) handled · {step.saved} cause list number(s) saved
          </div>
        </div>
      )}

      {step?.status === 'EXPIRED' && (
        <div className="relay__card">
          <div className="relay__title">Session expired</div>
          <div className="relay__progress">Press Start to begin again.</div>
        </div>
      )}

      {log.length > 0 && (
        <section className="relay__logbox" aria-label="This session">
          <div className="relay__head">
            <div className="relay__subtitle">This session</div>
            <div className="relay__actions">
              <button type="button" className="btn-outline btn-outline--sm" onClick={copyLog}>Copy</button>
              <button type="button" className="btn-outline btn-outline--sm" onClick={() => setLog([])}>Clear</button>
            </div>
          </div>
          <ul className="relay__log">
            {log.map((line, i) => (
              <li key={`${i}-${line.text}`} className={`relay__line relay__line--${line.level}`}>
                <time>{line.time}</time>
                <span>{line.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="relay__history" aria-label="Recent runs">
        <div className="relay__head">
          <div className="relay__subtitle">Recent runs</div>
          <button
            type="button"
            className="btn-refresh"
            onClick={loadRuns}
            title="Reload"
            aria-label="Reload runs"
          >
            <Icon name="refresh" />
          </button>
        </div>

        {runs.length === 0 ? (
          <div className="admin__empty">{loadingRuns ? 'Loading…' : 'No runs recorded yet'}</div>
        ) : (
          <div className="admin__table-wrap">
            <table className="admin__table relay__table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Hearing date</th>
                  <th>Run</th>
                  <th>Status</th>
                  <th>Saved</th>
                  <th>Left</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(r => {
                  const left = (r.districtCaptcha || 0) + (r.districtFailed || 0)
                  return (
                    <tr key={r.id}>
                      <td>{formatTimestamp(r.startedAt)}</td>
                      <td>{r.hearingDate ? formatDisplayDate(r.hearingDate) : '—'}</td>
                      <td>{r.origin === 'MANUAL' ? 'Admin' : 'Automatic'}{r.label && r.origin !== 'MANUAL' ? ` · ${r.label}` : ''}</td>
                      <td>
                        <StatusBadge status={r.status} />
                        {(r.summary || r.lines?.length > 0) && (
                          <details className="relay__details">
                            <summary>{r.summary || 'Details'}</summary>
                            {r.lines?.length > 0 && (
                              <ul className="relay__log">
                                {r.lines.map((line, i) => (
                                  <li key={i} className={`relay__line relay__line--${levelOf(line)}`}><span>{line}</span></li>
                                ))}
                              </ul>
                            )}
                          </details>
                        )}
                      </td>
                      <td>{r.numbersSaved}</td>
                      <td>{left > 0 ? left : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
