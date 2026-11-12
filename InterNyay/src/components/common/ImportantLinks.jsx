import Icon from './Icon'
import useQuickLinks from '../../hooks/useQuickLinks'

const hostOf = url => {
  try { return new URL(url).hostname } catch { return '' }
}

export default function ImportantLinks() {
  const { directory, loading, error, reload } = useQuickLinks()
  const groups = directory?.groups || []

  if (loading && !directory) {
    return (
      <div className="qa-skeleton-wrap">
        {[1, 2, 3].map(i => <div key={i} className="qa-skeleton-row" />)}
      </div>
    )
  }

  if (error && !directory) {
    return (
      <div className="qa-error-state">
        <span><Icon name="warning" /> {error}</span>
        <button type="button" className="qa-retry-btn" onClick={reload}>Retry</button>
      </div>
    )
  }

  if (groups.length === 0) {
    return <p className="qa-links__empty">No links have been added yet.</p>
  }

  return (
    <div className="qa-links">
      {groups.map(group => (
        <section key={group.id} className="qa-links__group">
          <h3 className="qa-links__heading">{group.title}</h3>
          <div className="qa-links__grid">
            {group.links.map(link => (
              <a
                key={link.id}
                className="qa-links__item"
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${link.label} (opens in a new tab)`}
              >
                <span className="qa-links__icon"><Icon name={link.icon} duotone /></span>
                <span className="qa-links__text">
                  <span className="qa-links__label">{link.label}</span>
                  {link.description && <span className="qa-links__desc">{link.description}</span>}
                  <span className="qa-links__host">{hostOf(link.url)}</span>
                </span>
                <span className="qa-links__open"><Icon name="arrow-right" /></span>
              </a>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
