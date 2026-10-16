import { useState } from 'react'
import AuthBackdrop from './AuthBackdrop'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import CourtPreferencePicker from '../common/CourtPreferencePicker'
import { setCourtPreferences, useCourts } from '../../constants/courts'
import { getErrorMessage } from '../../utils/errorMessages'
import { greetingName } from '../../utils/nameUtils'

// Shown once after a new account is created: which courts does the user work at?
// The answer decides the courts the app opens on (judges, roster, police directory, Add Case). It can be changed any
// time on the Profile page, and skipping it is fine: the court with the most cases is used instead
export default function ChooseCourts() {
  const { currentUser, finishCourtPrompt, addToast, updateCurrentUser } = useApp()
  const [ids, setIds] = useState([])
  const { rows } = useCourts()
  // A court covers several district rows, so count courts by name, not by id
  const courtCount = new Set(rows.filter(r => ids.includes(r.id)).map(r => r.court)).size
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (busy) return
    if (!ids.length) { finishCourtPrompt(); return }
    setBusy(true)
    setError('')
    try {
      const res = await api.courtPreferences.save(ids)
      setCourtPreferences(res)
      updateCurrentUser({ courtPreferenceIds: res.saved })
      addToast('Court preference saved')
      finishCourtPrompt()
    } catch (e) {
      setError(getErrorMessage(e, 'Could not save your courts. You can set them later on your Profile page'))
    } finally {
      setBusy(false)
    }
  }

  const firstName = greetingName(currentUser?.name)

  return (
    <div className="auth-page auth-page--plans">
      <AuthBackdrop />
      <div className="choose-plan choose-courts">
        <div className="choose-plan__head">
          <h1>{firstName ? `Which courts do you work at, ${firstName}?` : 'Which courts do you work at?'}</h1>
          <p>Select the courts you work at. You can pick more than one.</p>
        </div>

        <div className="card choose-courts__card">
          <CourtPreferencePicker value={ids} onChange={setIds} disabled={busy} />
          {error && <p className="account-modal__error" role="alert">{error}</p>}
          <div className="form-actions choose-courts__actions">
            <button type="button" className="btn-gold" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : courtCount ? `Continue with ${courtCount} ${courtCount === 1 ? 'court' : 'courts'}` : 'Continue'}
            </button>
          </div>
        </div>

        <div className="choose-plan__foot">
          <button type="button" className="skip-btn" onClick={finishCourtPrompt} disabled={busy}>
            <span className="skip-btn__label">Skip for now</span>
          </button>
        </div>
      </div>
    </div>
  )
}
