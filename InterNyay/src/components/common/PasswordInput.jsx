import { useState } from 'react'

import Icon from './Icon'
// Password field with a show/hide toggle.
// showToggle={false} hides the toggle: used for the "new password" field, whose confirm field keeps it
export default function PasswordInput({ className = '', showToggle = true, ...rest }) {
  // Whether the password is visible as plain text
  const [shown, setShown] = useState(false)

  return (
    <div className={`password-field${showToggle ? '' : ' password-field--no-toggle'}`}>
      <input
        {...rest}
        type={showToggle && shown ? 'text' : 'password'}
        className={`password-field__input ${className}`.trim()}
      />
      {showToggle && (
        <button
          type="button"
          className="password-field__toggle"
          tabIndex={-1}
          onClick={() => setShown(s => !s)}
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
        >
          {shown ? <Icon name="eye-off" /> : <Icon name="eye" />}
        </button>
      )}
    </div>
  )
}
