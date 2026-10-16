const store = new Map()

export const sessionStore = store

export function clearSessionState() {
  store.clear()
}
