import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import api from '../services/api'
import Dropdown from '../components/common/Dropdown'
import Icon from '../components/common/Icon'
import SeeMoreList from '../components/common/SeeMoreList'
import AttachmentPicker from '../components/common/AttachmentPicker'
import ContactAttachments from '../components/common/ContactAttachments'
import { starLabel } from '../components/common/Req'
import {
  CONTACT_CATEGORIES,
  CONTACT_MESSAGE_MAX,
  CONTACT_MESSAGE_MIN,
  CONTACT_STATUS_LABELS,
  CONTACT_SUBJECT_MAX,
  formatContactDate,
} from '../constants/contact'
import { getErrorMessage } from '../utils/errorMessages'
import useSessionState from '../hooks/useSessionState'

// Contact Us page: send a message to support and read earlier messages and replies
export default function ContactUs() {
  const { addToast } = useApp()

  // "Give Feedback" in the sidebar opens this page as /contact?topic=feedback
  const location = useLocation()
  const feedbackMode = new URLSearchParams(location.search).get('topic') === 'feedback'

  // Message form values and their validation errors
  const [form, setForm] = useState({
    category: feedbackMode ? 'Feedback' : CONTACT_CATEGORIES[0],
    subject:  '',
    message:  '',
  })
  // Photos, videos or PDFs chosen to go with the message
  const [files, setFiles]     = useState([])
  // Validation errors per field and whether a message is being sent
  const [errors, setErrors]   = useState({})
  const [sending, setSending] = useState(false)

  // Previously sent messages with their loading and error state, and the id of the open thread
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError]     = useState('')
  const [openId, setOpenId]   = useSessionState('contact_open', null)

  // Choosing Give Feedback while already on this page selects the Feedback topic too
  useEffect(() => {
    if (feedbackMode) setForm(f => (f.category === 'Feedback' ? f : { ...f, category: 'Feedback' }))
  }, [feedbackMode, location.key])

  // Update one form field and clear that field's error
  const set = (key, value) => {
    setForm(f => ({ ...f, [key]: value }))
    if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }))
  }

  // Load the user's earlier messages and replies
  const loadHistory = useCallback(async () => {
    setHistoryError('')
    try {
      setHistory(await api.contact.mine())
    } catch (e) {
      setHistoryError(getErrorMessage(e, 'Could not load your messages'))
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  // Load the message history once on mount
  useEffect(() => { loadHistory() }, [loadHistory])

  // Open or close a message thread; opening one with an unread reply marks it as seen
  function toggle(m) {
    const opening = openId !== m.id
    setOpenId(opening ? m.id : null)
    if (opening && m.unreadReply) {
      setHistory(h => h.map(x => (x.id === m.id ? { ...x, unreadReply: false } : x)))
      api.contact.markSeen(m.id).catch(() => {})
    }
  }

  // Check the subject and the message length; returns the errors found
  function validate() {
    const found = {}
    const len = form.message.trim().length
    if (len < CONTACT_MESSAGE_MIN) {
      found.message = `Write at least ${CONTACT_MESSAGE_MIN} characters`
    } else if (len > CONTACT_MESSAGE_MAX) {
      found.message = `Keep it under ${CONTACT_MESSAGE_MAX} characters`
    }
    return found
  }

  // Validate the form, send the message and refresh the history
  async function handleSubmit(e) {
    e.preventDefault()
    if (sending) return

    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) {
      addToast('Fix the highlighted fields before sending', 'error')
      return
    }

    setSending(true)
    try {
      const data = {
        category: form.category,
        subject:  form.subject.trim() || form.category,
        message:  form.message.trim(),
      }
      if (files.length > 0) await api.contact.sendWithFiles(data, files)
      else await api.contact.send(data)
      addToast('Message sent — we will reply here or by email')
      setForm(f => ({ ...f, subject: '', message: '' }))
      setFiles([])
      setErrors({})
      loadHistory()
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not send your message'), 'error')
    } finally {
      setSending(false)
    }
  }

  // Characters left in the message
  const remaining = CONTACT_MESSAGE_MAX - form.message.length

  return (
    <div>
      {/* Page title */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{feedbackMode ? 'Give Feedback' : 'Contact Us'}</h1>
        </div>
      </div>

      {/* Left: send-message form. Right: message history */}
      <div className="contact-layout">
        {/* Send message form */}
        <form className="card contact-card" onSubmit={handleSubmit} noValidate>
          <h3 className="section-title">{feedbackMode ? 'Tell us what to improve' : 'Send a message'}</h3>

          <div className="form-group">
            {/* Topic dropdown */}
            <label className="form-label">{starLabel('Topic')}</label>
            <Dropdown
              className="form-input"
              value={form.category}
              onChange={e => set('category', e.target.value)}
            >
              {CONTACT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Dropdown>
          </div>

          <div className="form-group">
            {/* Subject input */}
            <label className="form-label">Subject</label>
            <input
              className={`form-input${errors.subject ? ' form-input--error' : ''}`}
              value={form.subject}
              maxLength={CONTACT_SUBJECT_MAX}
              placeholder="A short summary (optional)"
              onChange={e => set('subject', e.target.value)}
            />
            {errors.subject && <p className="contact-error">{errors.subject}</p>}
          </div>

          <div className="form-group">
            {/* Message box with character counter */}
            <label className="form-label">{starLabel('Message')}</label>
            <textarea
              className={`form-input contact-textarea${errors.message ? ' form-input--error' : ''}`}
              rows={7}
              value={form.message}
              maxLength={CONTACT_MESSAGE_MAX}
              placeholder="Tell us what you need. For a problem, include what you were doing and what you saw."
              onChange={e => set('message', e.target.value)}
            />
            <div className="contact-meta">
              {errors.message
                ? <span className="contact-error">{errors.message}</span>
                : <span />}
              <span className="contact-counter">{remaining} characters left</span>
            </div>
          </div>

          {/* Optional photos, videos or a PDF */}
          <div className="form-group">
            <label className="form-label">Attachments</label>
            <AttachmentPicker
              files={files}
              onChange={setFiles}
              onProblem={msg => addToast(msg, 'error')}
              disabled={sending}
            />
          </div>

          {/* Submit button */}
          <div className="form-actions">
            <button type="submit" className="btn-gold" disabled={sending}>
              {sending ? 'Sending…' : 'Send message'}
            </button>
          </div>
        </form>

        {/* Message history panel */}
        <aside className="card contact-card">
          <h3 className="section-title">Your messages</h3>

          {/* Loading, error with retry, empty, and list states for the history */}
          {historyLoading && <p className="contact-muted">Loading…</p>}

          {!historyLoading && historyError && (
            <div className="qa-error-state">
              <span><Icon name="warning" /> {historyError}</span>
              <button className="qa-retry-btn" type="button" onClick={loadHistory}>Retry</button>
            </div>
          )}

          {!historyLoading && !historyError && history.length === 0 && (
            <p className="contact-muted">Messages you send will be listed here, along with any replies posted to your account.</p>
          )}

          {/* List of messages; clicking one opens its thread */}
          {!historyLoading && !historyError && history.length > 0 && (
            <SeeMoreList items={history} step={10}>
            {shownHistory => (
            <ul className="contact-history__list">
              {shownHistory.map(m => {
                // Whether this message is open and its replies
                const open = openId === m.id
                const replies = m.replies || []
                return (
                  <li key={m.id} className="contact-history__item">
                    {/* Message summary: subject, new-reply badge, status, category, date and reply count */}
                    <button
                      type="button"
                      className="contact-history__head"
                      onClick={() => toggle(m)}
                      aria-expanded={open}
                    >
                      <span className="contact-history__top">
                        <span className="contact-history__subject">{m.subject}</span>
                        <span className="contact-history__badges">
                          {m.unreadReply && <span className="contact-status contact-status--reply">New reply</span>}
                          <span className={`contact-status contact-status--${String(m.status).toLowerCase()}`}>
                            {CONTACT_STATUS_LABELS[m.status] || m.status}
                          </span>
                        </span>
                      </span>
                      <span className="contact-history__meta">
                        {m.category} · {formatContactDate(m.createdAt)}
                        {replies.length > 0 && ` · ${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}`}
                      </span>
                    </button>

                    {/* Conversation thread: the user's message followed by replies from support */}
                    {open && (
                      <div className="contact-thread">
                        <div className="contact-bubble contact-bubble--me">
                          <div className="contact-bubble__who">You · {formatContactDate(m.createdAt)}</div>
                          <div className="contact-bubble__text">{m.message}</div>
                          <ContactAttachments attachments={m.attachments} loadBlob={api.contact.attachmentBlob} />
                        </div>
                        {replies.length === 0 && (
                          <p className="contact-muted">No reply here yet. We may also answer by email.</p>
                        )}
                        {replies.map(r => (
                          <div key={r.id} className="contact-bubble contact-bubble--team">
                            <div className="contact-bubble__who">
                              {r.adminName || 'InterNyay Support'} · {formatContactDate(r.createdAt)}
                            </div>
                            <div className="contact-bubble__text">{r.body}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
            )}
            </SeeMoreList>
          )}
        </aside>
      </div>
    </div>
  )
}