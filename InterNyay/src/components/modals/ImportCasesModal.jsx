import { useMemo, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'
import ModalPortal from '../common/ModalPortal'
import Icon from '../common/Icon'
import { formatDisplayDate } from '../../utils/dateUtils'
import {
  IMPORT_CATEGORIES,
  categoryLabel,
  cleanCnrText,
  parseMyCases,
} from '../../utils/myCasesImport'

// How many cases are drawn at first, and added each time "Show more" is pressed
const PAGE = 40

// Upload the "My Cases" file downloaded from eCourts, see the cases sorted into categories and add them one by one.
//  items    - cases of the uploaded file (null before a file is uploaded)
//  onLoaded - a file was read: its cases
//  onClear  - forget the uploaded list
//  onAdd    - the advocate wants to add this case: only its CNR is used, eCourts is asked for the rest
export default function ImportCasesModal({ items, onLoaded, onClear, onAdd, onClose }) {
  const { cases } = useApp()

  const fileRef = useRef(null)
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)

  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('pending')   // pending | decided | all
  const [onlyNew, setOnlyNew] = useState(true)      // hide the cases that are already saved
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE)

  // CNRs of the cases the advocate already has
  const saved = useMemo(
    () => new Set((cases || []).map(c => cleanCnrText(c.cnrNo)).filter(Boolean)),
    [cases]
  )

  // Reads the chosen file
  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setProblem('')
    setBusy(true)
    try {
      const list = parseMyCases(await file.text())
      onLoaded(list)
      setCategory('all')
      setShown(PAGE)
    } catch (err) {
      setProblem(err.message || 'Could not read this file')
    } finally {
      setBusy(false)
    }
  }

  // Cases after the status and "not yet added" choices; the category counts are taken from these
  const base = useMemo(() => {
    if (!items) return []
    return items.filter(i =>
      (status === 'all' || (status === 'pending') === i.pending) &&
      (!onlyNew || !saved.has(i.cnr))
    )
  }, [items, status, onlyNew, saved])

  // Number of cases in each category
  const counts = useMemo(() => {
    const out = {}
    for (const i of base) out[i.category] = (out[i.category] || 0) + 1
    return out
  }, [base])

  // The list on screen: the chosen category and the search
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return base
      .filter(i => category === 'all' || i.category === category)
      .filter(i => !q || [i.cnr, i.petitioner, i.respondent, i.caseNo, i.type, i.court].some(v => String(v).toLowerCase().includes(q)))
      // Cases with the nearest hearing first, then the ones with no hearing date
      .sort((a, b) => (a.nextDate || '9999').localeCompare(b.nextDate || '9999'))
  }, [base, category, query])

  const total = items?.length || 0
  const savedCount = items ? items.filter(i => saved.has(i.cnr)).length : 0

  return (
    <ModalPortal>
      <div className="overlay">
        <div className="modal modal--import" onClick={e => e.stopPropagation()}>

          <div className="modal__header">
            <h2 className="modal__title">Import from eCourts</h2>
            <button aria-label="Close" title="Close" type="button" className="btn-icon" onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>

          <input ref={fileRef} type="file" accept=".txt,.json,text/plain,application/json" hidden onChange={pick} />

          {!items && (
            <>
              <p className="form-label">Upload the My Cases file</p>
              <p className="case-parties__hint u-mb-12">
                Download your cases from the eCourts Services app or website (My Cases, then download) and upload the .txt file here.
                The cases are sorted into categories and you add them one by one. Only the CNR number is used: every case is
                read from eCourts again, as when you add a case by CNR.
              </p>
              <button type="button" className="btn-gold" onClick={() => fileRef.current?.click()} disabled={busy}>
                {busy ? 'Reading…' : 'Choose file'}
              </button>
              {problem && <p className="case-judge-hint case-judge-hint--none u-mt-10" role="alert">{problem}</p>}
            </>
          )}

          {items && (
            <>
              <div className="import-summary">
                <span><strong>{total}</strong> cases in the file</span>
                <span><strong>{savedCount}</strong> already added</span>
                <span><strong>{total - savedCount}</strong> not added yet</span>
                <span className="import-summary__actions">
                  <button type="button" className="btn-outline btn-outline--sm" onClick={() => fileRef.current?.click()}>Upload another file</button>
                  <button type="button" className="btn-outline btn-outline--sm" onClick={onClear}>Clear list</button>
                </span>
              </div>
              {problem && <p className="case-judge-hint case-judge-hint--none u-mb-6" role="alert">{problem}</p>}

              <div className="import-filters">
                {[['pending', 'Pending'], ['decided', 'Decided'], ['all', 'All']].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`case-filter-btn${status === value ? ' case-filter-btn--active' : ''}`}
                    onClick={() => { setStatus(value); setShown(PAGE) }}
                  >
                    {label}
                  </button>
                ))}
                <label className="import-filters__check">
                  <input type="checkbox" checked={onlyNew} onChange={e => { setOnlyNew(e.target.checked); setShown(PAGE) }} />
                  Hide cases already added
                </label>
              </div>

              <div className="import-filters">
                <button
                  type="button"
                  className={`case-filter-btn${category === 'all' ? ' case-filter-btn--active' : ''}`}
                  onClick={() => { setCategory('all'); setShown(PAGE) }}
                >
                  All ({base.length})
                </button>
                {IMPORT_CATEGORIES.filter(c => counts[c.key]).map(c => (
                  <button
                    key={c.key}
                    type="button"
                    className={`case-filter-btn${category === c.key ? ' case-filter-btn--active' : ''}`}
                    onClick={() => { setCategory(c.key); setShown(PAGE) }}
                  >
                    {c.label} ({counts[c.key]})
                  </button>
                ))}
              </div>

              <input
                className="form-input u-mb-12"
                placeholder="Search by party name, case number, CNR or court"
                value={query}
                onChange={e => { setQuery(e.target.value); setShown(PAGE) }}
              />

              {visible.length === 0 && <p className="case-parties__hint">No cases match these choices.</p>}

              <div className="client-selected-list">
                {visible.slice(0, shown).map(i => {
                  const have = saved.has(i.cnr)
                  return (
                    <div key={i.cnr} className="client-selected import-row">
                      <div className="client-selected__info">
                        <p className="client-selected__name">
                          {i.petitioner || '—'} <span className="import-row__vs">v.</span> {i.respondent || '—'}
                          <span className="client-selected__tag client-selected__tag--muted">{categoryLabel(i.category)}</span>
                          {!i.pending && <span className="client-selected__tag client-selected__tag--muted">{i.disposal || 'Decided'}</span>}
                        </p>
                        <p className="client-selected__email">
                          {[i.type && `${i.type}${i.caseNo ? ` ${i.caseNo}` : ''}`, i.court, i.room].filter(Boolean).join(' · ')}
                        </p>
                        <p className="client-selected__email">
                          CNR {i.cnr}
                          {i.pending && i.nextDate ? ` · Next hearing ${formatDisplayDate(i.nextDate)}` : ''}
                          {!i.pending && i.decisionDate ? ` · Decided ${formatDisplayDate(i.decisionDate)}` : ''}
                          {i.pending && i.purpose ? ` · ${i.purpose}` : ''}
                        </p>
                      </div>
                      <div className="client-selected__actions">
                        {have
                          ? <span className="client-selected__tag">Added</span>
                          : <button type="button" className="btn-gold btn-outline--sm" onClick={() => onAdd(i)}>Add</button>}
                      </div>
                    </div>
                  )
                })}
              </div>

              {visible.length > shown && (
                <button type="button" className="btn-outline u-mt-10" onClick={() => setShown(n => n + PAGE)}>
                  Show more ({visible.length - shown} left)
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}
