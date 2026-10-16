import { useApp } from '../../context/AppContext'
import useOverlayClose from '../../hooks/useOverlayClose'
import PasswordInput from '../common/PasswordInput'
import Icon from '../common/Icon'
import { enterKey } from '../../utils/enterKey'
import ModalPortal from '../../components/common/ModalPortal'

// Popup opened from Edit Profile: step 1 asks for the new email and current password, step 2 for the emailed 6-digit code
export default function EmailChangeModal() {
  const {
    currentUser,
    isChangingEmail,
    emailChangeForm,
    setEmailChangeForm,
    emailChangeOtpSent,
    emailChangeSending,
    emailChangeConfirming,
    emailChangeResendInSec,
    cancelChangeEmail,
    handleSendEmailChangeOtp,
    handleConfirmEmailChange,
    authError,
  } = useApp()

  const overlayHandlers = useOverlayClose(cancelChangeEmail)

  if (!isChangingEmail) return null

  // Google sign-ups need a password before they can change their email
  const noPassword = currentUser?.passwordSet === false

  return (
    <ModalPortal>
      <div className="overlay" {...overlayHandlers}>
        <div className="modal modal--sm" onClick={e => e.stopPropagation()}>

          <div className="modal__header">
            <h2 className="modal__title">Change Email</h2>
            <button type="button" className="btn-icon" onClick={cancelChangeEmail} aria-label="Close"><Icon name="close" /></button>
          </div>

          {!emailChangeOtpSent ? (
            <>
              <p className="account-modal__text">
                Current email: <strong>{currentUser?.email}</strong>. We'll check your password, then email a
                6-digit code to the new address to confirm you own it before anything changes.
              </p>

              {noPassword && (
                <p className="profile-note u-mt-12">
                  You signed up with Google, so there is no password to check yet. Set one under
                  Password on your Profile page first.
                </p>
              )}

              <div className="account-modal__field">
                <label className="form-label">New Email</label>
                <input
                  className="form-input"
                  type="email"
                  autoComplete="email"
                  placeholder="you@email.com"
                  value={emailChangeForm.newEmail}
                  onChange={e => setEmailChangeForm(f => ({ ...f, newEmail: e.target.value.toLowerCase() }))}
                  autoFocus
                />
              </div>

              <div className="account-modal__field">
                <label className="form-label">Current Password</label>
                <PasswordInput
                  className="form-input"
                  autoComplete="current-password"
                  placeholder="Your current password"
                  value={emailChangeForm.password}
                  onChange={e => setEmailChangeForm(f => ({ ...f, password: e.target.value }))}
                  onKeyDown={enterKey(() => !noPassword && handleSendEmailChangeOtp())}
                />
              </div>

              {authError && <p className="account-modal__error" role="alert">{authError}</p>}

              <div className="form-actions">
                <button type="button" className="btn-outline" onClick={cancelChangeEmail}>Cancel</button>
                <button type="button"
                  className="btn-gold"
                  onClick={handleSendEmailChangeOtp}
                  disabled={emailChangeSending || noPassword}
                >
                  {emailChangeSending ? 'Sending…' : 'Send verification code'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="account-modal__text">
                Enter the 6-digit code we emailed to <strong>{emailChangeForm.newEmail}</strong>.
              </p>

              <div className="account-modal__field">
                <label className="form-label">6-Digit Code</label>
                <input
                  className="form-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="6-digit code"
                  value={emailChangeForm.otp}
                  onChange={e => setEmailChangeForm(f => ({
                    ...f, otp: e.target.value.replace(/\D/g, '').slice(0, 6)
                  }))}
                  onKeyDown={enterKey(() => handleConfirmEmailChange())}
                  autoFocus
                />
              </div>

              <div className="u-mt-12">
                <button
                  type="button"
                  className="profile-reset-link"
                  onClick={handleSendEmailChangeOtp}
                  disabled={emailChangeSending || emailChangeResendInSec > 0}
                >
                  {emailChangeSending
                    ? 'Sending…'
                    : emailChangeResendInSec > 0
                      ? `Resend code in ${emailChangeResendInSec}s`
                      : 'Resend code'}
                </button>
              </div>

              {authError && <p className="account-modal__error" role="alert">{authError}</p>}

              <div className="form-actions">
                <button type="button" className="btn-outline" onClick={cancelChangeEmail}>Cancel</button>
                <button type="button" className="btn-gold" onClick={handleConfirmEmailChange} disabled={emailChangeConfirming}>
                  {emailChangeConfirming ? 'Confirming…' : 'Confirm New Email'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}
