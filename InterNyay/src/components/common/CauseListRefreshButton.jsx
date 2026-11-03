import { useState } from 'react'
import api from '../../services/api'
import { useApp } from '../../context/AppContext'
import { getErrorMessage } from '../../utils/errorMessages'
import Icon from './Icon'

// Statuses the backend answers with that are good news, shown as a success toast (anything else is shown as an error)
const GOOD = new Set(['UPDATED', 'UNCHANGED'])

// Looks one case up in the court's cause list again for the selected hearing date and updates the dashboard.
// A small round icon on the hearing row, or (withLabel) a labelled button in the expanded card
export default function CauseListRefreshButton({ caseId, dateKey, onDone, withLabel = false, hasNumber = true }) {
  const { addToast } = useApp()
  const [busy, setBusy] = useState(false)

  async function refresh(e) {
    // The hearing card toggles when it is clicked, this button must not do that
    e.stopPropagation()
    if (busy) return
    setBusy(true)

    try {
      const r = await api.cases.refreshCauseList(caseId, dateKey)
      const text = r.status === 'UPDATED' && r.causeListNo != null
        ? `Cause list number updated: ${r.causeListNo}`
        : r.message || 'Cause list checked'
      addToast(text, GOOD.has(r.status) ? undefined : 'error')
      onDone?.()
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not refresh the cause list'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const title = busy ? 'Checking the cause list…' : 'Refresh cause list number'

  if (withLabel) {
    return (
      <button type="button" className="btn-outline btn-outline--sm" data-short="Cause list"
        onClick={refresh} disabled={busy} title={title}>
        <Icon name="refresh" className={busy ? 'icon--spin' : undefined} /> {busy ? 'Checking…' : 'Refresh Cause List'}
      </button>
    )
  }

  // No number yet: the button says what it fetches, since there is no Cause List chip beside it to explain the icon
  if (!hasNumber) {
    return (
      <button type="button" className={`cause-list-refresh cause-list-refresh--labelled${busy ? ' cause-list-refresh--busy' : ''}`}
        onClick={refresh} disabled={busy} title="Look up this case's cause list number">
        <Icon name="refresh" /> {busy ? 'Checking…' : 'Get Cause List No.'}
      </button>
    )
  }

  return (
    <button type="button" className={`cause-list-refresh${busy ? ' cause-list-refresh--busy' : ''}`}
      onClick={refresh} disabled={busy} title={title} aria-label={title}>
      <Icon name="refresh" />
    </button>
  )
}
