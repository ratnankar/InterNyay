import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { NOTIFICATION_SOURCES } from '../constants/notifications'
import useNotifications from '../hooks/useNotifications'
import useNotificationPdf from '../hooks/useNotificationPdf'
import NotificationPdfModal from '../components/common/NotificationPdfModal'
import NotificationDetailModal from '../components/common/NotificationDetailModal'
import { formatTimestamp } from '../utils/dateUtils'
import { clickableProps } from '../utils/clickable'
import ArchiveTree from '../components/common/ArchiveTree'
import SeeMoreList from '../components/common/SeeMoreList'
import { dateKey, formatDayLabel } from '../utils/archiveUtils'

import Icon from '../components/common/Icon'
import Linkify from '../components/common/Linkify'

const notificationDate = n => n.date

// Notifications page: filter by source, search, and open notification PDFs
export default function NotificationsPage() {
  // Navigation, notification list with its source filter, PDF preview state and the search text
  const { setActiveNav } = useApp()
  const { source, setSource, items, loading, error, refetch } = useNotifications()
  const { preview, viewPdf, closePreview, pdfError, clearPdfError } = useNotificationPdf()
  const [search, setSearch] = useState('')
  // Notification opened in the detail window
  const [selected, setSelected] = useState(null)

  // Notifications that match the search text in title, source or message
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(n =>
      (n.title || '').toLowerCase().includes(q) ||
      (n.source || '').toLowerCase().includes(q) ||
      (n.message || '').toLowerCase().includes(q)
    )
  }, [items, search])

  // Show either the loading error or the PDF error
  const errorMessage = error || pdfError

  return (
    <div>
      {/* Back button, page title and the count of matching notifications */}
      <div className="page-header">
        <div>
          <button
            type="button"
            className="notif-page__back"
            onClick={() => setActiveNav('dashboard')}
          >
            <Icon name="arrow-left" /> Back to Dashboard
          </button>
          <h1 className="page-title">Notifications &amp; Circulations</h1>
          <p className="page-subtitle">
            {loading
              ? 'Loading…'
              : `${visible.length} notification${visible.length !== 1 ? 's' : ''}${
                  search.trim() || source !== 'All' ? ' match your filters' : ''
                }`}
          </p>
        </div>
      </div>

      {/* Filter buttons, one per notification source */}
      <div className="case-filters">
        {NOTIFICATION_SOURCES.map(s => (
          <button
            key={s}
            className={`case-filter-btn${source === s ? ' case-filter-btn--active' : ''}`}
            onClick={() => setSource(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Search box */}
      <div className="list-toolbar">
        <div className="doc-search-wrap">
          <span className="doc-search-icon"><Icon name="search" /></span>
          <input
            className="form-input doc-search-input"
            placeholder="Search notifications by title, source, or message…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {/* Button to clear the search text */}
          {search && (
            <button type="button" className="doc-search-clear" onClick={() => setSearch('')}><Icon name="close" /></button>
          )}
        </div>
      </div>

      {/* Loading skeleton, error with retry, empty state, or the notification list */}
      {loading ? (
        <div className="notifications-panel__loading">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="notif-skeleton-row" />)}
        </div>
      ) : errorMessage ? (
        <div className="notifications-panel__error">
          <span><Icon name="warning" /> {errorMessage}</span>
          <button type="button" className="btn-outline btn-outline--sm" onClick={() => { clearPdfError(); refetch() }}>Retry</button>
        </div>
      ) : visible.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__icon"><Icon name="bell" duotone /></div>
            <p className="empty-state__title">No notifications found</p>
            <p className="empty-state__desc">
              {items.length === 0
                ? 'Nothing has been published for this source yet.'
                : 'Try a different search or source.'}
            </p>
          </div>
        </div>
      ) : (
        <ArchiveTree
          items={visible}
          getDate={notificationDate}
          forceOpen={!!search.trim()}
          renderItems={monthItems => (
            <SeeMoreList items={monthItems} step={20}>
            {shown => (
            <div className="notif-page__list">
              {shown.map(n => (
                <div key={n.id} className="card notif-card notif-card--clickable" title="Open notification" {...clickableProps(() => setSelected(n))}>
                  <div className="notif-card__body">
                    <div className="notif-card__meta">
                      <span className="notif-row__source">{n.source}</span>
                      {dateKey(n.date) && <span className="notif-row__date">{formatDayLabel(dateKey(n.date))}</span>}
                      {n.important && <span className="notif-tag notif-tag--important">Important</span>}
                    </div>
                    <h3 className="notif-card__title">{n.title}</h3>
                    {n.createdAt && <span className="notif-row__time">Published {formatTimestamp(n.createdAt)}</span>}
                    {n.message && <p className="notif-card__message"><Linkify text={n.message} /></p>}
                  </div>

                  {n.hasPdf && (
                    <button type="button"
                      className="btn-outline btn-outline--sm notif-card__pdf"
                      onClick={e => viewPdf(e, n)}
                    >
                      <Icon name="pdf" /> View PDF
                    </button>
                  )}
                </div>
              ))}
            </div>
            )}
            </SeeMoreList>
          )}
        />
      )}

      {/* Popup that shows the selected notification PDF */}
      <NotificationDetailModal notification={selected} onClose={() => setSelected(null)} onViewPdf={viewPdf} />
      <NotificationPdfModal preview={preview} onClose={closePreview} />
    </div>
  )
}
