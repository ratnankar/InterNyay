import { Fragment } from 'react'

// Web addresses (http(s):// or www.) and e-mail addresses inside plain text
const LINK_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+|[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}\b/gi
// Same, plus bare addresses without http:// such as courts.delhi.gov.in/path (only for the common endings, so file names are left alone)
const BARE_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+|\b(?:[a-z0-9-]+\.)+(?:gov\.in|nic\.in|co\.in|ac\.in|org\.in|in|com|org|net|edu)(?:\/[^\s<>"']*)?(?![a-z0-9@-])|[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}\b/gi
// Punctuation that ends a sentence, not the address
const TRAILING = /[.,;:!?)\]}]+$/

// Shows plain text with every web address and e-mail address turned into a link (web addresses open in a new tab,
// e-mail addresses open the mail app). Clicks and key presses on a link do not reach the card or row around it,
// so a notification or list row does not open as well. Use it for any free text that people type or the server sends.
export default function Linkify({ text, className = 'qa-link notif-link', bare = false }) {
  const value = String(text ?? '')
  const parts = []
  let last = 0

  for (const match of value.matchAll(bare ? BARE_PATTERN : LINK_PATTERN)) {
    let found = match[0]
    const isMail = /^[^\s/]+@[^\s/]+$/.test(found)
    if (!isMail) {
      const trail = found.match(TRAILING)
      if (trail) found = found.slice(0, -trail[0].length)
    }
    if (!found) continue

    if (match.index > last) parts.push(value.slice(last, match.index))
    const href = isMail ? `mailto:${found}` : /^https?:\/\//i.test(found) ? found : `https://${found}`
    parts.push(
      <a
        key={match.index}
        className={className}
        href={href}
        {...(isMail ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        {found}
      </a>
    )
    last = match.index + found.length
  }

  if (last < value.length) parts.push(value.slice(last))
  return parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)
}
