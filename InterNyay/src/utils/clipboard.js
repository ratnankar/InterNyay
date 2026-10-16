// Copies text to the clipboard and returns true if it worked
export async function copyText(text) {
  const value = String(text ?? '')
  if (!value) return false

  try {
    // Modern API, only available on https or localhost
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
  }

  try {
    // Fallback for older browsers / http: copy through a temporary hidden textarea
    const area = document.createElement('textarea')
    area.value = value
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}
