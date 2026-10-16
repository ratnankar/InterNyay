import { useCallback, useRef } from 'react'

// Lets a dropdown field open on the first click and close on the next click, while keyboard focus (Tab) still opens it.
// The browser fires pointerdown, focus, then click, so the open state is read on pointerdown, before focus can change it.
export default function useFieldToggle(open, setOpen, disabled = false) {
  // Whether the list was already open when the press started
  const wasOpen = useRef(false)
  // True while a mouse/touch press is in progress, so its focus event does not reopen the list
  const pressed = useRef(false)

  const onPointerDown = useCallback(() => {
    wasOpen.current = open
    pressed.current = true
  }, [open])

  // Keyboard focus opens the list; focus caused by a press is handled by onClick instead
  const onFocus = useCallback(() => {
    if (!disabled && !pressed.current) setOpen(true)
  }, [disabled, setOpen])

  // A click opens a closed list and closes an open one
  const onClick = useCallback(() => {
    pressed.current = false
    if (disabled) return
    setOpen(!wasOpen.current)
  }, [disabled, setOpen])

  // A press that never produced a click (drag away) must not block the next keyboard focus
  const onBlur = useCallback(() => { pressed.current = false }, [])

  return { onPointerDown, onFocus, onClick, onBlur }
}
