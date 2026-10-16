import { useEffect } from 'react'
import useOverlayClose from '../../hooks/useOverlayClose'
import { formatDisplayDate, formatTimestamp } from '../../utils/dateUtils'

import Icon from './Icon'
import ModalPortal from './ModalPortal'
import Linkify from './Linkify'

// Window showing one notification in full: source, notice date, published time, message and its PDF
export default function NotificationDetailModal({ notification, onClose, onViewPdf }) {
  const overlayHandlers = useOverlayClose(onClose)
  const n = notification

  // Escape closes the window
  useEffect(() => {
    if (!n) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [n, onClose])

  if (!n) return null

  const published = formatTimestamp(n.createdAt)

  return (
    <ModalPortal>
      <div className="overlay" {...overlayHandlers}>
        <div className="modal notif-detail" role="dialog" aria-modal="true" aria-labelledby="notif-detail-title" onClick={e => e.stopPropagation()}>
          <div className="modal__header">
            <h2 className="modal__title" id="notif-detail-title">{n.title}</h2>
            <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={onClose}><Icon name="close" /></button>
          </div>

          <div className="notif-detail__meta">
            <span className="notif-row__source">{n.source}</span>
            {n.important && <span className="notif-tag notif-tag--important">Important</span>}
            {n.date && <span className="notif-row__date">Notice date: {formatDisplayDate(n.date)}</span>}
            {published && <span className="notif-row__date">Published: {published}</span>}
          </div>

          {n.message
            ? <p className="notif-detail__message"><Linkify text={n.message} /></p>
            : <p className="notif-detail__message notif-detail__message--empty">No additional message.</p>}

          {n.hasPdf && (
            <button type="button" className="btn-gold notif-detail__pdf" onClick={e => onViewPdf(e, n)}>
              <Icon name="pdf" /> View attached PDF
            </button>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}
