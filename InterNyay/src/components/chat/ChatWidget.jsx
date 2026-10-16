import { useEffect, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'
import useChat from '../../hooks/useChat'
import ChatMessage from './ChatMessage'

// Suggested questions shown to advocates
const ADVOCATE_PROMPTS = [
  'What hearings do I have tomorrow?',
  'Which clients have pending fees?',
  'Show my open criminal cases',
  'Are any tasks overdue?',
]

// Suggested questions shown to associates (they don't see fees)
const ASSOCIATE_PROMPTS = [
  'What hearings do I have tomorrow?',
  'Show open cases at Saket court',
  'Which judges are on leave today?',
  'Are any tasks overdue?',
]

// Floating chat assistant: a launcher button that opens a chat panel in the corner
export default function ChatWidget() {
  const { isAssociate, setActiveNav } = useApp()
  const { messages, loading, enabled, loadStatus, send, clear } = useChat()
  // Panel open/closed
  const [open, setOpen] = useState(false)
  // Text typed in the input box
  const [draft, setDraft] = useState('')
  // Empty element at the end of the messages, scrolled into view on new messages
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  // Pick the suggestions based on the user's role
  const prompts = isAssociate ? ASSOCIATE_PROMPTS : ADVOCATE_PROMPTS

  // Check whether the assistant is configured the first time the panel opens
  useEffect(() => {
    if (open && enabled === null) loadStatus()
  }, [open, enabled, loadStatus])

  // Focus the input when the panel opens
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Scroll to the latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading, open])

  // Escape closes the panel
  useEffect(() => {
    if (!open) return undefined
    // Escape closes the chat panel
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Send the typed text (or a clicked suggestion) and clear the input
  const submit = text => {
    const value = (text ?? draft).trim()
    if (!value || loading || enabled === false) return
    setDraft('')
    send(value)
  }

  // Enter sends the message, Shift+Enter adds a new line
  const onKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <>
      {/* Round launcher button when the panel is closed */}
      {!open && (
        <button
          type="button"
          className="chat__launcher"
          onClick={() => setOpen(true)}
          aria-label="Open InterNyay Assistant"
          title="Ask InterNyay Assistant"
        >
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
            <path d="M9 11h6M9 14h4" />
          </svg>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <section className="chat__panel" role="dialog" aria-label="InterNyay Assistant">
          {/* Title and the Clear / Minimize buttons */}
          <header className="chat__header">
            <div className="chat__title">
              <span className="chat__title-main">InterNyay Assistant</span>
              <span className="chat__title-sub">Ask about your cases, clients and hearings</span>
            </div>
            <div className="chat__header-actions">
              {messages.length > 0 && (
                <button type="button" className="chat__icon-btn" onClick={clear} title="Clear conversation">
                  Clear
                </button>
              )}
              <button type="button" className="chat__icon-btn" onClick={() => setOpen(false)} aria-label="Minimize assistant" title="Minimize">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block' }}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
          </header>

          {/* Messages area */}
          <div className="chat__body">
            {/* Welcome text with suggested questions, shown until the first message */}
            {messages.length === 0 && (
              <div className="chat__welcome">
                <p className="chat__welcome-title">How can I help?</p>
                <p className="chat__welcome-text">
                  I can look up any case, client, hearing, fee, document, task, judge or court detail in your practice.
                </p>
                <div className="chat__prompts">
                  {prompts.map(p => (
                    <button key={p} type="button" className="chat__prompt" onClick={() => submit(p)} disabled={enabled === false}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Conversation */}
            {messages.map(m => (
              <ChatMessage
                key={m.id}
                role={m.role}
                content={m.content}
                error={m.error}
                action={m.action}
                onAction={() => { setActiveNav('contact'); setOpen(false) }}
              />
            ))}

            {/* Typing indicator while waiting for the reply */}
            {loading && (
              <div className="chat__row chat__row--bot">
                <span className="chat__avatar chat__avatar--bot" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v18M7 21h10M5 7h14" />
                    <path d="M5 7l-3 6a3 3 0 0 0 6 0L5 7ZM19 7l-3 6a3 3 0 0 0 6 0l-3-6Z" />
                  </svg>
                </span>
                <div className="chat__msg chat__msg--bot chat__typing" aria-label="Assistant is typing">
                  <span /><span /><span />
                </div>
              </div>
            )}

            {/* Shown when the AI model isn't configured on the server */}
            {enabled === false && (
              <div className="chat__notice">
                The assistant is not set up on this server yet. Ask your administrator to configure the AI model.
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input box and send button */}
          <footer className="chat__footer">
            <textarea
              ref={inputRef}
              className="chat__input"
              rows={1}
              value={draft}
              placeholder="Ask anything about your practice"
              onChange={e => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={2000}
              disabled={enabled === false}
            />
            <button
              type="button"
              className="chat__send"
              onClick={() => submit()}
              disabled={loading || !draft.trim() || enabled === false}
              aria-label="Send"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 2 11 13" />
                <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
              </svg>
            </button>
          </footer>
        </section>
      )}
    </>
  )
}
