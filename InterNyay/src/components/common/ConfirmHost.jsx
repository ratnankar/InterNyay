// Renders the dialogs requested through confirmDialog() (see utils/confirmDialog.js). Mounted once at the app root
import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import useOverlayClose from '../../hooks/useOverlayClose'
import { registerConfirmHost } from '../../utils/confirmDialog'
import ModalPortal from './ModalPortal'

export default function ConfirmHost() {
  // The request on screen: { opts, resolve }, or null
  const [current, setCurrent] = useState(null)
  // Same request in a ref so the registered function always sees the latest value, plus requests waiting their turn
  const currentRef = useRef(null)
  const queueRef = useRef([])
  const dialogRef = useRef(null)
  const cancelRef = useRef(null)
  const confirmRef = useRef(null)
  // Element that had focus before the dialog opened, so focus goes back to it afterwards
  const returnFocusRef = useRef(null)

  // Puts a request on screen
  const show = useCallback(item => {
    currentRef.current = item
    returnFocusRef.current = document.activeElement
    setCurrent(item)
  }, [])

  // Registered with confirmDialog(): shows the request now or queues it behind the one on screen
  useEffect(() => registerConfirmHost(opts => new Promise(resolve => {
    const item = { opts, resolve }
    if (currentRef.current) queueRef.current.push(item)
    else show(item)
  })), [show])

  // Answers the request on screen, then shows the next waiting one
  const settle = useCallback(value => {
    const item = currentRef.current
    if (!item) return
    item.resolve(value)
    const next = queueRef.current.shift() || null
    currentRef.current = next
    setCurrent(next)
    if (!next) {
      const back = returnFocusRef.current
      returnFocusRef.current = null
      if (back && typeof back.focus === 'function' && document.contains(back)) back.focus()
    }
  }, [])

  // While a dialog is open: focus a button, Escape cancels, Tab stays inside the dialog
  useEffect(() => {
    if (!current) return undefined
    // Destructive actions start on Cancel so a stray Enter does not delete anything
    ;(current.opts.danger ? cancelRef : confirmRef).current?.focus()

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        settle(false)
        return
      }
      if (e.key !== 'Tab') return
      const items = [...(dialogRef.current?.querySelectorAll('button:not(:disabled)') || [])]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      else if (!dialogRef.current.contains(document.activeElement)) { e.preventDefault(); first.focus() }
    }
    // Capture phase so Escape closes only this dialog and not the form window underneath it
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [current, settle])

  // Clicking the dark backdrop counts as Cancel
  const overlay = useOverlayClose(() => settle(false))

  if (!current) return null
  const { title, message, confirmLabel, cancelLabel, danger } = current.opts

  return (
    <ModalPortal>
      <div className="overlay overlay--stacked confirm-overlay" {...overlay}>
        <div
          ref={dialogRef}
          className="modal modal--sm confirm-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-message"
        >
          <div className="confirm-dialog__head">
            <span className={`confirm-dialog__icon${danger ? ' confirm-dialog__icon--danger' : ''}`} aria-hidden="true">
              <Icon name={danger ? 'trash' : 'warning'} />
            </span>
            <h2 className="modal__title confirm-dialog__title" id="confirm-title">{title}</h2>
          </div>
          <p className="confirm-dialog__message" id="confirm-message">{message}</p>
          <div className="form-actions confirm-dialog__actions">
            <button type="button" ref={cancelRef} className="btn-outline" onClick={() => settle(false)}>{cancelLabel}</button>
            <button type="button" ref={confirmRef} className={danger ? 'btn-danger' : 'btn-gold'} onClick={() => settle(true)}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
