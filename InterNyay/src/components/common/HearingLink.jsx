import CopyButton from './CopyButton'

export function hearingHref(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return text
  return `https://${text.replace(/^\/+/, '')}`
}

export default function HearingLink({ href, empty = '—' }) {
  const url = hearingHref(href)

  if (!url) return <span className="qa-muted">{empty}</span>

  return (
    <span className="qa-hearing">
      <a className="qa-link" href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>Join hearing</a>
      <CopyButton text={url} label="Copy link" title="Copy virtual hearing link" />
    </span>
  )
}
