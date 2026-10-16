import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import useOverlayClose from '../../hooks/useOverlayClose'
import PasswordInput from '../common/PasswordInput'

import Icon from '../common/Icon'
import { getErrorMessage } from '../../utils/errorMessages'
import { enterKey } from '../../utils/enterKey'
import ModalPortal from '../../components/common/ModalPortal'
// Word the user must type to confirm permanent deletion
const CONFIRM_WORD = 'DELETE'

// Title, button label and warning text for each action, with separate wording for advocates and associates
const COPY = {
  deactivate: {
    title: 'Deactivate account',
    confirm: 'Deactivate',
    advocate:
      'You will be signed out and your account will be paused. Your cases, clients, hearings and documents are kept, ' +
      'but your associates lose access and automatic WhatsApp reminders stop. Sign in again at any time to reactivate.',
    associate:
      'You will be signed out and your account will be paused. Sign in again at any time to reactivate it.',
  },
  delete: {
    title: 'Delete account',
    confirm: 'Delete permanently',
    advocate:
      "This permanently deletes your account, every case, client, hearing, task and document in it, and your associates' accounts. " +
      'It cannot be undone.',
    associate:
      "This permanently deletes your associate account. The advocate's records are not affected. It cannot be undone.",
  },
}

// Confirmation popup to deactivate or delete the account, mode picks which one
export default function AccountActionModal({ mode, onClose }) {
  // Account handlers come from AppContext; isAssociate picks the wording
  const { isAssociate, handleDeactivateAccount, handleDeleteAccount } = useApp()

  // Password for re-confirming the action, the typed confirm word, and busy and error state
  const [password, setPassword] = useState('')
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Delete asks for the confirm word as well as the password
  const isDelete = mode === 'delete'
  const copy = COPY[mode]
  // Needs a password, and for delete the exact confirm word, and no request in flight
  const canSubmit = !busy && password.length > 0 && (!isDelete || typed.trim() === CONFIRM_WORD)

  // Block closing while the request is running
  function close() {
    if (!busy) onClose()
  }

  const overlayHandlers = useOverlayClose(close)

  // Run deactivate or delete; on success the app signs the user out, on failure show the error
  async function submit() {
    if (!canSubmit) return

    setBusy(true)
    setError('')

    try {
      await (isDelete ? handleDeleteAccount(password) : handleDeactivateAccount(password))
    } catch (e) {
      setError(getErrorMessage(e, 'Something went wrong. Please try again.'))
      setBusy(false)
    }
  }

  return (
    <ModalPortal>
      <div className="overlay" {...overlayHandlers}>
        <div className="modal modal--sm" onClick={e => e.stopPropagation()}>

          <div className="modal__header">
            <h2 className="modal__title">{copy.title}</h2>
            <button type="button" className="btn-icon" onClick={close} aria-label="Close"><Icon name="close" /></button>
          </div>

          <p className="account-modal__text">{isAssociate ? copy.associate : copy.advocate}</p>

          {isDelete && (
            <div className="account-modal__field">
              <label className="form-label">Type {CONFIRM_WORD} to confirm</label>
              <input
                className="form-input"
                type="text"
                autoComplete="off"
                placeholder={CONFIRM_WORD}
                value={typed}
                onChange={e => setTyped(e.target.value)}
                autoFocus
              />
            </div>
          )}

          <div className="account-modal__field">
            <label className="form-label">Your password</label>
            <PasswordInput
              className="form-input"
              autoComplete="current-password"
              placeholder="Enter your password to continue"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={enterKey(() => submit())}
              autoFocus={!isDelete}
            />
          </div>

          {error && <p className="account-modal__error" role="alert">{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={close} disabled={busy}>Cancel</button>
            <button type="button"
              className={isDelete ? 'btn-danger' : 'btn-gold'}
              onClick={submit}
              disabled={!canSubmit}
            >
              {busy ? 'Please wait…' : copy.confirm}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
