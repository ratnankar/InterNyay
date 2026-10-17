import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { formatDisplayDate } from '../../utils/dateUtils'
import { confirmDialog } from '../../utils/confirmDialog'
import Icon from '../common/Icon'
import ModalPortal from '../common/ModalPortal'

// Highest daily limit the server accepts
const MAX_LIMIT = 200

// '' → null (no limit), a whole number from `min` to MAX_LIMIT → that number, anything else → undefined (not valid)
function parseLimit(text, min) {
  const t = String(text).trim()
  if (t === '') return null
  if (!/^\d+$/.test(t)) return undefined
  const n = Number(t)
  return n >= min && n <= MAX_LIMIT ? n : undefined
}

// One number field with Save and Remove buttons. Save is enabled when the number changed and is valid.
// Remove clears the saved limit and only shows while there is one
function LimitEditor({ label, hint, value, min, placeholder, onSave, onRemove }) {
  const [text, setText] = useState(value == null ? '' : String(value))
  const [busy, setBusy] = useState(false)

  // Follows the saved value, for example after the server answered
  useEffect(() => { setText(value == null ? '' : String(value)) }, [value])

  const parsed = parseLimit(text, min)
  const invalid = parsed === undefined
  const changed = !invalid && parsed !== (value ?? null)

  async function run(fn, arg) {
    if (busy) return
    setBusy(true)
    try { await fn(arg) } finally { setBusy(false) }
  }

  return (
    <div className="hearing-limit__editor">
      <label className="form-label">{label}</label>
      <div className="hearing-limit__row">
        <input
          type="number"
          min={min}
          max={MAX_LIMIT}
          inputMode="numeric"
          className={`form-input hearing-limit__input${invalid ? ' hearing-limit__input--invalid' : ''}`}
          value={text}
          placeholder={placeholder}
          aria-invalid={invalid}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && changed) { e.preventDefault(); run(onSave, parsed) } }}
        />
        <button type="button" className="btn-gold btn-outline--sm" disabled={!changed || busy}
          onClick={() => run(onSave, parsed)}>
          Save
        </button>
        {value != null && (
          <button type="button" className="btn-outline btn-outline--sm" disabled={busy} onClick={() => run(onRemove)}>
            Remove limit
          </button>
        )}
      </div>
      {invalid
        ? <p className="hearing-limit__error">Enter a whole number from {min} to {MAX_LIMIT}.</p>
        : <p className="hearing-limit__hint">{hint}</p>}
    </div>
  )
}

// Edit how many hearings can be listed on one date and on a usual day.
// A limit never moves hearings that are already listed, it only stops new ones from being added to a full day.
// 0 on a date makes it a no-hearing date (crossed out on the calendar), and a no-hearing date shows as 0
export default function HearingLimitModal({ dateStr, onClose }) {
  const {
    cases, hearingLimits, hearingLimitFor, hearingCountsByDate, noHearingDates,
    saveDefaultHearingLimit, saveHearingLimitForDate,
  } = useApp()

  const count = hearingCountsByDate.get(dateStr) || 0
  const crossed = noHearingDates.has(dateStr)
  const limit = crossed ? 0 : hearingLimitFor(dateStr)
  const ownLimit = crossed ? 0 : (hearingLimits.overrides[dateStr] ?? null)
  const usual = hearingLimits.defaultLimit

  // Escape closes the window
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // 0 crosses the date out; cases already listed on it do not move, so say so first
  async function saveDateLimit(n) {
    if (n === 0 && !crossed) {
      const listed = cases.filter(c => c.nextHearing === dateStr).length
      if (listed > 0) {
        const ok = await confirmDialog({
          title: 'Make this a no-hearing date?',
          message:
            `${listed} case${listed === 1 ? ' is' : 's are'} already listed for this date.\n\n` +
            `A limit of 0 will not move ${listed === 1 ? 'it' : 'them'} — you will need to give ` +
            `${listed === 1 ? 'it' : 'each'} a new hearing date.`,
          confirmLabel: 'Set 0 anyway',
          danger: true,
        })
        if (!ok) return
      }
    }
    await saveHearingLimitForDate(dateStr, n)
  }

  const status = crossed ? 'No-hearing date (limit 0)'
    : limit == null ? 'No limit'
    : `Limit ${limit}${ownLimit != null ? ' (set for this date)' : ' (usual limit)'}`

  return (
    <ModalPortal>
      <div className="overlay" onClick={onClose}>
        <div className="modal modal--sm" role="dialog" aria-label="Daily hearing limit" onClick={e => e.stopPropagation()}>

          <div className="modal__header">
            <div>
              <h2 className="modal__title">Daily Hearing Limit</h2>
              <p className="u-note-sm">
                {formatDisplayDate(dateStr)} · {count} hearing{count === 1 ? '' : 's'} · {status}
              </p>
            </div>
            <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>

          {limit != null && limit > 0 && count > limit && (
            <p className="hearing-limit__note">
              This date holds more hearings than its limit. They stay as they are; no new ones can be added.
            </p>
          )}

          <LimitEditor
            label="Limit for this date"
            hint="Put 0 to make it a no-hearing date. Leave it empty to use the usual limit."
            value={ownLimit}
            min={0}
            placeholder={usual == null ? 'No limit' : `Usual (${usual})`}
            onSave={saveDateLimit}
            onRemove={() => saveHearingLimitForDate(dateStr, null)}
          />

          <LimitEditor
            label="Usual limit for every day"
            hint="Applies to every date that has no limit of its own."
            value={usual}
            min={1}
            placeholder="No limit"
            onSave={saveDefaultHearingLimit}
            onRemove={() => saveDefaultHearingLimit(null)}
          />

          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
