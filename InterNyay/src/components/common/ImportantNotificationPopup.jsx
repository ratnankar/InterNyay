import { useEffect, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import { formatDisplayDate, formatTimestamp } from '../../utils/dateUtils'
import useImportantNotifications from '../../hooks/useImportantNotifications'
import useNotificationPdf from '../../hooks/useNotificationPdf'
import NotificationPdfModal from './NotificationPdfModal'

import Icon from './Icon'
import Linkify from './Linkify'
// Popup that shows important notifications one at a time
export default function ImportantNotificationPopup() {
  // Admins don't get this popup, only logged-in advocates and associates
  const { currentUser, isAdmin } = useApp()
  // current is the notification on screen; remaining is how many are still queued behind it
  const { current, remaining, dismiss } = useImportantNotifications(!!currentUser && !isAdmin)
  const { preview, viewPdf, closePreview } = useNotificationPdf()
  // Used to move keyboard focus to the close button when a popup opens
  const closeBtnRef = useRef(null)
  // Id of the visible notification; effects below depend on it so they re-run for each new one
  const currentId = current?.id

  // Focus the close button each time a new notification appears
  useEffect(() => {
    if (currentId != null) closeBtnRef.current?.focus()
  }, [currentId])

  // Escape dismisses the popup, but not while the PDF preview is open on top of it
  useEffect(() => {
    if (currentId == null || preview) return undefined
    // Escape dismisses the notification on screen
    const onKey = (e) => { if (e.key === 'Escape') dismiss(currentId) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [currentId, preview, dismiss])

  // Nothing to show when the queue is empty
  if (!current) return null

  return (
    <div
      className="imp-notif"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="imp-notif-title"
    >
      <div className="imp-notif__card">
        <div className="imp-notif__banner">
          <span className="imp-notif__badge"><Icon name="bell" /> Important notification</span>
          <button
            type="button"
            className="imp-notif__x"
            aria-label="Close"
            title="Close"
            onClick={() => dismiss(current.id)}
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="imp-notif__body">
          <div className="imp-notif__meta">
            <span className="notif-row__source">{current.source}</span>
            {current.date && (
              <span className="notif-row__date">{formatDisplayDate(current.date)}</span>
            )}
            {current.createdAt && (
              <span className="notif-row__time">Published {formatTimestamp(current.createdAt)}</span>
            )}
          </div>

          <h2 id="imp-notif-title" className="imp-notif__title">{current.title}</h2>

          {current.message && <p className="imp-notif__message"><Linkify text={current.message} /></p>}

          {current.hasPdf && (
            <button
              type="button"
              className="btn-outline imp-notif__pdf"
              onClick={e => viewPdf(e, current)}
            >
              <Icon name="pdf" /> View attached PDF
            </button>
          )}
        </div>

        <div className="imp-notif__footer">
          <span className="imp-notif__count">
            {remaining > 1 ? `${remaining} important notifications waiting` : ''}
          </span>
          <button
            type="button"
            ref={closeBtnRef}
            className="btn-gold imp-notif__close"
            onClick={() => dismiss(current.id)}
          >
            {remaining > 1 ? 'Close & next' : 'Close'}
          </button>
        </div>
      </div>

      <NotificationPdfModal preview={preview} onClose={closePreview} />
    </div>
  )
}
