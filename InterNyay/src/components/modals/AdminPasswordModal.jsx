import { useState } from 'react'
import useOverlayClose from '../../hooks/useOverlayClose'
import PasswordInput from '../common/PasswordInput'
import Icon from '../common/Icon'
import ModalPortal from '../common/ModalPortal'
import { getErrorMessage } from '../../utils/errorMessages'
import { enterKey } from '../../utils/enterKey'

// Asks the signed-in admin for their own password before a permanent action (deleting an account).
//   title, message, confirmLabel  wording of the popup
//   danger                        red confirm button
//   onConfirm(password)           async: does the work; throw to show the problem under the field and keep the popup open
//   onClose()                     close without doing anything (also called after a successful confirm)
export default function AdminPasswordModal({ title, message, confirmLabel = 'Confirm', danger = true, onConfirm, onClose }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Block closing while the request is running
  function close() {
    if (!busy) onClose()
  }
  const overlayHandlers = useOverlayClose(close)

  async function submit() {
    if (busy) return
    if (!password) { setError('Enter your password to continue'); return }
    setBusy(true)
    setError('')
    try {
      await onConfirm(password)
      onClose()
    } catch (e) {
      setError(getErrorMessage(e, 'Something went wrong. Please try again.'))
      setBusy(false)
    }
  }

  return (
    <ModalPortal>
      <div className="overlay" {...overlayHandlers}>
        <div className="modal modal--sm" onClick={e => e.stopPropagation()} role="alertdialog" aria-label={title}>

          <div className="modal__header">
            <h2 className="modal__title">{title}</h2>
            <button type="button" className="btn-icon" onClick={close} aria-label="Close"><Icon name="close" /></button>
          </div>

          <p className="account-modal__text">{message}</p>

          <div className="account-modal__field">
            <label className="form-label">Your admin password</label>
            <PasswordInput
              className="form-input"
              autoComplete="current-password"
              placeholder="Enter your password to continue"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              onKeyDown={enterKey(() => submit())}
              autoFocus
            />
          </div>

          {error && <p className="account-modal__error" role="alert">{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={close} disabled={busy}>Cancel</button>
            <button type="button" className={danger ? 'btn-danger' : 'btn-gold'} onClick={submit} disabled={busy || !password}>
              {busy ? 'Please wait…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
