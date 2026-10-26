import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import { formatDate } from '../../utils/dateUtils'
import { getErrorMessage } from '../../utils/errorMessages'
import ClearableDateInput from '../common/ClearableDateInput'
import '../../styles/admin/cause-relay.css'
import Icon from '../common/Icon'

function tomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return formatDate(d)
}

export default function CauseListRelay() {
  const { addToast } = useApp()

  const [date, setDate] = useState(tomorrow)
  const [step, setStep] = useState(null)
  const [captcha, setCaptcha] = useState('')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState([])

  const apply = next => {
    const lines = [...(next.skipped || [])]
    if (next.message) lines.push(next.message)
    if (lines.length) setLog(prev => [...lines, ...prev])
    setStep(next)
    setCaptcha('')
  }

  const run = async action => {
    setBusy(true)
    try {
      apply(await action())
    } catch (e) {
      addToast(getErrorMessage(e, 'Cause list relay failed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const start = () => {
    setLog([])
    run(() => api.admin.causeListRelay.start(date))
  }

  const refreshNumbers = async () => {
    setBusy(true)
    try {
      const r = await api.admin.causeListRelay.refreshDate(date)
      const line = `${date}: ${r.causeListNosSaved} number(s) refreshed from ${r.casesChecked} High Court case(s)`
      setLog(prev => [line, ...prev])
      addToast(line, 'success')
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not refresh the cause list numbers'), 'error')
    } finally {
      setBusy(false)
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

  return (
    <div className="relay">
      <p className="admin__note">
        Reads district court cause lists from the eCourts Services portal. For each court room that has cases on the
        chosen date (including cases already recorded as heard on that date) you type the CAPTCHA shown below; the cause list numbers are then saved on those cases and on their hearing entry.
        Refresh High Court numbers re-reads the Delhi High Court cause list PDFs for the chosen date (no CAPTCHA) and
        overwrites the numbers already saved. Cases that already have a number for the date are skipped by Start. The portal may
        not show cause lists for dates that are long past.
      </p>

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
        <ul className="relay__log">
          {log.map((line, i) => (
            <li key={`${i}-${line}`}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
