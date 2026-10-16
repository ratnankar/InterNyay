// Turns errors into messages written for the people using the app.
// Users never see status codes, stack traces or server wording; the raw details go to the browser console for developers.

export const MESSAGES = {
  network:     "We can't reach the server. Check your internet connection and try again.",
  timeout:     'This is taking longer than expected. Please try again.',
  generic:     'Something went wrong. Please try again.',
  server:      'Something went wrong on our end. Please try again in a moment.',
  unavailable: 'This service is temporarily unavailable. Please try again in a few minutes.',
  badRequest:  'Please check the details you entered and try again.',
  session:     'Your session has expired. Please sign in again.',
  forbidden:   "You don't have permission to do that.",
  notFound:    "We couldn't find what you were looking for.",
  conflict:    'This clashes with something that already exists. Please review and try again.',
  tooLarge:    'That file is too large. Please choose a smaller file (up to 50 MB).',
  tooMany:     'Too many attempts. Please wait a moment and try again.',
}

// Server messages that are already friendly but can be warmer or clearer
const REWRITES = [
  [/^invalid email or password\.?$/i,           "That email or password isn't right. Please check and try again."],
  [/^email already in use\.?$/i,                'An account with this email already exists. Try signing in instead.'],
  [/^this account has been deactivated\.?$/i,   'This account has been deactivated. Please contact support if you think this is a mistake.'],
  [/^current password is incorrect\.?$/i,       "Your current password isn't correct. Please try again."],
  [/^incorrect password\.?$/i,                  "That password isn't correct. Please try again."],
  [/^incorrect code\.?$/i,                      "That code isn't correct. Check it and try again."],
  [/^invalid advocate code\.?$/i,               "We couldn't find that advocate code. Check it and try again."],
  [/^account not found\.?$/i,                   "We couldn't find an account with that email."],
  [/^file is empty\.?$/i,                       'That file is empty. Please choose a different file.'],
  [/^passwords do not match\.?$/i,              "The passwords don't match. Please enter them again."],
  [/^you do not have permission to do that\.?$/i, MESSAGES.forbidden],
]

// Default wording the backend uses when it has nothing specific to say: treat as "no message"
const EMPTY_MESSAGES = /^(not found|bad request|something went wrong|unauthorized|forbidden|internal server error|error)\.?$/i

// Signs that a message was written for developers, not users
const TECHNICAL = /\bHTTP \d{3}\b|\b(undefined|null|NaN)\b|exception|stack ?trace|SyntaxError|TypeError|ReferenceError|RangeError|Unexpected (token|end)|\bJSON\b|\bat [\w$.]+\(|\.java\b|\.jsx?\b|mongo|\bsql\b|jdbc|\[object |ECONN|CORS|status code|\bnull ?pointer|Failed to fetch|NetworkError|Load failed/i

// "fullName" -> "Full name"
function humanizeField(field) {
  const last = field.split('.').pop()
  const words = last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// Cleans a message from the server; returns '' when it is not fit to show
function cleanServerMessage(raw) {
  if (typeof raw !== 'string') return ''
  let text = raw.trim()

  if (!text || text.length > 240 || EMPTY_MESSAGES.test(text) || TECHNICAL.test(text)) return ''

  // Validation messages arrive as "fieldName: must not be blank": make the field name readable
  text = text.replace(/(^|,\s)([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)*):\s/g,
    (_, pre, field) => `${pre}${humanizeField(field)}: `)

  for (const [pattern, friendly] of REWRITES) {
    if (pattern.test(text)) return friendly
  }
  return text
}

// Error thrown by the API layer; its message is always safe to show to the user
export class ApiError extends Error {
  constructor(message, { status = 0, technical = '' } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.technical = technical
  }
}

// Builds a user-friendly ApiError from a failed response (status + whatever message the server sent)
export function makeApiError(status, serverMessage = '', { signedIn = true } = {}) {
  const clean = cleanServerMessage(serverMessage)
  let message

  if (status >= 500) {
    message = status === 503 ? MESSAGES.unavailable : MESSAGES.server
  } else if (status === 401) {
    // Wrong credentials on the login form come with their own message; otherwise the session ran out
    message = clean || (signedIn ? MESSAGES.session : MESSAGES.generic)
  } else if (status === 403) {
    // Plan-limit messages ("…your plan…") are meant for users
    message = clean || MESSAGES.forbidden
  } else if (status === 404) {
    message = clean || MESSAGES.notFound
  } else if (status === 409) {
    message = clean || MESSAGES.conflict
  } else if (status === 413) {
    message = MESSAGES.tooLarge
  } else if (status === 408 || status === 504) {
    message = MESSAGES.timeout
  } else if (status === 429) {
    message = MESSAGES.tooMany
  } else if (status === 400 || status === 422) {
    message = clean || MESSAGES.badRequest
  } else {
    message = clean || MESSAGES.generic
  }

  // Keep the real details for developers
  console.error(`[API ${status}]`, serverMessage || '(no message)')
  return new ApiError(message, { status, technical: String(serverMessage || '') })
}

// Error for when the request never reached the server (offline, server down, blocked)
export function makeNetworkError(cause) {
  console.error('[API network error]', cause)
  return new ApiError(MESSAGES.network, { status: 0, technical: String(cause?.message || cause || '') })
}

// The one function the screens use: always returns text that is safe to show to the user
export function getErrorMessage(err, fallback = MESSAGES.generic) {
  if (err instanceof ApiError) return err.message

  if (err?.name === 'AbortError') return MESSAGES.timeout

  const raw = typeof err === 'string' ? err : err?.message || ''

  // A failed network request that slipped past the API layer (a plain code TypeError is NOT a network problem)
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    console.error('[network error]', err)
    return MESSAGES.network
  }

  // Short, readable messages written by the app itself (e.g. "Please choose an image file") pass through
  if (raw && raw.length <= 160 && !TECHNICAL.test(raw)) return raw

  if (raw) console.error('[error]', err)
  return fallback
}
