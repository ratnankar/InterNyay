import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'
import { caseClientsByNumber, caseHasWhatsappNumber } from '../utils/caseClients'
import { formatDisplayDate } from '../utils/dateUtils'
import { formatCurrency } from '../utils/formatUtils'
import { getErrorMessage } from '../utils/errorMessages'
import { confirmDialog } from '../utils/confirmDialog'

// Small helper for messages like "1 client" / "3 clients"
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// Everything related to WhatsApp reminders: settings status, per-case auto reminders and manual hearing/payment reminders
export default function useWhatsApp({
  loggedIn, cases, setCases, clients, addToast, getCaseFeeSummary, openClientForEdit,
}) {
  // WhatsApp configuration status from the backend (null until loaded)
  const [status, setStatus] = useState(null)
  // Error shown when the WhatsApp settings can't be loaded
  const [statusError, setStatusError] = useState('')
  // Which actions are currently running (by key), used to disable buttons
  const [busy, setBusy] = useState({})
  // Keys of requests already running, so a double click can't send the same reminder twice
  const inFlight = useRef(new Set())

  // Load the WhatsApp status from the backend
  const loadStatus = useCallback(async () => {
    setStatusError('')
    try {
      setStatus(await api.whatsapp.status())
    } catch (e) {
      setStatus(null)
      setStatusError(getErrorMessage(e, 'Could not load WhatsApp settings'))
    }
  }, [])

  // Load the status after login and clear it on logout
  useEffect(() => {
    if (loggedIn) loadStatus()
    else { setStatus(null); setStatusError('') }
  }, [loggedIn, loadStatus])

  // Runs an action only if the same one isn't already in progress, and tracks the busy flag
  const runOnce = useCallback(async (key, fn) => {
    if (inFlight.current.has(key)) return
    inFlight.current.add(key)
    setBusy(b => ({ ...b, [key]: true }))
    try {
      await fn()
    } finally {
      inFlight.current.delete(key)
      setBusy(b => { const n = { ...b }; delete n[key]; return n })
    }
  }, [])

  // Whether the case has any client number to send to
  const caseHasReminderNumber = c => caseHasWhatsappNumber(c, clients)

  // Automatic reminders really run only if the advocate hasn't turned them off and a client has a number.
  // Adding a number later switches them on by itself
  const caseRemindersOn = c => c.whatsappReminders !== false && caseHasReminderNumber(c)

  // Turn the automatic reminder for one case on or off and update the case in local state
  const toggleCaseReminders = c => runOnce(`case-${c.id}`, async () => {
    if (!caseHasReminderNumber(c)) {
      await askToAddNumber(c, 'automatic reminder')
      return
    }
    // Reminders are on unless explicitly set to false, so flip the current value
    const turnOn = c.whatsappReminders === false
    try {
      await api.whatsapp.setCase(c.id, turnOn, c.reminderDaysBefore || 1)
      setCases(prev => prev.map(x => (x.id === c.id ? { ...x, whatsappReminders: turnOn } : x)))
      addToast(`Auto reminder ${turnOn ? 'on' : 'off'} for this case`)
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not change reminders for this case'), 'error')
    }
  })

  // Change how many days before the hearing the automatic reminder is sent
  const setCaseReminderDays = (c, days) => runOnce(`case-${c.id}`, async () => {
    const enabled = c.whatsappReminders !== false
    try {
      await api.whatsapp.setCase(c.id, enabled, days)
      setCases(prev => prev.map(x => (x.id === c.id ? { ...x, reminderDaysBefore: days } : x)))
      addToast(`Auto reminder now fires ${days} day${days === 1 ? '' : 's'} before the hearing`)
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not change the reminder timing for this case'), 'error')
    }
  })

  // Shows toasts that summarise what happened after sending (sent / failed / missing number)
  function report(result, what) {
    // Counts returned by the backend; dryRun means test mode where nothing is really sent
    const { sent = 0, failed = 0, noNumber = 0, dryRun, problems = [] } = result || {}

    if (sent > 0) {
      addToast(dryRun
        ? `Test mode — ${what} logged for ${plural(sent, 'client')}, not actually sent`
        : `${what[0].toUpperCase()}${what.slice(1)} sent to ${plural(sent, 'client')}`)
    }
    if (failed > 0) {
      addToast(`Could not send to ${plural(failed, 'client')} — ${problems.join('; ') || 'unknown error'}`, 'error')
    }
    if (noNumber > 0) {
      addToast(
        `${plural(noNumber, 'client')} ${noNumber === 1 ? 'has' : 'have'} no WhatsApp number saved, so nothing was sent to them. Add the number in the client's profile`,
        'error'
      )
    }
    if (!sent && !failed && !noNumber) addToast('No message was sent', 'error')
  }

  // Tells the user a phone number is missing and offers to open the client's edit form to add it.
  // Returns true when the edit form was opened.
  async function askToAddNumber(c, what) {
    const { missing } = caseClientsByNumber(c, clients)
    if (missing.length === 0) {
      addToast('Add a client with a phone number to this case to turn on automatic reminders', 'error')
      return false
    }
    const who = missing.map(m => m.name).join(', ')
    const goAdd = await confirmDialog({
      title: 'Add a phone number',
      message: `${who} ${missing.length === 1 ? 'has' : 'have'} no phone number saved, so the ${what} can't be sent.\n\nAdd the number now?`,
      confirmLabel: 'Add number',
      cancelLabel: 'Not now',
    })
    const target = missing.find(m => m.client)
    if (goAdd && target) { openClientForEdit?.(target.client); return true }
    return false
  }

  // Works out who a manual reminder can go to. When nobody on the case has a WhatsApp number it asks the user to add one
  // (opening the client's edit form) and returns null; otherwise it returns the names to send to and the names to skip.
  async function recipientsOrAskForNumber(c, what) {
    const { withNumber, missing } = caseClientsByNumber(c, clients)
    if (withNumber.length === 0 && missing.length > 0) {
      await askToAddNumber(c, what)
      return null
    }
    return { names: withNumber.map(m => m.name), skipped: missing.map(m => m.name) }
  }

  // Note appended to the confirmation when some clients on the case have no number
  const skippedNote = skipped => (skipped.length
    ? `\n\nNo WhatsApp number saved for ${skipped.join(', ')}, so they will be skipped. You can add it in their profile.`
    : '')

  // Manually send a hearing reminder to all clients of a case, after asking the user to confirm
  const sendHearingReminder = async c => {
    if (!c?.nextHearing) {
      addToast('This case has no next hearing date to remind about', 'error')
      return
    }

    // Who can receive it (asks for a number first if nobody has one)
    const to = await recipientsOrAskForNumber(c, 'hearing reminder')
    if (!to) return
    const ok = await confirmDialog({
      title: 'Send hearing reminder?',
      message: `Send a WhatsApp hearing reminder to ${to.names.join(', ')}?\n\n${c.title}\nHearing: ${formatDisplayDate(c.nextHearing)}${skippedNote(to.skipped)}`,
      confirmLabel: 'Send',
    })
    if (!ok) return

    return runOnce(`hearing-${c.id}`, async () => {
      try {
        report(await api.whatsapp.sendHearingReminder(c.id), 'hearing reminder')
      } catch (e) {
        addToast(getErrorMessage(e, 'Could not send the reminder'), 'error')
      }
    })
  }

  // Manually send a payment reminder; accepts a case object or a case id
  const sendPaymentReminder = async caseOrId => {
    const c = typeof caseOrId === 'object'
      ? caseOrId
      : cases.find(x => String(x.id) === String(caseOrId))
    if (!c) return

    // No point sending a payment reminder if nothing is pending
    const due = getCaseFeeSummary(c).due
    if (due <= 0) {
      addToast('Nothing is due on this case', 'error')
      return
    }

    const to = await recipientsOrAskForNumber(c, 'payment reminder')
    if (!to) return
    const ok = await confirmDialog({
      title: 'Send payment reminder?',
      message: `Send a WhatsApp payment reminder to ${to.names.join(', ')}?\n\n${c.title}\nAmount due: ${formatCurrency(due)}${skippedNote(to.skipped)}`,
      confirmLabel: 'Send',
    })
    if (!ok) return

    return runOnce(`payment-${c.id}`, async () => {
      try {
        report(await api.whatsapp.sendPaymentReminder(c.id), 'payment reminder')
      } catch (e) {
        addToast(getErrorMessage(e, 'Could not send the reminder'), 'error')
      }
    })
  }

  // Values and actions exposed to AppContext
  return {
    whatsappStatus: status,
    whatsappError: statusError,
    reloadWhatsApp: loadStatus,
    whatsappBusy: busy,
    toggleCaseReminders,
    caseRemindersOn,
    caseHasReminderNumber,
    setCaseReminderDays,
    sendHearingReminder,
    sendPaymentReminder,
  }
}
