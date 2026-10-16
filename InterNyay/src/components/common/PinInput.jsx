import { useRef, useState } from 'react'
import Icon from './Icon'

// How many digits a PIN has
const PIN_LENGTH = 4

// Four boxes for a 4-digit PIN. Digits only, hidden by default, jumps to the next box as you type,
// Backspace goes back a box, and pasting a PIN fills all four boxes
export default function PinInput({
  value = '',
  onChange,
  onComplete,
  onEnter,
  masked = true,
  showToggle = true,
  disabled = false,
  autoFocus = false,
  label = 'PIN',
  className = '',
}) {
  // One ref per box so focus can move between them
  const boxes = useRef([])
  // Latest PIN length, so a focus move made right after typing sees the new length (state is still the old value then)
  const lengthRef = useRef(value.length)
  lengthRef.current = value.length
  // Whether the digits are visible (seen) or hidden as dots (unseen)
  const [shown, setShown] = useState(!masked)

  // The digit shown in each box
  const digits = Array.from({ length: PIN_LENGTH }, (_, i) => value[i] || '')

  // Move focus to a box (kept inside the four boxes)
  function focusBox(i) {
    boxes.current[Math.max(0, Math.min(PIN_LENGTH - 1, i))]?.focus()
  }

  // The first box of the next PIN field in the same form (null when this is the last PIN field)
  function nextGroupBox(from) {
    const scope = from.closest('.card, .modal, form') || document
    const all = [...scope.querySelectorAll('.pin-input__box:not(:disabled)')]
    return all.find(b => !from.closest('.pin-input').contains(b) && (from.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)) || null
  }

  // Move on to the next PIN field in the same form
  function focusNextGroup(from) {
    nextGroupBox(from)?.focus()
  }

  // Send the new value up, and tell the parent when all four digits are in
  function update(next) {
    lengthRef.current = next.length
    onChange(next)
    if (next.length !== PIN_LENGTH) return
    if (onComplete) return onComplete(next)

    // Last digit typed with nothing to submit yet: jump straight to the next PIN field if it is still empty,
    // so the cursor moves on the first time instead of staying on the last box
    const last = boxes.current[PIN_LENGTH - 1]
    const nextBox = last && nextGroupBox(last)
    if (nextBox) {
      const group = nextBox.closest('.pin-input')
      const empty = ![...group.querySelectorAll('.pin-input__box')].some(b => b.value)
      if (empty) nextBox.focus()
    }
  }

  // A digit was typed (or a whole PIN was pasted or auto-filled) into box i
  function handleChange(i, e) {
    const typed = e.target.value.replace(/\D/g, '')

    // Box was cleared: drop that digit
    if (!typed) {
      update(value.slice(0, i) + value.slice(i + 1))
      return
    }

    // One digit replaces the digit in this box, several digits fill from this box onwards
    const next = typed.length === 1
      ? (value.slice(0, i) + typed + value.slice(i + 1)).slice(0, PIN_LENGTH)
      : (value.slice(0, i) + typed).slice(0, PIN_LENGTH)

    update(next)
    // When the PIN just completed, update() has already moved on (or submitted), so only move inside this field otherwise
    if (next.length < PIN_LENGTH) focusBox(typed.length === 1 ? i + 1 : next.length)
  }

  // Backspace on an empty box deletes the digit before it, arrows move between boxes, Enter submits
  function handleKeyDown(i, e) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault()
      update(value.slice(0, i - 1) + value.slice(i))
      focusBox(i - 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      focusBox(i - 1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      focusBox(i + 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (value.length !== PIN_LENGTH) return
      if (onEnter) onEnter()
      else if (onComplete) onComplete(value)
      else focusNextGroup(e.currentTarget)
    }
  }

  // Pasting a PIN fills the boxes from the start
  function handlePaste(e) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, PIN_LENGTH)
    if (!pasted) return
    e.preventDefault()
    update(pasted)
    if (pasted.length < PIN_LENGTH) focusBox(pasted.length)
  }

  return (
    <div className={`pin-input ${className}`.trim()} role="group" aria-label={label} onPaste={handlePaste}>
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={el => { boxes.current[i] = el }}
          className={`pin-input__box${digit ? ' pin-input__box--filled' : ''}`}
          type={shown ? 'text' : 'password'}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          maxLength={PIN_LENGTH}
          aria-label={`${label}, digit ${i + 1} of ${PIN_LENGTH}`}
          value={digit}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKeyDown(i, e)}
          onFocus={e => {
            // Boxes fill left to right, so a click on a later empty box lands on the first empty one
            if (i > lengthRef.current) focusBox(lengthRef.current)
            else e.target.select()
          }}
        />
      ))}

      {/* Show / hide the digits */}
      {showToggle && (
        <button
          type="button"
          className="pin-input__toggle"
          tabIndex={-1}
          disabled={disabled}
          onMouseDown={e => e.preventDefault()}
          onClick={() => setShown(v => !v)}
          aria-label={shown ? 'Hide PIN' : 'Show PIN'}
          aria-pressed={shown}
        >
          {shown ? <Icon name="eye-off" /> : <Icon name="eye" />}
        </button>
      )}
    </div>
  )
}
