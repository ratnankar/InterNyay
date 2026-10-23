import { useMemo, useState } from 'react'
import Icon from '../common/Icon'
import SearchInput from '../common/SearchInput'
import { nameSearchMatches } from '../../utils/judgeMatch'

// Name with spaces collapsed and lower case
const norm = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase()

// Small photo, or a placeholder icon when there is none
export function Thumb({ src, name }) {
  if (src) return <img className="change-judge__thumb" src={src} alt={name} />
  return <span className="change-judge__thumb" aria-hidden="true"><Icon name="scale" /></span>
}

// Search box and list to pick one judge from the Judges list. Each judge shows the courts they hold now,
// or "Not holding a court". excludeIds leaves some judges out of the list.
// Judges are suggested only after Search is clicked (or Enter is pressed): `applied` holds the searched text, null before that
export default function JudgeProfilePicker({ judges, value, onChange, excludeIds = [] }) {
  const [query, setQuery] = useState('')
  const [applied, setApplied] = useState(null)

  const shown = useMemo(() => {
    if (applied === null) return []
    const q = norm(applied)
    // Newest first: a judge added a moment ago (highest id) is at the top of the list
    return judges
      .filter(j => !excludeIds.includes(j.id))
      .filter(j => !q || norm(j.name).includes(q) || nameSearchMatches(applied, j.name))
      .sort((a, b) => Number(b.id) - Number(a.id))
  }, [judges, applied, excludeIds])

  return (
    <>
      <div className="change-judge__search">
        <SearchInput
          placeholder="Type the judge's name…"
          value={query}
          onChange={setQuery}
          wrapperClassName="change-judge__search-box"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setApplied(query) } }}
        />
        <button type="button" className="btn-gold" onClick={() => setApplied(query)}>Search</button>
      </div>
      <div className="change-judge__list">
        {applied === null && <p className="admin__hint">Type a name and click Search to see the judges.</p>}
        {applied !== null && shown.length === 0 && <p className="admin__hint">No judge found. Add the judge in the Judges section first, or add a new judge here.</p>}
        {shown.map(j => (
          <button
            type="button"
            key={j.id}
            className={`change-judge__option${value?.id === j.id ? ' change-judge__option--on' : ''}`}
            onClick={() => onChange(j)}
          >
            <Thumb src={j.photo} name={j.name} />
            <span className="change-judge__who">
              <strong>{j.name}</strong>
              {j.courtCount === 0
                ? <span className="qa-tag qa-tag--released">Not holding a court</span>
                : j.courts.map(c => <span key={c} className="change-judge__sub">{c}</span>)}
            </span>
          </button>
        ))}
      </div>
    </>
  )
}
