import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { NOTIFICATION_SOURCES } from '../../constants/notifications'
import { formatShortDate, formatTimestamp } from '../../utils/dateUtils'
import { clickableProps } from '../../utils/clickable'
import useNotifications from '../../hooks/useNotifications'
import useNotificationPdf from '../../hooks/useNotificationPdf'
import NotificationPdfModal from './NotificationPdfModal'
import NotificationDetailModal from './NotificationDetailModal'
import Dropdown from './Dropdown'

import Icon from './Icon'
// Dashboard panel only shows the latest few; the full list is on the Notifications page
const PREVIEW_LIMIT = 5

// Short notifications panel with a source filter
export default function Notifications() {
  // Used to jump to the full Notifications page
  const { setActiveNav } = useApp()
  // Source filter, items and loading state come from the notifications hook
  const { source, setSource, items, loading, error, refetch } = useNotifications()
  // PDF preview state for opening a notification's attachment
  const { preview, viewPdf, closePreview, pdfError, clearPdfError } = useNotificationPdf()

  // Notification opened in the detail window
  const [selected, setSelected] = useState(null)

  // Only the first few items are rendered in this panel, in date order
  const shown = items.slice(0, PREVIEW_LIMIT)
  // A failed list fetch or a failed PDF open both show in the same error area
  const errorMessage = error || pdfError

  return (
    <div className="card notifications-panel">
      <div className="notifications-panel__header">
        <h2 className="section-title">Notifications &amp; Circulations</h2>
        <span className="notifications-panel__count">
          {items.length} update{items.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="notifications-panel__toolbar">
        <Dropdown
          className="form-input notifications-panel__filter"
          wrapperClassName="u-flex-1 u-minw-0"
          value={source}
          onChange={e => setSource(e.target.value)}
        >
          {NOTIFICATION_SOURCES.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Dropdown>

        <button
          type="button"
          className="notifications-panel__more"
          title={`Open all ${items.length} notification${items.length !== 1 ? 's' : ''}`}
          onClick={() => setActiveNav('notifications')}
        >
          See more <Icon name="arrow-right" />
        </button>
      </div>

      {loading ? (
        <div className="notifications-panel__loading">
          {[1, 2, 3].map(i => <div key={i} className="notif-skeleton-row" />)}
        </div>
      ) : errorMessage ? (
        <div className="notifications-panel__error">
          <span><Icon name="warning" /> {errorMessage}</span>
          <button type="button" className="btn-outline btn-outline--sm" onClick={() => { clearPdfError(); refetch() }}>Retry</button>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon"><Icon name="bell" duotone /></div>
          <p className="empty-state__desc">No notifications for this filter</p>
        </div>
      ) : (
        <div className="notif-list">
          {shown.map(n => (
            <div key={n.id} className="notif-row notif-row--clickable" title="Open notification" {...clickableProps(() => setSelected(n))}>
              <div className="notif-row__body">
                <div className="notif-row__meta">
                  <span className="notif-row__source">{n.source}</span>
                  {n.important && <span className="notif-tag notif-tag--important">Important</span>}
                </div>
                <p className="notif-row__title">{n.title}</p>
                <span className="notif-row__time">{n.createdAt ? formatTimestamp(n.createdAt) : formatShortDate(n.date)}</span>
              </div>
              {n.hasPdf && (
                <div className="notif-row__pdf-actions">
                  <button type="button"
                    className="notif-row__pdf-btn"
                    title="View PDF"
                    onClick={e => viewPdf(e, n)}
                  >
                    <Icon name="pdf" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <NotificationDetailModal notification={selected} onClose={() => setSelected(null)} onViewPdf={viewPdf} />
      <NotificationPdfModal preview={preview} onClose={closePreview} />
    </div>
  )
}
