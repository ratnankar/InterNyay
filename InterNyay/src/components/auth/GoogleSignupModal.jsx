import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import useOverlayClose from '../../hooks/useOverlayClose'
import Icon from '../common/Icon'
import { starLabel } from '../common/Req'
import { enterKey } from '../../utils/enterKey'
import ModalPortal from '../../components/common/ModalPortal'

// Popup shown after a new user signs up with Google: Google only gives a name and email, so this asks for the
// mobile number (and, for associates, the advocate code) in its own window so the registration form behind it
// stays untouched. Closing it drops the Google sign-in
export default function GoogleSignupModal() {
  const { googlePending, completeGoogleSignup, cancelGooglePending, authError, regForm } = useApp()

  const isAssociate = regForm.accountType === 'ASSOCIATE'

  // Start with the number already typed on the registration form, if any
  const [phone, setPhone] = useState(regForm.phone || '')
  const [code, setCode] = useState(regForm.advocateCode || '')
  const [busy, setBusy] = useState(false)

  // Block closing while the account is being created
  function close() {
    if (!busy) cancelGooglePending()
  }

  const overlayHandlers = useOverlayClose(close)

  // Create the account with the typed details; a wrong value shows its error here and keeps the popup open
  async function submit() {
    if (busy) return

    setBusy(true)
    try {
      await completeGoogleSignup({ phone, code })
    } finally {
      setBusy(false)
    }
  }

  if (!googlePending) return null

  const ready = phone.trim() && (!isAssociate || code.trim())

  return (
    <ModalPortal>
      <div className="overlay overlay--auth" {...overlayHandlers}>
        <div className="modal modal--sm modal--auth" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>

          <div className="modal__header">
            <div className="modal--auth__heading">
              <span className="modal--auth__icon" aria-hidden="true"><Icon name="user" /></span>
              <h2 className="modal__title">Complete your sign-up</h2>
            </div>
            <button type="button" className="btn-icon" onClick={close} aria-label="Close" disabled={busy}><Icon name="close" /></button>
          </div>

          <p className="account-modal__text">
            You signed in with Google as <strong>{googlePending.name || googlePending.email}</strong>
            {googlePending.name && googlePending.email ? ` (${googlePending.email})` : ''}.
            {isAssociate
              ? " Enter your mobile number and the advocate code shown on your advocate's Profile page to finish creating your associate account."
              : ' Enter your mobile number to finish creating your account.'}
          </p>

          <div className="account-modal__field">
            <label className="form-label">{starLabel('Mobile number *')}</label>
            <input
              className="form-input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+91 XXXXX XXXXX"
              maxLength={16}
              autoFocus
              value={phone}
              onChange={e => setPhone(e.target.value)}
              onKeyDown={enterKey(() => submit())}
              disabled={busy}
            />
          </div>

          {isAssociate && (
            <div className="account-modal__field">
              <label className="form-label">{starLabel('Advocate code *')}</label>
              <input
                className="form-input advocate-code-input"
                type="text"
                placeholder="XXXXX-XXXXX"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={16}
                value={code}
                onChange={e => setCode(e.target.value)}
                onKeyDown={enterKey(() => submit())}
                disabled={busy}
              />
            </div>
          )}

          {authError && <p className="account-modal__error" role="alert">{authError}</p>}

          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={close} disabled={busy}>Use a different Google account</button>
            <button type="button" className="btn-gold" onClick={submit} disabled={busy || !ready}>
              {busy ? 'Creating…' : isAssociate ? 'Create Associate Account' : 'Create Account'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
