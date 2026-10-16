// Phones: while the on-screen keyboard is up (a typing field has focus) <html> gets the class "kb-open".
// The CSS uses it to hide the chat button and the bottom bar, which otherwise ride up above the keyboard and cover the page.
const TYPING = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]):not([type=range]):not([type=color]):not([readonly]), textarea:not([readonly]), [contenteditable=""], [contenteditable="true"]'

export function trackKeyboard() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const isTyping = el => !!el && el.matches?.(TYPING)
  let timer = 0
  const sync = () => {
    clearTimeout(timer)
    timer = setTimeout(() => root.classList.toggle('kb-open', isTyping(document.activeElement)), 60)
  }
  document.addEventListener('focusin', sync)
  document.addEventListener('focusout', sync)
}
