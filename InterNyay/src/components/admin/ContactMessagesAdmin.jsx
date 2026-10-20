import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import useOverlayClose from '../../hooks/useOverlayClose'
import {
  CONTACT_MESSAGE_MAX,
  CONTACT_STATUS_LABELS,
  REPLY_CHANNELS,
  REPLY_CHANNEL_TAGS,
  formatContactDate,
} from '../../constants/contact'
import { getErrorMessage } from '../../utils/errorMessages'
import useSeeMore from '../../hooks/useSeeMore'
import SeeMore from '../common/SeeMore'
import { confirmDialog } from '../../utils/confirmDialog'
import ModalPortal from '../../components/common/ModalPortal'
import useSessionState from '../../hooks/useSessionState'
import SearchInput from '../common/SearchInput'

// Status filters for the message list
const FILTERS = [
  { value: 'ALL',      label: 'All' },
  { value: 'NEW',      label: 'New' },
  { value: 'READ',     label: 'Read' },
  { value: 'RESOLVED', label: 'Resolved' },
]

// Display name for a sender's role
const roleLabel = role => (role === 'ADVOCATE' ? 'Advocate' : role === 'ASSOCIATE' ? 'Associate' : role === 'VISITOR' ? 'Visitor' : role || '—')

// Where a reply was delivered, and a note if the email failed
function deliveryLabel(r) {
  const channel = r.channel || 'BOTH'
  const base = REPLY_CHANNEL_TAGS[channel] || channel
  return channel !== 'ACCOUNT' && r.emailed === false ? `${base} (email failed)` : base
}

// Toast text shown after a reply is sent, by delivery channel
const SENT_TOAST = {
  EMAIL:   'Reply emailed',
  ACCOUNT: 'Reply posted to their account',
  BOTH:    'Reply posted to their account and emailed',
}

