import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import PasswordInput from '../common/PasswordInput'
import PinInput from '../common/PinInput'
import GoogleButton, { googleEnabled } from './GoogleButton'

import Icon from '../common/Icon'
import { getErrorMessage } from '../../utils/errorMessages'
import { enterKey } from '../../utils/enterKey'
// Asks for the 4-digit Transactions PIN before the Transactions page is shown.
// A user with no PIN yet creates one here with no password, and a forgotten PIN is reset with the password.
// Google sign-ups have no password: they reset a forgotten PIN by confirming with Google
export default function TransactionAccessGate() {
  const { currentUser, unlockTransactions, updateCurrentUser } = useApp()

  // Has this user created a PIN yet
  const pinSet = currentUser?.txnPinSet === true

  // True when the user chose "Forgot PIN?" on the PIN screen
  const [forgot, setForgot] = useState(false)

  // Form state
  const [pin, setPin] = useState('')
  const [pinKey, setPinKey] = useState(0)
  const [password, setPassword] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Accounts created with Google have no password, so no password is asked for their PIN
  const noPassword = currentUser?.passwordSet === false

  // Which screen to show: enter the PIN, or create / reset it
  const view = !pinSet ? 'create' : forgot ? 'reset' : 'enter'

  // A forgotten PIN is confirmed with the password, or with Google for accounts that have no password. A first PIN needs neither
  const needsPassword = view === 'reset' && !noPassword
  const needsGoogleConfirm = view === 'reset' && noPassword

  // Check the PIN with the backend and unlock the page if it's right
  async function submitPin(code) {
    if (busy || code.length !== 4) return

    setBusy(true)
    setError('')

    try {
      await api.auth.verifyTxnPin(code)
      unlockTransactions()
    } catch (e) {
      setError(getErrorMessage(e, 'Incorrect PIN'))
      // Clear the boxes and put the cursor back in the first one
      setPin('')
      setPinKey(k => k + 1)
    } finally {
      setBusy(false)
    }
  }

  // Create the first PIN (no password needed) or reset a forgotten one. A reset is confirmed with the password,
  // or with a fresh Google sign-in (googleIdToken) for accounts that have no password
  async function submitNewPin(googleIdToken) {
    if (busy) return

    if (needsPassword && !password) return setError('Enter your password')
    if (newPin.length !== 4) return setError('Enter a 4-digit PIN')
    if (newPin !== confirmPin) return setError('The two PINs do not match')

    setBusy(true)
    setError('')

    try {
      const updated = await api.auth.resetTxnPin(
        needsPassword ? password : '',
        newPin,
        typeof googleIdToken === 'string' ? googleIdToken : undefined
      )
      updateCurrentUser(updated)
      unlockTransactions()
    } catch (e) {
      setError(getErrorMessage(e, 'Could not save the PIN'))
    } finally {
      setBusy(false)
    }
  }

  // Go back from the reset screen to the PIN screen
  function backToPin() {
    setForgot(false)
    setPassword('')
    setNewPin('')
    setConfirmPin('')
    setError('')
  }

  // Normal case: enter the PIN
  if (view === 'enter') {
    return (
      <div className="txn-gate">
        <div className="card txn-gate__card">
          <div className="txn-gate__icon"><Icon name="lock" /></div>
          <h2 className="section-title">Enter your PIN</h2>
          <p className="profile-note">
            Enter your 4-digit PIN to view Transactions
            {currentUser?.name ? `, ${currentUser.name}` : ''}.
          </p>

          <div className="txn-gate__pin">
            <PinInput
              key={pinKey}
              label="Transactions PIN"
              value={pin}
              onChange={setPin}
              onComplete={submitPin}
              disabled={busy}
              autoFocus
            />
          </div>

          {error && <p className="account-modal__error" role="alert">{error}</p>}

          <div className="form-actions u-justify-center" >
            <button type="button" className="btn-gold" onClick={() => submitPin(pin)} disabled={busy || pin.length !== 4}>
              {busy ? 'Checking…' : 'Unlock Transactions'}
            </button>
          </div>

          <p className="profile-note txn-gate__link">
            <button
              type="button"
              className="profile-reset-link"
              onClick={() => { setForgot(true); setError('') }}
            >
              Forgot your PIN?
            </button>
          </p>
        </div>
      </div>
    )
  }

  // First time (create): just a new PIN typed twice. Forgotten PIN (reset): confirmed as set up above
  const creating = view === 'create'

  return (
    <div className="txn-gate">
      <div className="card txn-gate__card">
        <div className="txn-gate__icon"><Icon name="lock" /></div>
        <h2 className="section-title">{creating ? 'Create your PIN' : 'Reset your PIN'}</h2>
        <p className="profile-note">
          {creating
            ? 'Choose a 4-digit PIN to protect Transactions. You will use it every time you open the page.'
            : noPassword
              ? 'Choose a new 4-digit PIN, then confirm it is you with Google.'
              : 'Enter your account password, then choose a new 4-digit PIN.'}
        </p>

        {needsPassword && (
          <div className="account-modal__field txn-gate__password-field">
            <label className="form-label">Password</label>
            <PasswordInput
              className="form-input"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              onKeyDown={enterKey(e => e.currentTarget.closest('.card')?.querySelector('.pin-input__box:not(:disabled)')?.focus())}
            />
          </div>
        )}

        <div className="account-modal__field txn-gate__pin-field">
          <label className="form-label">New PIN</label>
          <PinInput label="New PIN" value={newPin} onChange={setNewPin} disabled={busy} autoFocus={!needsPassword} showToggle={false} />
        </div>

        <div className="account-modal__field txn-gate__pin-field">
          <label className="form-label">Confirm PIN</label>
          <PinInput
            label="Confirm PIN"
            value={confirmPin}
            onChange={setConfirmPin}
            onEnter={needsGoogleConfirm ? undefined : () => submitNewPin()}
            disabled={busy}
          />
        </div>

        {error && <p className="account-modal__error" role="alert">{error}</p>}

        {needsGoogleConfirm && (
          googleEnabled ? (
            <div className="account-modal__field">
              <GoogleButton onCredential={submitNewPin} />
            </div>
          ) : (
            <p className="account-modal__error" role="alert">Google sign-in is not available right now, so the PIN cannot be reset.</p>
          )
        )}

        <div className="form-actions u-justify-center" >
          {!creating && (
            <button type="button" className="btn-outline" onClick={backToPin} disabled={busy}>Back</button>
          )}
          {!needsGoogleConfirm && (
            <button type="button"
              className="btn-gold"
              onClick={() => submitNewPin()}
              disabled={busy || (needsPassword && !password) || newPin.length !== 4 || confirmPin.length !== 4}
            >
              {busy ? 'Saving…' : creating ? 'Create PIN & Unlock' : 'Reset PIN & Unlock'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}