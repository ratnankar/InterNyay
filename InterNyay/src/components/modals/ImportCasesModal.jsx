import AutoLoad from '../common/AutoLoad'
import { useMemo, useRef, useState } from 'react'
import usePersistedState from '../../hooks/usePersistedState'
import { useApp } from '../../context/AppContext'
import ModalPortal from '../common/ModalPortal'
import Icon from '../common/Icon'
import Dropdown from '../common/Dropdown'
import SearchInput from '../common/SearchInput'
import { formatDate, formatDisplayDate, parseIsoDate } from '../../utils/dateUtils'
import {
  IMPORT_CATEGORIES,
  categoryLabel,
  cleanCnrText,
  parseMyCases,
} from '../../utils/myCasesImport'

// Next-hearing filter, two levels. First level: every hearing, the upcoming ones (today or later), the ones whose date has
// passed and the ones with no date. Second level, shown under "Upcoming": how soon. Dates are YYYY-MM-DD, so they compare as text.
const HEARING_CHIPS = [
  { key: 'all',      label: 'All hearings' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'passed',   label: 'Date passed' },
  { key: 'none',     label: 'No date' },
]
const RANGE_CHIPS = [
  { key: 'all',      label: 'All upcoming' },
  { key: 'today',    label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week',     label: 'Next 7 days' },
  { key: 'month',    label: 'This month' },
]

// Does a case's next hearing date fall under the chosen first-level chip and, for Upcoming, the chosen range
function matchesHearing(nextDate, when, range, now = new Date()) {
  if (when === 'all') return true
  const valid = nextDate && !Number.isNaN(parseIsoDate(nextDate).getTime())
  if (when === 'none') return !valid
  if (!valid) return false
  const day = offset => formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset))
  if (when === 'passed') return nextDate < day(0)
  if (nextDate < day(0)) return false
  switch (range) {
    case 'today':    return nextDate === day(0)
    case 'tomorrow': return nextDate === day(1)
    case 'week':     return nextDate <= day(7)
    case 'month':    return nextDate.slice(0, 7) === day(0).slice(0, 7)
    default:         return true
  }
}

// How many cases are drawn at first, and added each time the end of the list scrolls into view
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

  // The filter choices are remembered per account (this browser), so the window opens the way it was left
  const [category, setCategory] = usePersistedState('import_category', 'all', ['all', ...IMPORT_CATEGORIES.map(c => c.key)])
  const [when, setWhen] = usePersistedState('import_hearing', 'all', ['all', 'upcoming', 'passed', 'none'])   // next hearing: all | upcoming | passed | none
  const [range, setRange] = usePersistedState('import_range', 'all', ['all', 'today', 'tomorrow', 'week', 'month'])   // how soon, under Upcoming
  const [status, setStatus] = usePersistedState('import_status', 'pending', ['pending', 'decided', 'all'])   // pending | decided | all
  const [onlyNew, setOnlyNew] = usePersistedState('import_only_new', true, [true, false])      // hide the cases that are already saved
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

  // Hearing chips only make sense for cases that are still pending
  const showWhen = status !== 'decided'

  // Number of cases under each hearing chip, within the chosen category (pending cases only)
  const pendingInCategory = useMemo(
    () => base.filter(i => i.pending && (category === 'all' || i.category === category)),
    [base, category]
  )
  const whenCounts = useMemo(() => {
    const out = {}
    for (const c of HEARING_CHIPS) out[c.key] = pendingInCategory.filter(i => matchesHearing(i.nextDate, c.key, 'all')).length
    return out
  }, [pendingInCategory])
  const rangeCounts = useMemo(() => {
    const out = {}
    for (const c of RANGE_CHIPS) out[c.key] = pendingInCategory.filter(i => matchesHearing(i.nextDate, 'upcoming', c.key)).length
    return out
  }, [pendingInCategory])

  // The list on screen: the chosen category, hearing chip and the search
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return base
      .filter(i => category === 'all' || i.category === category)
      .filter(i => !showWhen || when === 'all' || (i.pending && matchesHearing(i.nextDate, when, range)))
      .filter(i => !q || [i.cnr, i.petitioner, i.respondent, i.caseNo, i.type, i.court].some(v => String(v).toLowerCase().includes(q)))
      // Cases with the nearest hearing first, then the ones with no hearing date
      .sort((a, b) => (a.nextDate || '9999').localeCompare(b.nextDate || '9999'))
  }, [base, category, query, showWhen, when, range])

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

              <div className="modal__toolbar">
                <div className="import-bar__row">
                  <div className="import-filters" role="group" aria-label="Status">
                    {[['pending', 'Pending'], ['decided', 'Decided'], ['all', 'All']].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={`case-filter-btn${status === value ? ' case-filter-btn--active' : ''}`}
                        onClick={() => { setStatus(value); setShown(PAGE); if (value === 'decided') { setWhen('all'); setRange('all') } }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="import-filters__check">
                    <input type="checkbox" checked={onlyNew} onChange={e => { setOnlyNew(e.target.checked); setShown(PAGE) }} />
                    Hide cases already added
                  </label>
                </div>

                <div className="import-bar__selects">
                  <div className="import-field">
                    <span className="import-field__label">Case type</span>
                    <Dropdown
                      searchable={false}
                      className="form-input"
                      value={category}
                      onChange={e => { setCategory(e.target.value); setShown(PAGE) }}
                    >
                      <option value="all">All case types ({base.length})</option>
                      {IMPORT_CATEGORIES.filter(c => counts[c.key] || c.key === category).map(c => (
                        <option key={c.key} value={c.key}>{c.label} ({counts[c.key] || 0})</option>
                      ))}
                    </Dropdown>
                  </div>

                  {showWhen && (
                    <div className="import-field">
                      <span className="import-field__label">Next hearing</span>
                      <Dropdown
                        searchable={false}
                        className="form-input"
                        value={when === 'upcoming' ? `upcoming:${range}` : when}
                        onChange={e => {
                          const [w, r] = e.target.value.split(':')
                          setWhen(w); setRange(r || 'all'); setShown(PAGE)
                        }}
                      >
                        <option value="all">All hearings ({whenCounts.all || 0})</option>
                        <optgroup label="Upcoming">
                          {RANGE_CHIPS.filter(c => c.key === 'all' || rangeCounts[c.key] || (when === 'upcoming' && range === c.key)).map(c => (
                            <option key={c.key} value={`upcoming:${c.key}`}>{c.label} ({rangeCounts[c.key] || 0})</option>
                          ))}
                        </optgroup>
                        {(whenCounts.passed || when === 'passed') ? <option value="passed">Date passed ({whenCounts.passed || 0})</option> : null}
                        {(whenCounts.none || when === 'none') ? <option value="none">No date ({whenCounts.none || 0})</option> : null}
                      </Dropdown>
                    </div>
                  )}
                </div>

                <SearchInput
                  placeholder="Search by party name, case number, CNR or court"
                  value={query}
                  onChange={v => { setQuery(v); setShown(PAGE) }}
                />
              </div>

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

              <AutoLoad onLoad={() => setShown(n => n + PAGE)} active={visible.length > shown} depKey={shown} />
            </>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}
