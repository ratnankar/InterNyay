// Rules for a new password, checked on the screens that set one so the user sees the problem before sending the form.
// Keep in step with PasswordPolicy.java in the backend, which is the one that decides.

const PASSWORD_MIN = 8
const PASSWORD_MAX = 64
export const PASSWORD_HINT = `${PASSWORD_MIN}+ characters, with a letter and a number`

const COMMON = new Set([
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd', 'p@ssword1',
  '12345678', '123456789', '1234567890', '12345678a', 'qwerty123', 'qwertyuiop', 'qwerty12',
  'abc12345', 'abcd1234', 'abcdefg1', 'iloveyou1', 'iloveyou123', 'welcome1', 'welcome123',
  'admin123', 'admin1234', 'letmein123', 'monkey123', 'dragon123', 'football1', 'baseball1',
  'india123', 'india@123', 'internyay', 'internyay1', 'internyay123', 'advocate1', 'advocate123',
  'lawyer123', 'court123', 'test1234', 'changeme1', 'changeme123', 'sunshine1', 'princess1',
])

// Returns the first problem as a message, or '' when the password is fine. email is optional
export function passwordProblem(password, email = '') {
  const pw = String(password || '')
  if (!pw) return 'Password is required'
  if (pw.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`
  if (pw.length > PASSWORD_MAX || new TextEncoder().encode(pw).length > 72) {
    return `Password must be at most ${PASSWORD_MAX} characters`
  }
  if (!pw.trim()) return 'Password cannot be only spaces'
  if (!/\p{L}/u.test(pw) || !/\p{Nd}/u.test(pw)) return 'Password must include at least one letter and one number'

  const lower = pw.toLowerCase()
  if (COMMON.has(lower)) return 'That password is too common, choose a harder one'

  const mail = String(email || '').trim().toLowerCase()
  if (mail) {
    const local = mail.includes('@') ? mail.slice(0, mail.indexOf('@')) : mail
    if (lower === mail || (local.length >= 5 && lower.includes(local))) {
      return 'Password must not contain your email address'
    }
  }
  return ''
}
