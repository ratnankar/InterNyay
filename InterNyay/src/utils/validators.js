// 10-digit mobile number starting with 6-9, optionally prefixed with +91 or 0
const INDIAN_PHONE_PATTERN = /^(\+91[\s-]?|0)?[6-9]\d{9}$/

// True for an empty value (optional field) or a valid Indian mobile number
export function isValidIndianPhone(value) {
  if (!value) return true
  const compact = String(value).replace(/[\s-]/g, '')
  return INDIAN_PHONE_PATTERN.test(compact)
}

// Error text for the phone field, or null if it is fine
export function indianPhoneError(value, { required = false, label = 'phone number' } = {}) {
  const compact = String(value ?? '').trim()
  if (!compact) return required ? `Enter a ${label}` : null
  return isValidIndianPhone(compact)
    ? null
    : `Enter a valid 10-digit Indian mobile number (optionally with +91)`
}

// Basic email shape check: something@something.tld
const EMAIL_PATTERN = /^[^\s@.][^\s@]*@[^\s@.][^\s@]*\.[^\s@]{2,}$/

// True for an empty value (optional field) or a valid-looking email
function isValidEmail(value) {
  if (!value) return true
  return EMAIL_PATTERN.test(String(value).trim())
}

// Error text for the email field, or null if it is fine
export function emailError(value, { required = false } = {}) {
  const compact = String(value ?? '').trim()
  if (!compact) return required ? 'Enter an email address' : null
  return isValidEmail(compact) ? null : 'Enter a valid email address'
}