// Admin inbox for contact messages from users and landing page visitors, with replies
export default function ContactMessagesAdmin({ onLoaded }) {
  const { addToast } = useApp()
  // Latest onLoaded callback, kept in a ref so a new function from the parent never re-triggers the load
  const onLoadedRef = useRef(onLoaded)
  onLoadedRef.current = onLoaded

  // Messages, loading flag, and which source tab is showing (account users or landing page)
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [source, setSource]   = useSessionState('admin_contact_source', 'ACCOUNT')
  // Status filter and search text
  const [filter, setFilter]   = useState('ALL')
  const [search, setSearch]   = useState('')
  // Message open in the dialog, the reply being written, its delivery channel and the sending flag
  const [openId, setOpenId]   = useSessionState('admin_contact_open', null)
  const [draft, setDraft]     = useState('')
  const [channel, setChannel] = useState('BOTH')
  const [sending, setSending] = useState(false)

  // Closes the message dialog and resets the reply box
  const closeDialog = () => { setOpenId(null); setDraft(''); setChannel('BOTH') }
  const overlayHandlers = useOverlayClose(closeDialog, { backdrop: false })

  // The message currently open in the dialog
  const open = useMemo(() => rows.find(r => r.id === openId) || null, [rows, openId])

  // Fetches all contact messages
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await api.admin.contactMessages.list()
      setRows(list)
      // Tell the Admin page which messages the admin has now been shown, so the Overview alert can clear
      if (Array.isArray(list)) onLoadedRef.current?.(list)
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not load messages'), 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  // Landing page messages come from visitors or have no account
  const isLanding = r => r.role === 'VISITOR' || r.accountId == null
  // Messages for the selected source tab
  const sourceRows = useMemo(
    () => rows.filter(r => (source === 'LANDING' ? isLanding(r) : !isLanding(r))),
    [rows, source]
  )
  // Count of new messages for each source, shown on the tabs
  const newBySource = useMemo(() => ({
    ACCOUNT: rows.filter(r => !isLanding(r) && r.status === 'NEW').length,
    LANDING: rows.filter(r => isLanding(r) && r.status === 'NEW').length,
  }), [rows])
  // Landing page messages cannot be resolved, so that filter is hidden for them
  const filters = source === 'LANDING' ? FILTERS.filter(f => f.value !== 'RESOLVED') : FILTERS

  // Counts for each status filter button
  const counts = useMemo(() => {
    const c = { ALL: sourceRows.length, NEW: 0, READ: 0, RESOLVED: 0 }
    sourceRows.forEach(r => { if (c[r.status] !== undefined) c[r.status] += 1 })
    return c
  }, [sourceRows])

  // Rows after the status filter and search
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sourceRows.filter(r => {
      if (filter !== 'ALL' && r.status !== filter) return false
      if (!q) return true
      return [r.name, r.email, r.subject, r.category, r.message]
        .some(v => String(v || '').toLowerCase().includes(q))
    })
  }, [sourceRows, filter, search])


  // Show the rows a page at a time; starts again when the search or filter changes
  const rowsStep = 25
  const {
    visible: visibleRows,
    remaining: rowsRemaining,
    showMore: showMoreRows, step: showMoreRowsStep,
  } = useSeeMore(visible, `${filter}|${search}`, rowsStep)
  // Swaps in an updated message from the server
  function replaceRow(updated) {
    setRows(rs => rs.map(r => (r.id === updated.id ? updated : r)))
  }

  // Changes a message's status (new, read or resolved)
  async function setStatus(row, status) {
    try {
      replaceRow(await api.admin.contactMessages.setStatus(row.id, status))
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not update the message'), 'error')
    }
  }

  // Opens a message and marks it as read if it was new
  function openMessage(row) {
    setOpenId(row.id)
    setDraft('')
    setChannel('BOTH')
    if (row.status === 'NEW') setStatus(row, 'READ')
  }

  // Sends the reply by email or to the user's account. Landing page visitors can only be emailed
  async function sendReply() {
    const text = draft.trim()
    if (!open || !text || sending) return
    setSending(true)
    try {
      const sendChannel = open.accountId == null ? 'EMAIL' : channel
      const updated = await api.admin.contactMessages.reply(open.id, text, sendChannel)
      replaceRow(updated)
      setDraft('')

      const replies = updated.replies || []
      const last = replies[replies.length - 1]
      if (last && last.channel !== 'ACCOUNT' && last.emailed === false) {
        addToast('Posted to their account, but the email could not be sent', 'error')
      } else {
        addToast(SENT_TOAST[sendChannel])
      }
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not send the reply'), 'error')
    } finally {
      setSending(false)
    }
  }

  // Deletes a message and its replies after confirmation
  async function remove(row) {
    if (!await confirmDialog(`Delete the message "${row.subject}" from ${row.name}, including its replies? This cannot be undone.`)) return
    try {
      await api.admin.contactMessages.remove(row.id)
      setRows(rs => rs.filter(r => r.id !== row.id))
      if (openId === row.id) closeDialog()
      addToast('Message deleted')
    } catch (e) {
      addToast(getErrorMessage(e, 'Delete failed'), 'error')
    }
  }

  return (
    <>
      {/* Tabs to switch between account messages and landing page queries (same look as the other admin sub tabs) */}
      <div className="contact-subbar">
      <div className="admin__subtabs">
        <button
          className={`admin__subtab${source === 'ACCOUNT' ? ' admin__subtab--active' : ''}`}
          onClick={() => { setSource('ACCOUNT'); setFilter('ALL') }}
        >
          Advocates &amp; associates{newBySource.ACCOUNT > 0 ? ` (${newBySource.ACCOUNT} new)` : ''}
        </button>
        <button
          className={`admin__subtab${source === 'LANDING' ? ' admin__subtab--active' : ''}`}
          onClick={() => { setSource('LANDING'); setFilter('ALL') }}
        >
          Landing page queries{newBySource.LANDING > 0 ? ` (${newBySource.LANDING} new)` : ''}
        </button>
      </div>
        {/* Reloads the messages from the server (new messages and replies from other devices) */}
        <button type="button" className="btn-outline btn-outline--sm contact-subbar__refresh"
          onClick={load} disabled={loading} aria-busy={loading}>
          <span className="admin__refresh-label">
            <span className={loading ? 'is-hidden' : ''} aria-hidden={loading}>Refresh</span>
            <span className={loading ? '' : 'is-hidden'} aria-hidden={!loading}>Refreshing…</span>
          </span>
        </button>
      </div>

      {/* Search box, status filters and message count */}
      <div className="admin__toolbar">
        <SearchInput placeholder="Search messages…" value={search} onChange={setSearch} />
        <div className="contact-filters">
          {filters.map(f => (
            <button
              key={f.value}
              className={`qa-filter-btn${filter === f.value ? ' active' : ''}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label} ({counts[f.value]})
            </button>
          ))}
        </div>
        <span className="admin__count">
          {loading ? 'Loading…' : `${visible.length} message${visible.length === 1 ? '' : 's'}`}
        </span>
      </div>

      <div className="admin__table-wrap">
        {/* Messages table */}
        <table className="admin__table">
          <thead>
            <tr>
              <th>Received</th><th>From</th><th>Topic</th><th>Subject</th><th>Status</th><th />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && !loading && (
              <tr><td colSpan={6} className="admin__empty">No messages</td></tr>
            )}
            {visibleRows.map(r => (
              <tr key={r.id} className={r.status === 'NEW' ? 'contact-row--new' : ''}>
                <td>{formatContactDate(r.createdAt)}</td>
                <td>
                  {r.name}
                  <span className="admin__pill admin__pill--inline">{roleLabel(r.role)}</span>
                  <div className="contact-history__meta">{r.email}</div>
                </td>
                <td>{r.category}</td>
                <td>
                  {r.subject}
                  {(r.replies || []).length > 0 && (
                    <span className="admin__pill admin__pill--gold admin__pill--inline">
                      {r.replies.length} repl{r.replies.length === 1 ? 'y' : 'ies'}
                    </span>
                  )}
                </td>
                <td>
                  <span className={`contact-status contact-status--${String(r.status).toLowerCase()}`}>
                    {CONTACT_STATUS_LABELS[r.status] || r.status}
                  </span>
                </td>
                <td className="admin__actions">
                  <button type="button" className="btn-outline btn-outline--sm" onClick={() => openMessage(r)}>
                    View / Reply
                  </button>
                  <button type="button"
                    className="btn-outline btn-outline--sm btn-outline--danger"
                    onClick={() => remove(r)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SeeMore remaining={rowsRemaining} onClick={showMoreRows} step={showMoreRowsStep} />

      {/* Message dialog with the conversation and reply form */}
      {open && (
        <ModalPortal>
          <div className="overlay" {...overlayHandlers}>
            <div className="modal modal--md" onClick={e => e.stopPropagation()}>
              <h3 className="section-title">{open.subject}</h3>

              <div className="contact-detail__meta">
                <div><strong>From:</strong> {open.name} ({roleLabel(open.role)}) · {open.email}</div>
                {open.phone && <div><strong>Phone:</strong> {open.phone}</div>}
                <div><strong>Topic:</strong> {open.category}</div>
              </div>

              <div className="contact-thread contact-thread--admin">
                <div className="contact-bubble contact-bubble--them">
                  <div className="contact-bubble__who">{open.name} · {formatContactDate(open.createdAt)}</div>
                  <div className="contact-bubble__text">{open.message}</div>
                </div>
                {(open.replies || []).map(r => (
                  <div key={r.id} className="contact-bubble contact-bubble--team">
                    <div className="contact-bubble__who">
                      {r.adminName} · {formatContactDate(r.createdAt)} · {deliveryLabel(r)}
                    </div>
                    <div className="contact-bubble__text">{r.body}</div>
                  </div>
                ))}
              </div>

              <div className="form-group contact-reply-box">
                <label className="form-label">Your reply</label>
                <textarea
                  className="form-input contact-textarea"
                  rows={4}
                  value={draft}
                  maxLength={CONTACT_MESSAGE_MAX}
                  placeholder={`Write your reply to ${open.name}…`}
                  onChange={e => setDraft(e.target.value)}
                />
              </div>

              {open.accountId == null ? (
                <p className="contact-muted contact-channel__hint">
                  This message came from the landing page, so your reply will be emailed to {open.email}.
                </p>
              ) : (
              <div className="form-group contact-reply-box">
                <label className="form-label" id="contact-channel-label">Send reply via</label>
                <div className="contact-channel" role="radiogroup" aria-labelledby="contact-channel-label">
                  {REPLY_CHANNELS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      role="radio"
                      aria-checked={channel === c.value}
                      className={`qa-filter-btn${channel === c.value ? ' active' : ''}`}
                      onClick={() => setChannel(c.value)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <p className="contact-muted contact-channel__hint">
                  {REPLY_CHANNELS.find(c => c.value === channel)?.hint}
                </p>
              </div>
              )}

              <div className="form-actions">
                <button type="button" className="btn-outline" onClick={closeDialog}>Close</button>
                {!isLanding(open) && (open.status !== 'RESOLVED'
                  ? <button type="button" className="btn-outline" onClick={() => setStatus(open, 'RESOLVED')}>Mark resolved</button>
                  : <button type="button" className="btn-outline" onClick={() => setStatus(open, 'READ')}>Reopen</button>)}
                <button type="button" className="btn-gold" onClick={sendReply} disabled={!draft.trim() || sending}>
                  {sending ? 'Sending…' : (open.accountId == null ? 'Email reply' : 'Send reply')}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  )
}
