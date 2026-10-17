import ArchiveTree from '../common/ArchiveTree'
import Icon from '../common/Icon'
import SeeMoreList from '../common/SeeMoreList'
import { dateKey, formatDayLabel } from '../../utils/archiveUtils'
import { formatTimestamp } from '../../utils/dateUtils'

const notificationDate = n => n.date

export default function NotificationArchive({ items, loading, onEdit, onRemove }) {
  if (items.length === 0) {
    return (
      <div className="admin__table-wrap">
        <p className="admin__empty">{loading ? 'Loading…' : 'No notifications pushed yet'}</p>
      </div>
    )
  }

  return (
    <ArchiveTree
  stateKey="admin_notifs"
      items={items}
      getDate={notificationDate}
      renderItems={monthItems => (
        <SeeMoreList items={monthItems} step={25}>
        {shown => (
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead>
              <tr><th>Date</th><th>Published</th><th>Source</th><th>Title</th><th>PDF</th><th /></tr>
            </thead>
            <tbody>
              {shown.map(n => (
                <tr key={n.id}>
                  <td>{dateKey(n.date) ? formatDayLabel(dateKey(n.date)) : '—'}</td>
                  <td>{n.createdAt ? formatTimestamp(n.createdAt) : '—'}</td>
                  <td>{n.source}</td>
                  <td>
                    {n.important && <span className="notif-tag notif-tag--important notif-tag--inline">Important</span>}
                    {n.title}
                  </td>
                  <td>{n.hasPdf ? <Icon name="pdf" /> : '—'}</td>
                  <td className="admin__actions">
                    <button type="button" className="btn-outline btn-outline--sm" onClick={() => onEdit(n)}>Edit</button>
                    <button type="button"
                      className="btn-outline btn-outline--sm btn-outline--danger"
                      onClick={() => onRemove(n.id, n.title)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
        </SeeMoreList>
      )}
    />
  )
}
