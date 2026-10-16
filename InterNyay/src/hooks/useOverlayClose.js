import { useCallback, useRef } from 'react'

// Closes a modal (unless backdrop is false) only when the user both presses and releases on the dark backdrop, so dragging a text selection out of the modal doesn't close it
export default function useOverlayClose(onClose, { backdrop = true } = {}) {
  // True if the mouse went down directly on the overlay (not on the modal body)
  const pressedOnOverlay = useRef(false)

  // Remember where the press started
  const onMouseDown = useCallback((e) => {
    pressedOnOverlay.current = e.target === e.currentTarget
  }, [])

  // Close only if the press started and ended on the overlay itself
  const onClick = useCallback((e) => {
    const shouldClose = pressedOnOverlay.current && e.target === e.currentTarget
    pressedOnOverlay.current = false
    if (shouldClose) onClose(e)
  }, [onClose])

  // Forms pass backdrop: false, so a click outside the window never closes it or wipes what was typed
  if (!backdrop) return {}

  return { onMouseDown, onClick }
}
