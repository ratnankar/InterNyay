import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import PasswordInput from './PasswordInput'
import PinInput from './PinInput'
import GoogleButton, { googleEnabled } from '../auth/GoogleButton'
import { getErrorMessage } from '../../utils/errorMessages'
import { enterKey } from '../../utils/enterKey'

// Profile card for the 4-digit Transactions PIN: create it (no password needed), change it with the old PIN, or reset it with the password.
// Google sign-ups have no password: they reset a forgotten PIN by confirming with Google
export default function TransactionPinCard() {
  const { currentUser, updateCurrentUser, addToast } = useApp()

  const pinSet = currentUser?.txnPinSet === true
  // Google sign-ups have no password, so they confirm a forgotten PIN with Google instead
  const noPassword = currentUser?.passwordSet === false

  // Which form is open: 'change' (old PIN), 'reset' (forgotten PIN; also used to create the first PIN) or none
  const [mode, setMode] = useState(null)

  // Form state
  const [currentPin, setCurrentPin] = useState('')
  const [password, setPassword] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Open a form with clean fields
  function open(next) {
    setMode(next)
    setCurrentPin('')
    setPassword('')
    setNewPin('')
    setConfirmPin('')
    setError('')
  }

  // Validate, then save through the change or reset endpoint (googleIdToken is only used to reset a Google account's PIN)
  async function save(googleIdToken) {
    if (busy) return

    if (mode === 'change' && currentPin.length !== 4) return setError('Enter your current 4-digit PIN')
    if (needsPassword && !password) return setError('Enter your password')
    if (newPin.length !== 4) return setError('The new PIN must be 4 digits')
    if (newPin !== confirmPin) return setError('The two PINs do not match')

    setBusy(true)
    setError('')

    try {
      const updated = mode === 'change'
        ? await api.auth.changeTxnPin(currentPin, newPin)
        : await api.auth.resetTxnPin(needsPassword ? password : '', newPin, typeof googleIdToken === 'string' ? googleIdToken : undefined)

      updateCurrentUser(updated)
      addToast(mode === 'change' ? 'PIN changed' : pinSet ? 'PIN reset' : 'PIN created')
      setMode(null)
    } catch (e) {
      setError(getErrorMessage(e, 'Could not save the PIN'))
    } finally {
      setBusy(false)
    }
  }

  const creating = mode === 'reset' && !pinSet

  // Only a forgotten PIN is confirmed (the first PIN needs nothing): with the password, or with Google for accounts that have no password
  const needsPassword = mode === 'reset' && pinSet && !noPassword
  const needsGoogleConfirm = mode === 'reset' && pinSet && noPassword

  return (
    <div className="card profile-card">
      <div className="page-header page-header--top">
        <h3 className="section-title">Transactions PIN</h3>
        {!mode && pinSet && (
          <button type="button" className="btn-outline" onClick={() => open('change')}>Change PIN</button>
        )}
        {!mode && !pinSet && (
          <button type="button" className="btn-gold" onClick={() => open('reset')}>Create PIN</button>
        )}
      </div>

      {!mode && (
        <p className="profile-note">
          {pinSet
            ? 'A 4-digit PIN is asked every time you open the Transactions page.'
            : 'You have not created a PIN yet. Create a 4-digit PIN to protect the Transactions page. You will also be asked to create it the first time you open Transactions.'}
        </p>
      )}

      {!mode && pinSet && (
        <p className="profile-note u-mt-8 u-mb-0">
          <button type="button" className="profile-reset-link" onClick={() => open('reset')}>
            {noPassword ? 'Forgot your PIN? Reset it with Google' : 'Forgot your PIN? Reset it with your password'}
          </button>
        </p>
      )}

      {mode && (
        <>
          <p className="profile-note">
            {mode === 'change'
              ? 'Enter your current PIN, then choose a new one.'
              : creating
                ? 'Choose a 4-digit PIN to protect Transactions.'
                : noPassword
                  ? 'Choose a new 4-digit PIN, then confirm it is you with Google.'
                  : 'Enter your password to confirm it is you, then choose a new 4-digit PIN.'}
          </p>

          {mode === 'change' ? (
            <div className="pin-field">
              <label className="form-label">Current PIN</label>
              <PinInput label="Current PIN" value={currentPin} onChange={setCurrentPin} disabled={busy} autoFocus />
            </div>
          ) : !needsPassword ? null : (
            <div className="pin-field pin-field--password">
              <label className="form-label">Password</label>
              <PasswordInput
                className="form-input"
                autoComplete="current-password"
                placeholder="Your account password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoFocus
                onKeyDown={enterKey(e => e.currentTarget.closest('.card')?.querySelector('.pin-input__box:not(:disabled)')?.focus())}
              />
            </div>
          )}

          <div className="pin-field">
            <label className="form-label">{creating ? 'PIN' : 'New PIN'}</label>
            <PinInput label="New PIN" value={newPin} onChange={setNewPin} disabled={busy} autoFocus={mode === 'reset' && !needsPassword} showToggle={false} />
          </div>

          <div className="pin-field">
            <label className="form-label">Confirm PIN</label>
            <PinInput
              label="Confirm PIN"
              value={confirmPin}
              onChange={setConfirmPin}
              onEnter={needsGoogleConfirm ? undefined : () => save()}
              disabled={busy}
            />
          </div>

          {error && <p className="account-modal__error" role="alert">{error}</p>}

          {needsGoogleConfirm ? (
            <>
              {googleEnabled ? (
                <div className="pin-field">
                  <GoogleButton onCredential={save} />
                </div>
              ) : (
                <p className="account-modal__error" role="alert">Google sign-in is not available right now, so the PIN cannot be reset.</p>
              )}
              <div className="form-actions">
                <button type="button" className="btn-outline" onClick={() => setMode(null)} disabled={busy}>Cancel</button>
              </div>
            </>
          ) : (
            <div className="form-actions">
              <button type="button" className="btn-outline" onClick={() => setMode(null)} disabled={busy}>Cancel</button>
              <button type="button" className="btn-gold" onClick={() => save()} disabled={busy}>
                {busy ? 'Saving…' : mode === 'change' ? 'Change PIN' : creating ? 'Create PIN' : 'Reset PIN'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
