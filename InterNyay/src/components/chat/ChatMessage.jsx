import { Fragment, useState } from 'react'
import ChatActionCard from './ChatActionCard'
import ChatBrief from './ChatBrief'
import Icon from '../common/Icon'
import Linkify from '../common/Linkify'

// Patterns for lines that start a bullet or a numbered list item
const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/

// Only web, mail and phone addresses are made clickable (never javascript: or data: addresses)
const SAFE_HREF = /^(?:https?:\/\/|mailto:|tel:)/i

// Pieces of the assistant's text with their own markup: [label](address) links and **bold**
const MARKUP = /(\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*)/g
const MD_LINK = /^\[([^\]]+)\]\(([^)\s]+)\)$/

// Plain text with every address turned into a link that opens in a new tab
const links = text => <Linkify text={text} className="chat__link" bare />

// Turns **bold**, [label](address) and plain addresses in the assistant's text into <strong> and links
function inline(text) {
  return text.split(MARKUP).map((part, i) => {
    const md = part.match(MD_LINK)
    if (md) {
      const href = /^www\./i.test(md[2]) ? `https://${md[2]}` : md[2]
      return SAFE_HREF.test(href)
        ? <a key={i} className="chat__link" href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">{md[1]}</a>
        : <Fragment key={i}>{md[1]}</Fragment>
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{links(part.slice(2, -2))}</strong>
    }
    return <Fragment key={i}>{links(part)}</Fragment>
  })
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

function ThumbIcon({ down }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={down ? 'chat__thumb-down' : undefined}>
      <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Zm0 0 4-8a2 2 0 0 1 2 2v4h5.5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.3 21H7" />
    </svg>
  )
}

function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
  return new Promise((resolve, reject) => {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.className = 'chat__copy-buffer'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(area)
      if (ok) resolve()
      else reject(new Error('copy failed'))
    } catch (e) {
      reject(e)
    }
  })
}

function Tools({ content, serverId, rating, onRate }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await copyText(String(content || '').replace(/\*\*/g, ''))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* copying is not available */ }
  }

  return (
    <div className="chat__tools">
      <button type="button" className={`chat__tool chat__tool--icon${copied ? ' chat__tool--on' : ''}`}
        onClick={copy} aria-label={copied ? 'Copied' : 'Copy the answer'} title={copied ? 'Copied' : 'Copy'}>
        <Icon name={copied ? 'check' : 'copy'} size={15} />
      </button>
      {serverId && onRate && (
        <>
          <button type="button" className={`chat__tool chat__tool--icon${rating === 1 ? ' chat__tool--on' : ''}`}
            onClick={() => onRate(1)} aria-pressed={rating === 1} aria-label="Good answer" title="Good answer">
            <ThumbIcon />
          </button>
          <button type="button" className={`chat__tool chat__tool--icon${rating === -1 ? ' chat__tool--on chat__tool--bad' : ''}`}
            onClick={() => onRate(-1)} aria-pressed={rating === -1} aria-label="Poor answer" title="Poor answer">
            <ThumbIcon down />
          </button>
        </>
      )}
    </div>
  )
}

export default function ChatMessage({
  role, content, error, action, onAction, streaming, status, card, brief, serverId, rating,
  onRate, onConfirm, onCancel, onAsk, onRetry,
}) {
  const className = [
    'chat__msg',
    role === 'user' ? 'chat__msg--user' : 'chat__msg--bot',
    error ? 'chat__msg--error' : '',
  ].filter(Boolean).join(' ')

  if (role === 'user') {
    return (
      <div className="chat__row chat__row--user">
        <Avatar role="user" />
        <div className={className}><p className="chat__text">{links(content)}</p></div>
      </div>
    )
  }

  const waiting = streaming && !content
  const finished = !streaming && !error && !brief && content

  return (
    <div className="chat__row chat__row--bot">
      <Avatar role="bot" />
      <div className="chat__col">
      <div className={className}>
        {brief && <ChatBrief brief={brief} onAsk={onAsk} />}
        {waiting && (
          <div className="chat__waiting" aria-live="polite">
            <span className="chat__typing-dots" aria-hidden="true"><span /><span /><span /></span>
            <span className="chat__status">{status || 'Thinking…'}</span>
          </div>
        )}
        {!waiting && blocks(content).map((b, i) => {
          if (b.type === 'p') return <p key={i} className="chat__text">{inline(b.text)}</p>
          const Tag = b.ordered ? 'ol' : 'ul'
          return (
            <Tag key={i} className="chat__list">
              {b.items.map((item, j) => <li key={j}>{inline(item)}</li>)}
            </Tag>
          )
        })}
        {streaming && content && status && <p className="chat__status chat__status--inline">{status}</p>}
        {card && <ChatActionCard card={card} onConfirm={onConfirm} onCancel={onCancel} />}
        {action === 'contact' && onAction && !streaming && (
          <button type="button" className="btn-gold chat__action" onClick={onAction}>
            Open Contact Us
          </button>
        )}
        {error && onRetry && (
          <button type="button" className="chat__retry" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
      {finished && <Tools content={content} serverId={serverId} rating={rating} onRate={onRate} />}
      </div>
    </div>
  )
}
