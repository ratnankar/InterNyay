import { Fragment } from 'react'

// http(s):// and www. addresses inside plain text
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi
// Punctuation that ends a sentence, not the address
const TRAILING = /[.,;:!?)\]}]+$/

// Shows plain text with every web address turned into a link that opens in a new tab.
// Clicks and key presses on a link do not reach the card around it, so the notification does not open as well
export default function Linkify({ text }) {
  const value = String(text ?? '')
  const parts = []
  let last = 0

  for (const match of value.matchAll(URL_PATTERN)) {
    let url = match[0]
    const trail = url.match(TRAILING)
    if (trail) url = url.slice(0, -trail[0].length)
    if (!url) continue

    if (match.index > last) parts.push(value.slice(last, match.index))
    const href = /^www\./i.test(url) ? `https://${url}` : url
    parts.push(
      <a
        key={match.index}
        className="qa-link notif-link"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        {url}
      </a>
    )
    last = match.index + url.length
  }

  if (last < value.length) parts.push(value.slice(last))
  return parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)
}
