import { useEffect, useMemo, useRef, useState } from 'react'
import Req from '../common/Req'

// How many matches are listed under a search box
const LIST_LIMIT = 6

// Picks one item of a list by searching it; shows the chosen one with a Change button
export default function SearchPick({ label, placeholder, items, selectedId, onSelect, onClear, renderMain, renderMeta, matches, extra, emptyText }) {
  const [query, setQuery] = useState('')
  // Suggestions are shown only after the search box is clicked, and hidden again after a pick or a click outside
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  useEffect(() => {
    if (!open) return
    const away = e => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  const selected = items.find(i => Number(i.id) === Number(selectedId))
  const q = query.trim().toLowerCase()

  const shown = useMemo(() => {
    const pool = q ? items.filter(i => matches(i, q)) : items
    return pool.slice(0, LIST_LIMIT)
  }, [items, q, matches])

  return (
    <div className="misc-pick" ref={box}>
      <label className="form-label">{label}<Req /></label>

      {selected ? (
        <div className="misc-pick__chosen">
          <div className="misc-pick__info">
            <p className="misc-pick__name">{renderMain(selected)}</p>
            <p className="misc-pick__meta">{renderMeta(selected)}</p>
          </div>
          <button type="button" className="btn-outline" onClick={() => { setQuery(''); setOpen(false); onClear() }}>Change</button>
        </div>
      ) : (
        <>
          <div className="client-search-row">
            <input
              className="form-input"
              placeholder={placeholder}
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(true) }}
              onClick={() => setOpen(true)}
              onFocus={() => setOpen(true)}
              autoComplete="off"
            />
            {extra}
          </div>

          {open && shown.length > 0 && (
            <div className="client-result-list">
              {shown.map(item => (
                <div key={item.id} className="client-result" onClick={() => { setOpen(false); onSelect(item) }}>
                  <div className="client-result__info">
                    <p className="client-result__name">{renderMain(item)}</p>
                    <p className="client-result__meta">{renderMeta(item)}</p>
                  </div>
                  <button type="button" className="btn-gold client-result__select"
                    onClick={e => { e.stopPropagation(); setOpen(false); onSelect(item) }}>
                    Select
                  </button>
                </div>
              ))}
            </div>
          )}

          {open && shown.length === 0 && (
            <div className="client-not-found">
              <p className="client-not-found__text">{q ? 'Nothing matches your search.' : emptyText}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
