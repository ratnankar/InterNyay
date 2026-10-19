import { useState } from 'react'
import { MISC_APP_NAME } from '../../constants/data'
import { groupMiscDocuments } from '../../utils/documentUtils'
import FitLabel from '../common/FitLabel'
import Icon from '../common/Icon'

// The documents of a case's misc. applications, apart from the case's own documents and grouped by application.
// `renderRow` draws one document the way the page it sits in draws its other documents.
// Collapsed until opened. `open` and `onToggle` let the page control it; without them it keeps its own state.
// `flush` lines its rows up with the page's other document rows (the Documents page).
// `nested` is for when it sits inside another card (the case's Documents on the Cases page)
export default function MiscDocsSection({ docs, renderRow, open: openProp, onToggle, nested = false, flush = false }) {
  const [ownOpen, setOwnOpen] = useState(false)
  const controlled = onToggle !== undefined
  const open = controlled ? !!openProp : ownOpen
  const toggle = controlled ? onToggle : () => setOwnOpen(v => !v)
  const groups = groupMiscDocuments(docs)
  const count = groups.reduce((n, g) => n + g.docs.length, 0)

  if (count === 0) return null

  return (
    <div className={`exp-card exp-card--misc-docs${nested ? ' exp-card--nested u-mt-8' : ''}${flush ? ' exp-card--flush' : ''}${open ? ' exp-card--open' : ''}`}>
      <button type="button" className="exp-card__head" aria-expanded={open} onClick={toggle}>
        <div className="exp-card__avatar"><Icon name="folders" /></div>
        <div className="exp-card__titles">
          <p className="exp-card__primary"><FitLabel full={`${MISC_APP_NAME.full} Documents`} short={`${MISC_APP_NAME.short} Documents`} /></p>
          <p className="exp-card__secondary">
            {groups.length} application{groups.length !== 1 ? 's' : ''} • {count} file{count !== 1 ? 's' : ''}
          </p>
        </div>
        <span className="exp-card__arrow">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="exp-card__body">
          {groups.map(g => (
            <div key={g.id} className="misc-docs-group">
              <div className="misc-docs-group__head">
                <p className="misc-docs-group__name">{g.name}</p>
              </div>
              {g.docs.map(d => renderRow(d))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
