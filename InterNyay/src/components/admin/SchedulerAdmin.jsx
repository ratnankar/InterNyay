import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import { getErrorMessage } from '../../utils/errorMessages'
import ErrorMessage from '../common/ErrorMessage'
import Dropdown from '../common/Dropdown'
import ToggleSwitch from '../common/ToggleSwitch'

// All times are Indian Standard Time, like the server
const HOURS = Array.from({ length: 24 }, (_, h) => h)

// 17 -> "5 PM"
function hourLabel(h) {
  const twelve = h % 12 === 0 ? 12 : h % 12
  return `${twelve} ${h < 12 ? 'AM' : 'PM'}`
}

// 17, 5 -> "5:05 PM"
function clock(h, m) {
  const twelve = h % 12 === 0 ? 12 : h % 12
  return `${twelve}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

const pad = n => String(n).padStart(2, '0')

// Text typed in a minute box -> number; an empty box is NaN, which validate() refuses
const toMinute = text => (text === '' ? NaN : Number(text))

// Same label the server stores for a manual run
const RUN_NOW = 'Run now'

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
const INTERVALS = [5, 10, 15, 20, 30]

// Which hearing date(s) a job looks up
const TARGET_LABELS = {
  YESTERDAY: 'Previous day',
  TODAY: 'Same day',
  TOMORROW: 'Next day',
  DAY_AFTER: 'Day after next',
  TODAY_TOMORROW: 'Same day and next day',
  NEXT_3_DAYS: 'Next 3 days (same day + 2)',
  NEXT_7_DAYS: 'Next 7 days (same day + 6)',
}

// The hearing dates a choice means, counted from today in IST (same rule as the server)
const TARGET_OFFSETS = {
  YESTERDAY: [-1], TODAY: [0], TOMORROW: [1], DAY_AFTER: [2], TODAY_TOMORROW: [0, 1], NEXT_3_DAYS: [0, 1, 2], NEXT_7_DAYS: [0, 1, 2, 3, 4, 5, 6],
}

function targetDates(target) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) // yyyy-mm-dd
  const [y, m, d] = today.split('-').map(Number)
  return (TARGET_OFFSETS[target] || []).map(off =>
    new Date(Date.UTC(y, m - 1, d + off)).toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }))
}

// "MON" / "1" / "7" -> 0 (Monday) .. 6 (Sunday)
function dayIndex(token) {
  const byName = DAY_NAMES.indexOf(token)
  if (byName >= 0) return byName
  if (!/^\d$/.test(token)) return null
  const n = Number(token)
  if (n === 0 || n === 7) return 6
  return n >= 1 && n <= 6 ? n - 1 : null
}

// The weekday field of a cron as a list of days (0 = Monday), or null when it is more than the picker can show
function parseDays(field) {
  if (field === '*' || field === '?') return ALL_DAYS
  const days = new Set()
  for (const part of field.toUpperCase().split(',')) {
    const m = /^([A-Z0-9]+)(?:-([A-Z0-9]+))?$/.exec(part)
    if (!m) return null
    const from = dayIndex(m[1])
    const to = m[2] ? dayIndex(m[2]) : from
    if (from == null || to == null || from > to) return null
    for (let i = from; i <= to; i++) days.add(i)
  }
  return [...days].sort((x, y) => x - y)
}

// Reads a saved cron ("second minute hour day month weekday") into the simple form the admin edits.
// Anything that is not a plain daily time, an hourly window or an every-few-minutes window is kept as Custom, so nothing is lost
function parseCron(cron) {
  const base = { hour: 9, minute: 0, from: 0, to: 23, every: 15, days: ALL_DAYS, custom: cron || '' }
  const p = String(cron || '').trim().split(/\s+/)
  if (p.length === 6 && p[0] === '0' && p[3] === '*' && p[4] === '*') {
    const days = parseDays(p[5])
    if (days && days.length) {
      let from = 0, to = 23, single = null
      if (/^\d+$/.test(p[2]) && Number(p[2]) <= 23) { single = Number(p[2]); from = to = single }
      else if (p[2] !== '*') {
        const r = /^(\d+)-(\d+)$/.exec(p[2])
        if (r && Number(r[1]) <= Number(r[2]) && Number(r[2]) <= 23) { from = Number(r[1]); to = Number(r[2]) }
        else return { ...base, mode: 'CUSTOM' }
      }

      if (/^\d+$/.test(p[1]) && Number(p[1]) <= 59) {
        const minute = Number(p[1])
        if (single != null) return { ...base, mode: 'DAILY', hour: single, minute, days }
        return { ...base, mode: 'WINDOW', minute, from, to, days }
      }
      const step = /^\*\/(\d+)$/.exec(p[1])
      if (step && INTERVALS.includes(Number(step[1]))) {
        return { ...base, mode: 'INTERVAL', every: Number(step[1]), from, to, days }
      }
    }
  }
  return { ...base, mode: 'CUSTOM' }
}

// The cron for what the admin picked
function buildCron(f) {
  if (f.mode === 'CUSTOM') return f.custom.trim().replace(/\s+/g, ' ')
  const days = f.days.length === 7 ? '*' : [...f.days].sort((a, b) => a - b).map(d => DAY_NAMES[d]).join(',')
  const hours = f.from === 0 && f.to === 23 ? '*' : `${f.from}-${f.to}`
  if (f.mode === 'DAILY') return `0 ${f.minute} ${f.hour} * * ${days}`
  if (f.mode === 'INTERVAL') return `0 */${f.every} ${hours} * * ${days}`
  return `0 ${f.minute} ${hours} * * ${days}`
}

// "Monday to Friday", "Mon, Wed, Fri", or '' for every day
function daysText(days) {
  if (days.length === 7) return ''
  const sorted = [...days].sort((a, b) => a - b)
  if (sorted.length === 6 && sorted.every((d, i) => d === i)) return 'Monday to Saturday'
  if (sorted.length === 1 && sorted[0] === 6) return 'Sunday'
  return sorted.map(d => DAY_SHORT[d]).join(', ')
}

// One line in plain words for the picked time
function describe(f) {
  if (f.mode === 'CUSTOM') return 'Custom time'
  const on = daysText(f.days)
  const allDay = f.from === 0 && f.to === 23
  let when
  if (f.mode === 'DAILY') when = `At ${clock(f.hour, f.minute)}`
  else if (f.mode === 'INTERVAL') {
    when = allDay ? `Every ${f.every} minutes` : `Every ${f.every} minutes from ${clock(f.from, 0)} to ${clock(f.to, 60 - f.every)}`
  } else {
    when = allDay ? `Every hour, at ${pad(f.minute)} minutes past` : `Every hour from ${clock(f.from, f.minute)} to ${clock(f.to, f.minute)}`
  }
  return on ? `${when}, ${on}` : `${when}, every day`
}

function formatNext(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function validate(f) {
  if (f.mode === 'CUSTOM' && !f.custom.trim()) return 'Enter the time'
  if (f.mode !== 'CUSTOM' && f.days.length === 0) return 'Pick at least one day of the week'
  if (f.mode === 'WINDOW' || f.mode === 'INTERVAL') {
    if (f.from > f.to) return 'The first hour must not be after the last hour'
  }
  if (f.mode === 'INTERVAL' && !INTERVALS.includes(f.every)) return 'Pick how often it repeats'
  if ((f.mode === 'DAILY' || f.mode === 'WINDOW') && (!Number.isInteger(f.minute) || f.minute < 0 || f.minute > 59)) return 'Minutes must be between 0 and 59'
  return ''
}

// Most times one job can have (same limit as the server)
const MAX_TIMES = 6

// The fields of one run time: how it repeats, the hour and minute boxes, and the days of the week
function TimeFields({ time, onChange, disabled }) {
  const set = patch => onChange({ ...time, ...patch })
  const toggleDay = d => set({ days: time.days.includes(d) ? time.days.filter(x => x !== d) : [...time.days, d] })

  const hourOptions = HOURS.map(h => <option key={h} value={h}>{hourLabel(h)}</option>)
  // An hour picker for one field of the time (hour, from or to)
  const hourField = (label, name) => (
    <div className="sched-field">
      <label className="form-label">{label}</label>
      <Dropdown className="form-input" value={time[name]} disabled={disabled}
        onChange={e => set({ [name]: Number(e.target.value) })}>{hourOptions}</Dropdown>
    </div>
  )

  return (
    <>
      <div className="sched-row__fields">
        <div className="sched-field">
          <label className="form-label">Repeats</label>
          <Dropdown className="form-input" value={time.mode} disabled={disabled}
            onChange={e => set({ mode: e.target.value })}>
            <option value="DAILY">Once a day</option>
            <option value="WINDOW">Every hour</option>
            <option value="INTERVAL">Every few minutes</option>
            <option value="CUSTOM">Custom (advanced)</option>
          </Dropdown>
        </div>

        {time.mode === 'DAILY' && (
          <>
            {hourField('At hour', 'hour')}
            <div className="sched-field sched-field--narrow">
              <label className="form-label">Minute</label>
              <input className="form-input" type="number" min="0" max="59" disabled={disabled}
                value={time.minute} onChange={e => set({ minute: toMinute(e.target.value) })} />
            </div>
          </>
        )}

        {time.mode === 'WINDOW' && (
          <>
            {hourField('From', 'from')}
            {hourField('Until', 'to')}
            <div className="sched-field sched-field--narrow">
              <label className="form-label">At minute</label>
              <input className="form-input" type="number" min="0" max="59" disabled={disabled}
                value={time.minute} onChange={e => set({ minute: toMinute(e.target.value) })} />
            </div>
          </>
        )}

        {time.mode === 'INTERVAL' && (
          <>
            <div className="sched-field sched-field--narrow">
              <label className="form-label">Every</label>
              <Dropdown className="form-input" value={time.every} disabled={disabled}
                onChange={e => set({ every: Number(e.target.value) })}>
                {INTERVALS.map(n => <option key={n} value={n}>{n} min</option>)}
              </Dropdown>
            </div>
            {hourField('From', 'from')}
            {hourField('Until', 'to')}
          </>
        )}

        {time.mode === 'CUSTOM' && (
          <div className="sched-field sched-field--wide">
            <label className="form-label">Time (second minute hour day month weekday)</label>
            <input className="form-input" disabled={disabled} value={time.custom}
              placeholder="0 0 10 * * *" onChange={e => set({ custom: e.target.value })} />
          </div>
        )}
      </div>

      {time.mode !== 'CUSTOM' && (
        <div className="sched-days" role="group" aria-label="Days of the week">
          <span className="form-label sched-days__label">On</span>
          {DAY_SHORT.map((name, d) => (
            <button key={name} type="button" disabled={disabled}
              className={`sched-day${time.days.includes(d) ? ' sched-day--on' : ''}`}
              aria-pressed={time.days.includes(d)} onClick={() => toggleDay(d)}>{name}</button>
          ))}
          <button type="button" className="sched-days__quick" disabled={disabled} onClick={() => set({ days: ALL_DAYS })}>Every day</button>
          <button type="button" className="sched-days__quick" disabled={disabled} onClick={() => set({ days: [0, 1, 2, 3, 4, 5] })}>Mon–Sat</button>
        </div>
      )}
    </>
  )
}

// One job: switch, what it looks up, one or more run times, and Save / Run now buttons
function JobRow({ job, onSaved, onRan }) {
  const { addToast } = useApp()
  const hasTargets = Array.isArray(job.targets) && job.targets.length > 0
  const savedCrons = j => [j.cron, ...(j.extraCrons || [])]
  // Each time carries its own hearing date choice: the first uses the job's, the others their own (or the job's when none)
  const jobTarget = j => j.target || j.defaultTarget || ''
  const fromJob = j => ({
    enabled: j.enabled,
    times: savedCrons(j).map((c, i) => ({ ...parseCron(c), target: (i === 0 ? '' : (j.extraTargets || [])[i - 1]) || jobTarget(j) })),
  })
  const [form, setForm] = useState(() => fromJob(job))
  const [saving, setSaving] = useState(false)
  const [starting, setStarting] = useState(false)

  // A new version from the server (after a save or a reload) replaces what is being edited
  const savedKey = `${savedCrons(job).join('|')}#${[job.target, ...(job.extraTargets || [])].join('|')}`
  useEffect(() => { setForm(fromJob(job)) }, [savedKey, job.enabled])

  const set = patch => setForm(f => ({ ...f, ...patch }))
  const setTime = (i, time) => set({ times: form.times.map((t, n) => (n === i ? time : t)) })
  const addTime = () => {
    const last = form.times[form.times.length - 1]
    // A new time starts as a once-a-day time on the same days and for the same hearing date as the last one
    set({ times: [...form.times, { ...parseCron('0 0 9 * * *'), days: last?.days?.length ? last.days : ALL_DAYS, target: last?.target || '' }] })
  }
  const removeTime = i => set({ times: form.times.filter((_, n) => n !== i) })

  const crons = form.times.map(buildCron)
  const targets = form.times.map(t => t.target || '')
  const saved = fromJob(job)
  const savedBuilt = saved.times.map(buildCron)
  const dirty = crons.join('|') !== savedBuilt.join('|') || form.enabled !== job.enabled
    || (hasTargets && targets.join('|') !== saved.times.map(t => t.target || '').join('|'))
  // The first time that is not acceptable, named by its number when the job has several
  const problem = (() => {
    for (let i = 0; i < form.times.length; i++) {
      const p = validate(form.times[i])
      if (p) return form.times.length > 1 ? `Time ${i + 1}: ${p}` : p
    }
    return ''
  })()

  async function save() {
    if (problem) { addToast(problem, 'error'); return }
    setSaving(true)
    try {
      const updated = await api.admin.schedulers.update(job.key, {
        cron: crons[0], extraCrons: crons.slice(1), enabled: form.enabled,
        target: hasTargets ? targets[0] : null, extraTargets: hasTargets ? targets.slice(1) : [],
      })
      onSaved(updated)
      addToast('Saved')
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not save the time'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function runNow() {
    setStarting(true)
    try {
      await api.admin.schedulers.run(job.key, { target: hasTargets ? runFor : null })
      addToast('Started. The result shows here when it finishes')
      onRan()
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not start the job'), 'error')
    } finally {
      setStarting(false)
    }
  }

  // "Run now" uses the hearing date of the first time
  const runFor = targets[0]
  const last = job.lastRun
  const busy = job.running || starting
  const several = form.times.length > 1

  return (
    <div className={`sched-row${form.enabled ? '' : ' sched-row--off'}`}>
      <div className="sched-row__head">
        <div className="sched-row__title">
          <p className="sched-row__name">{job.label}</p>
          <p className="admin__hint">{job.description}</p>
        </div>
        <ToggleSwitch checked={form.enabled} onChange={e => set({ enabled: e.target.checked })}
          label={form.enabled ? 'On' : 'Off'} />
      </div>

      {form.times.map((time, i) => (
        <div key={i} className={several ? 'sched-time' : 'sched-time sched-time--single'}>
          {several && (
            <div className="sched-time__head">
              <span className="form-label sched-time__title">Time {i + 1}</span>
              {i > 0 && (
                <button type="button" className="sched-time__remove" disabled={!form.enabled}
                  onClick={() => removeTime(i)} aria-label={`Remove time ${i + 1}`}>Remove</button>
              )}
            </div>
          )}
          {hasTargets && (
            <div className="sched-row__fields">
              <div className="sched-field sched-field--wide-ish">
                <label className="form-label">Hearing date</label>
                <Dropdown className="form-input" value={time.target || ''} disabled={!form.enabled}
                  onChange={e => setTime(i, { ...time, target: e.target.value })}>
                  {job.targets.map(t => <option key={t} value={t}>{TARGET_LABELS[t] || t}</option>)}
                </Dropdown>
              </div>
            </div>
          )}
          <TimeFields time={time} onChange={t => setTime(i, { ...t, target: time.target })} disabled={!form.enabled} />
          {several && <p className="admin__hint sched-time__text">{describe(time)} (IST)</p>}
          {hasTargets && targetDates(time.target).length > 0 && (
            <p className="admin__hint sched-row__dates">Looks up: {targetDates(time.target).join(' • ')} <span className="sched-row__note">(counted from the day it runs)</span></p>
          )}
        </div>
      ))}

      <div>
        <button type="button" className="sched-add" disabled={!form.enabled || form.times.length >= MAX_TIMES} onClick={addTime}>
          + Add another time
        </button>
        {form.times.length >= MAX_TIMES && <span className="admin__hint sched-add__note"> At most {MAX_TIMES} times per job</span>}
      </div>

      <div className="sched-row__foot">
        <div className="sched-row__info">
          <p className="admin__hint">
            {several ? `${form.times.length} times` : `${describe(form.times[0])} (IST)`}
            {job.enabled ? ` • Next run: ${formatNext(job.nextRun)}` : ' • Switched off'}
          </p>
          <p className={`admin__hint${last && !last.ok ? ' sched-row__fail' : ''}`}>
            {job.running ? 'Running now…' : last
              ? `Last run: ${formatNext(last.at)} (${last.by === RUN_NOW ? 'run now' : 'scheduled'}) • ${last.ok ? 'finished' : `failed: ${last.message}`}`
              : 'Not run since the server started'}
          </p>
        </div>
        <div className="sched-row__actions">
          <button type="button" className="btn-outline" onClick={runNow} disabled={busy || (dirty && !!problem)}>
            {busy ? 'Running…' : 'Run now'}
          </button>
          <button type="button" className="btn-gold" onClick={save} disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Admin screen to set when each background job runs and which hearing dates it looks up, run it now, or switch it off.
// Changes apply straight away, no restart needed
export default function SchedulerAdmin() {
  const [jobs, setJobs] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setJobs(await api.admin.schedulers.list())
      setError('')
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load the schedulers'))
    }
  }, [])

  useEffect(() => { load() }, [load])

  // While a job is running, check back every few seconds so its result appears by itself
  const anyRunning = !!jobs && jobs.some(j => j.running)
  useEffect(() => {
    if (!anyRunning) return undefined
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [anyRunning, load])

  const replace = updated => setJobs(list => list.map(j => (j.key === updated.key ? updated : j)))
  const soon = () => { setTimeout(load, 800) }

  if (error) return (
    <>
      <ErrorMessage message={error} />
      <button type="button" className="btn-outline u-mt-12" onClick={load}>Try again</button>
    </>
  )
  if (!jobs) return <p className="admin__empty">Loading…</p>

  return (
    <div className="sched-admin">
      <p className="admin__hint u-mb-12">
        When the background jobs run (a job can have up to 6 different times), which hearing dates they look up (same day,
        next day and so on), and on which days of the week. Times are Indian Standard Time and a change applies straight away, without restarting the server. Runs
        must be at least 5 minutes apart. A job that is switched off does not run at all, including from the pages that
        read its next run. Each time has its own hearing date, so one job can look at different dates at different times of the day. Run now starts a job at once for the hearing date of its first time.
      </p>
      {jobs.map(j => <JobRow key={j.key} job={j} onSaved={replace} onRan={soon} />)}
    </div>
  )
}
