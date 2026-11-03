const FOLLOW_UPS = {
  "Today's hearings": 'Give me a short rundown of my hearings today',
  "Tomorrow's hearings": 'Give me a short rundown of my hearings tomorrow',
  'Overdue tasks': 'Which tasks are overdue?',
}

function formatDate(value) {
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ChatBrief({ brief, onAsk }) {
  const sections = Array.isArray(brief?.sections) ? brief.sections : []

  return (
    <div className="chat__brief">
      <p className="chat__brief-title">Daily brief</p>
      <p className="chat__brief-date">{formatDate(brief?.date)}</p>
      {sections.length === 0 && (
        <p className="chat__text">Nothing needs your attention today: no hearings today or tomorrow, no overdue tasks.</p>
      )}
      {sections.map(section => (
        <div key={section.title} className={`chat__brief-section chat__brief-section--${section.tone || 'normal'}`}>
          <p className="chat__brief-heading">{section.title}</p>
          <ul className="chat__brief-list">
            {section.items.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
          {section.more > 0 && <p className="chat__brief-more">and {section.more} more</p>}
          {onAsk && FOLLOW_UPS[section.title] && (
            <button type="button" className="chat__brief-ask" onClick={() => onAsk(FOLLOW_UPS[section.title])}>
              Ask about this
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
