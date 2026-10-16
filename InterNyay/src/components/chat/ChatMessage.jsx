import { Fragment } from 'react'

// Patterns for lines that start a bullet or a numbered list item
const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/

// Turns **bold** markers in the assistant's text into <strong> tags
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <Fragment key={i}>{part}</Fragment>
  )
}

// Splits the reply into paragraphs and bullet / numbered lists so it can be rendered nicely
function blocks(text) {
  const out = []
  let list = null

  // Push the list being built (if any) into the output
  const flush = () => {
    if (list) out.push(list)
    list = null
  }

  String(text || '').split('\n').forEach(raw => {
    const line = raw.trimEnd()

    // A blank line ends the current list
    if (!line.trim()) {
      flush()
      return
    }

    const bullet = line.match(BULLET)
    const numbered = line.match(NUMBERED)

    // Start a new list when the type changes (bullets v. numbers), otherwise keep adding items
    if (bullet || numbered) {
      const ordered = !!numbered && !bullet
      if (!list || list.ordered !== ordered) {
        flush()
        list = { type: 'list', ordered, items: [] }
      }
      list.items.push((bullet || numbered)[1])
      return
    }

    flush()
    out.push({ type: 'p', text: line.trim() })
  })

  flush()
  return out
}

// Small round icon shown beside a message: a person for the user, a scales icon for the assistant
function Avatar({ role }) {
  const isUser = role === 'user'
  return (
    <span className={`chat__avatar chat__avatar--${isUser ? 'user' : 'bot'}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {isUser ? (
          <>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
          </>
        ) : (
          <>
            <path d="M12 3v18M7 21h10M5 7h14" />
            <path d="M5 7l-3 6a3 3 0 0 0 6 0L5 7ZM19 7l-3 6a3 3 0 0 0 6 0l-3-6Z" />
          </>
        )}
      </svg>
    </span>
  )
}

// One chat bubble: plain text for the user, formatted text for the assistant
export default function ChatMessage({ role, content, error, action, onAction }) {
  const className = [
    'chat__msg',
    role === 'user' ? 'chat__msg--user' : 'chat__msg--bot',
    error ? 'chat__msg--error' : '',
  ].filter(Boolean).join(' ')

  // User messages are shown as plain text
  if (role === 'user') {
    return (
      <div className="chat__row chat__row--user">
        <Avatar role="user" />
        <div className={className}><p className="chat__text">{content}</p></div>
      </div>
    )
  }

  return (
    <div className="chat__row chat__row--bot">
    <Avatar role="bot" />
    <div className={className}>
      {blocks(content).map((b, i) => {
        if (b.type === 'p') return <p key={i} className="chat__text">{inline(b.text)}</p>
        const Tag = b.ordered ? 'ol' : 'ul'
        return (
          <Tag key={i} className="chat__list">
            {b.items.map((item, j) => <li key={j}>{inline(item)}</li>)}
          </Tag>
        )
      })}
      {/* Support replies get a button that opens the Contact Us page */}
      {action === 'contact' && onAction && (
        <button type="button" className="btn-gold chat__action" onClick={onAction}>
          Open Contact Us
        </button>
      )}
    </div>
    </div>
  )
}
