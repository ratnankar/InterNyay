import CopyButton from './CopyButton'

// Join link for a virtual hearing, with a copy button
export default function HearingLink({ href, empty = '—' }) {
  // No virtual hearing link for this entry
  if (!href) return <span className="qa-muted">{empty}</span>

  return (
    <span className="qa-hearing">
      <a className="qa-link" href={href} target="_blank" rel="noopener noreferrer">Join hearing</a>
      <CopyButton text={href} label="Copy link" title="Copy virtual hearing link" />
    </span>
  )
}
