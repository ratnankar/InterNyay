// Accounts that are signed in on this browser at the same time, so the user can switch between them without signing in again.
// The account in use is still kept in 'internyay_token' / 'internyay_user' (the API layer reads those); this list only remembers the others.
// Administrators are never kept here: the admin console has its own sign-in page.

const LIST_KEY  = 'internyay_accounts'
const TOKEN_KEY = 'internyay_token'
const USER_KEY  = 'internyay_user'

// Stable id for an account: the user id, or the email if the id is missing
function idOf(user) {
  return String(user?.id ?? String(user?.email || '').toLowerCase())
}

function isAdminUser(user) {
  return String(user?.role || '').toUpperCase() === 'ADMIN'
}

// Saved accounts, oldest first: [{ id, token, user }]
export function getAccounts() {
  try {
    const list = JSON.parse(localStorage.getItem(LIST_KEY) || '[]')
    return Array.isArray(list) ? list.filter(a => a && a.id && a.token) : []
  } catch {
    return []
  }
}

function saveAccounts(list) {
  try { localStorage.setItem(LIST_KEY, JSON.stringify(list)) } catch { /* storage unavailable */ }
}

// Adds a signed-in account to the list, or refreshes it if it is already there
export function rememberAccount(token, user) {
  if (!token || !user || isAdminUser(user)) return
  const id = idOf(user)
  if (!id) return

  const list = getAccounts().filter(a => a.id !== id)
  list.push({ id, token, user })
  saveAccounts(list)
}

// Keeps the saved copy of the account in use up to date (name, photo, plan...) so the switcher shows current details
export function syncActiveAccount(user) {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token || !user || isAdminUser(user)) return
  rememberAccount(token, user)
}

// Removes the account that owns this token (signed out, or the session ran out)
export function forgetAccountByToken(token) {
  if (!token) return
  saveAccounts(getAccounts().filter(a => a.token !== token))
}

// The server renewed a login token (sliding session): swap it in for the one in use and for its saved copy
export function replaceToken(oldToken, newToken) {
  if (!oldToken || !newToken || oldToken === newToken) return
  try {
    if (localStorage.getItem(TOKEN_KEY) === oldToken) localStorage.setItem(TOKEN_KEY, newToken)
  } catch { /* storage unavailable */ }
  saveAccounts(getAccounts().map(a => (a.token === oldToken ? { ...a, token: newToken } : a)))
}

// Makes a saved account the one in use; returns false if it is not in the list
export function activateAccount(id) {
  const account = getAccounts().find(a => a.id === id)
  if (!account) return false

  try {
    localStorage.setItem(TOKEN_KEY, account.token)
    localStorage.setItem(USER_KEY, JSON.stringify(account.user || {}))
  } catch {
    return false
  }
  return true
}

// Same id the list uses, so screens can tell which saved account is the current one
export const accountIdOf = idOf
