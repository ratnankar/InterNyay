import { useEffect, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'
import useChat from '../../hooks/useChat'
import ChatMessage from './ChatMessage'
import useVoiceInput, { VOICE_LANGUAGES } from '../../hooks/useVoiceInput'
import { parseSpecializations } from '../../constants/specializations'
import { formatContactDate } from '../../constants/contact'
import { confirmDialog } from '../../utils/confirmDialog'

// Suggested questions shown to advocates. They stay general (no case type, court or client name);
// the third one is personalised from the advocate's profile by openCasesPrompt() below
const ADVOCATE_PROMPTS = [
  'What hearings do I have tomorrow?',
  'Which clients have pending fees?',
  'Show my open cases',
  'Are any tasks overdue?',
]

// Suggested questions shown to associates (they don't see fees)
const ASSOCIATE_PROMPTS = [
  'What hearings do I have tomorrow?',
  'Show my open cases',
  'Which judges are on leave today?',
  'Are any tasks overdue?',
]

// Case type to name in the "open cases" suggestion, keyed by the profile specialization. Anything not listed stays general.
const CASE_TYPE_BY_SPECIALIZATION = {
  'criminal law': 'criminal',
  'civil law': 'civil',
  'family & matrimonial': 'family',
  'property & real estate': 'property',
  'consumer protection': 'consumer',
  'motor accident claims': 'motor accident',
  'taxation': 'tax',
  'labour & employment': 'labour',
  'service matters': 'service',
}

// "Show my open criminal cases" only for an advocate whose profile has a single matching specialization;
// everyone else (several areas, no area, or one not listed above) gets the general "Show my open cases"
function openCasesPrompt(specialization) {
  const types = [...new Set(parseSpecializations(specialization).map(s => CASE_TYPE_BY_SPECIALIZATION[s.toLowerCase()]).filter(Boolean))]
  const all = parseSpecializations(specialization)
  return all.length === 1 && types.length === 1 ? `Show my open ${types[0]} cases` : 'Show my open cases'
}

// Floating chat assistant: a launcher button that opens a chat panel in the corner
export default function ChatWidget() {
  const { isAssociate, setActiveNav, currentUser } = useApp()
  const {
    messages, loading, historyLoading, historyError, enabled, conversations, activeId,
    loadStatus, loadHistory, send, newChat, openConversation, removeConversation, removeAllConversations,
  } = useChat()
  // Panel open/closed, and which screen it shows: the open chat or the list of saved chats
  const [open, setOpen] = useState(false)
  const [view, setView] = useState('chat')
  // Settings menu (voice language) open/closed, and the wrapper used to detect clicks outside it
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef(null)
  // Text typed in the input box
  const [draft, setDraft] = useState('')
  // Empty element at the end of the messages, scrolled into view on new messages
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  // The panel (for the Tab key trap) and the launcher (focus goes back to it when the panel closes)
  const panelRef = useRef(null)
  const launcherRef = useRef(null)
  const wasOpen = useRef(false)
  // Voice input: what is said fills the box (after whatever was already typed) so it can be checked before sending
  const draftBeforeVoice = useRef('')
  const voice = useVoiceInput(spoken => {
    const base = draftBeforeVoice.current
    setDraft(spoken ? `${base}${base && !/\s$/.test(base) ? ' ' : ''}${spoken}` : base)
  })

  // Pick the suggestions based on the user's role
  const prompts = isAssociate
    ? ASSOCIATE_PROMPTS
    : ADVOCATE_PROMPTS.map(p => p === 'Show my open cases' ? openCasesPrompt(currentUser?.specialization) : p)

  // Check whether the assistant is configured the first time the panel opens
  useEffect(() => {
    if (open && enabled === null) loadStatus()
  }, [open, enabled, loadStatus])

  // Bring back the saved conversation the first time the panel opens (once the assistant is known to be available)
  useEffect(() => {
    if (open && enabled === true) loadHistory()
  }, [open, enabled, loadHistory])

  // Focus the input when the panel opens or the chat screen comes back
  useEffect(() => {
    if (open && view === 'chat') inputRef.current?.focus()
  }, [open, view])

  // Scroll to the latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading, open, view])

  // Escape closes the panel
  useEffect(() => {
    if (!open) return undefined
    // Escape closes the settings menu if it is open, otherwise the chat panel
    const onKey = e => {
      if (e.key !== 'Escape') return
      if (settingsOpen) setSettingsOpen(false)
      else if (view === 'history') setView('chat')
      else setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, settingsOpen, view])

  // A click anywhere outside the settings menu closes it
  useEffect(() => {
    if (!settingsOpen) return undefined
    const onDown = e => { if (settingsRef.current && !settingsRef.current.contains(e.target)) setSettingsOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [settingsOpen])

  // When the panel closes, keyboard focus returns to the launcher button instead of being lost
  useEffect(() => {
    if (!open) { voice.cancel(); setSettingsOpen(false); setView('chat') }
    if (open) { wasOpen.current = true; return }
    if (wasOpen.current) { wasOpen.current = false; launcherRef.current?.focus() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Tab and Shift+Tab stay inside the open panel instead of moving to the page behind it
  const trapTab = e => {
    if (e.key !== 'Tab' || !panelRef.current) return
    const items = [...panelRef.current.querySelectorAll('button:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')]
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  // Mic button: remember what is already typed, then start or stop listening
  const toggleMic = () => {
    if (!voice.listening) draftBeforeVoice.current = draft
    voice.toggle()
    inputRef.current?.focus()
  }

  // Send the typed text (or a clicked suggestion) and clear the input
  const submit = text => {
    const value = (text ?? draft).trim()
    if (!value || loading || enabled === false) return
    voice.cancel()
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

  // Closes the open chat (it stays in the list) and starts a new one
  const startNewChat = () => {
    voice.cancel()
    setDraft('')
    newChat()
    setView('chat')
  }

  // Opens a saved chat from the list
  const openChat = async id => {
    voice.cancel()
    setDraft('')
    if (await openConversation(id)) setView('chat')
  }

  // Deletes one saved chat after confirmation
  const deleteChat = async chat => {
    if (!await confirmDialog(`Delete the chat "${chat.title}"? This cannot be undone.`)) return
    removeConversation(chat.id)
  }

  // Deletes every saved chat after confirmation
  const deleteAllChats = async () => {
    if (!await confirmDialog(`Delete all ${conversations.length} chats? This cannot be undone.`)) return
    removeAllConversations()
  }

  // Short voice status line under the messages
  const voiceStatus = voice.error || (voice.listening ? 'Listening… speak now' : '')

  return (
    <>
      {/* Round launcher button when the panel is closed */}
      {!open && (
        <button
          type="button"
          ref={launcherRef}
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
        <section ref={panelRef} className="chat__panel" role="dialog" aria-label="InterNyay Assistant" onKeyDown={trapTab}>
          {/* Title and the Clear / Minimize buttons */}
          <header className="chat__header">
            <div className="chat__title">
              <span className="chat__title-main">InterNyay Assistant</span>
              <span className="chat__title-sub">Ask about your cases, clients and hearings</span>
            </div>
            <div className="chat__header-actions">
              {/* Settings: the voice language lives here */}
              <div className="chat__settings-wrap" ref={settingsRef}>
                <button
                  type="button"
                  className={`chat__icon-btn${settingsOpen ? ' chat__icon-btn--active' : ''}`}
                  onClick={() => setSettingsOpen(o => !o)}
                  aria-label="Assistant settings"
                  aria-haspopup="true"
                  aria-expanded={settingsOpen}
                  title="Settings"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block' }}>
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>
                {settingsOpen && (
                  <div className="chat__settings" role="group" aria-label="Assistant settings">
                    <label className="chat__settings-field">
                      <span className="chat__settings-label">Speak in</span>
                      <select
                        value={voice.lang}
                        onChange={e => { voice.setLang(e.target.value); setSettingsOpen(false) }}
                        disabled={!voice.supported || enabled === false}
                        aria-label="Voice language"
                      >
                        {VOICE_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                      </select>
                    </label>
                    <p className="chat__settings-hint">
                      {voice.supported ? 'The language you speak in when you use the mic.' : 'Voice input needs Chrome, Edge or Safari on a secure (https) page.'}
                    </p>
                  </div>
                )}
              </div>
              {/* New chat: closes this chat (it stays saved) and starts a fresh one. Disabled only on an empty chat screen (nothing to close); from the chats list it always works and just returns to a fresh chat */}
              <button type="button" className="chat__icon-btn" onClick={startNewChat}
                disabled={view === 'chat' && messages.length === 0 && !loading} aria-label="Start a new chat" title="New chat">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block' }}>
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
              {/* Previous chats */}
              <button type="button" className={`chat__icon-btn${view === 'history' ? ' chat__icon-btn--active' : ''}`}
                onClick={() => setView(v => (v === 'history' ? 'chat' : 'history'))}
                aria-label="Previous chats" aria-pressed={view === 'history'} title="Previous chats">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block' }}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </button>
              <button type="button" className="chat__icon-btn" onClick={() => setOpen(false)} aria-label="Minimize assistant" title="Minimize">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block' }}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
          </header>

          {/* Previous chats: tap one to open it, the bin deletes it */}
          {view === 'history' && (
            <div className="chat__body chat__history">
              <div className="chat__history-top">
                <span className="chat__history-heading">Previous chats</span>
                <div className="chat__history-tools">
                  {conversations.length > 1 && (
                    <button type="button" className="chat__history-clear" onClick={deleteAllChats}>Delete all</button>
                  )}
                  <button type="button" className="chat__history-new" onClick={startNewChat}>+ New chat</button>
                </div>
              </div>
              {historyError && <div className="chat__notice" role="alert">{historyError}</div>}
              {historyLoading && <p className="chat__history-empty">Loading…</p>}
              {!historyLoading && conversations.length === 0 && (
                <p className="chat__history-empty">No saved chats yet. Your conversations will appear here.</p>
              )}
              <ul className="chat__history-list">
                {conversations.map(c => (
                  <li key={c.id} className={`chat__history-item${c.id === activeId ? ' chat__history-item--active' : ''}`}>
                    <button type="button" className="chat__history-open" onClick={() => openChat(c.id)}
                      aria-current={c.id === activeId ? 'true' : undefined}>
                      <span className="chat__history-title">{c.title}</span>
                      <span className="chat__history-when">{formatContactDate(c.updatedAt)}{c.id === activeId ? ' · open now' : ''}</span>
                    </button>
                    <button type="button" className="chat__history-delete" onClick={() => deleteChat(c)}
                      aria-label={`Delete chat ${c.title}`} title="Delete chat">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Messages area */}
          {view === 'chat' && (
          <div className="chat__body" role="log" aria-live="polite" aria-relevant="additions">
            {/* Welcome text with suggested questions, shown until the first message */}
            {messages.length === 0 && !historyLoading && (
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
          )}

          {view === 'chat' && (
          <>
          {/* Voice status (shown only while there is something to say; the language is in Settings) */}
          {voiceStatus && (
            <div className="chat__voicebar" aria-live="polite">
              <span className={`chat__voicebar-status${voice.error ? ' chat__voicebar-status--error' : ''}`}>{voiceStatus}</span>
            </div>
          )}

          {/* Input box and send button */}
          <footer className="chat__footer">
            <button
              type="button"
              className={`chat__mic${voice.listening ? ' chat__mic--on' : ''}`}
              onClick={toggleMic}
              disabled={!voice.supported || enabled === false}
              aria-pressed={voice.listening}
              aria-label={voice.listening ? 'Stop listening' : 'Speak your question'}
              title={voice.supported ? (voice.listening ? 'Stop listening' : 'Speak your question') : 'Voice input is not supported in this browser'}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </button>
            <textarea
              ref={inputRef}
              className="chat__input"
              rows={1}
              value={draft}
              placeholder={voice.listening ? 'Listening…' : 'Ask anything about your practice'}
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
          </>
          )}
        </section>
      )}
    </>
  )
}
