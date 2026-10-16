import { useEffect, useRef, useState } from 'react'
import useFieldToggle from '../../hooks/useFieldToggle'
import FloatingList, { inFloatingList } from '../common/FloatingList'
import api from '../../services/api'

import Icon from '../common/Icon'
// Wait in milliseconds after typing before searching
const DEBOUNCE_MS = 120
// Maximum number of judges returned for each search
const RESULT_LIMIT = 10

// One line summary of a judge: designation, court or district, and court room
export const judgeSub = j =>
  [j.designation,
   j.district && j.district !== j.court ? `${j.district} (${j.court})` : j.court,
   j.courtRoomNo && `Court No. ${j.courtRoomNo}`]
    .filter(Boolean)
    .join(' · ')

// Search box for picking one judge or several from the Judges List
export default function JudgeSearchSelect({
  label,
  required = false,
  multiple = false,
  maxItems = null,
  showDistrictToggle = true,
  value,
  onChange,
  placeholder = 'Type the judge’s name…',
  error,
  hint,
  districtScope = '',
}) {
  // Selected judges as a list for both single and multiple mode
  const selected = multiple ? (value || []) : (value ? [value] : [])
  const selectedIds = new Set(selected.map(j => j.id))
  // False once the maximum number of judges is selected
  const canPick = multiple ? (maxItems == null || selected.length < maxItems) : selected.length === 0

  // Typed text, dropdown open state, search results and the failed flag
  const [query,        setQuery]        = useState('')
  const [open,         setOpen]         = useState(false)
  const toggleProps = useFieldToggle(open, setOpen)
  const [results,      setResults]      = useState([])
  const [failed,       setFailed]       = useState(false)
  // Highlighted result, 'this district only' toggle and the search the results belong to
  const [active,       setActive]       = useState(0)
  const [onlyDistrict, setOnlyDistrict] = useState(true)
  const [loadedKey,    setLoadedKey]    = useState('')

  // Ref to the picker, used to close the list on outside clicks
  const boxRef = useRef(null)
  // Counter used to ignore results of older searches
  const requestId = useRef(0)

  // Search text, the district it is limited to, and whether the loaded results match them
  const term = query.trim()
  const scope = districtScope && onlyDistrict ? districtScope : ''
  const searchKey = `${term}|${scope}`
  const fresh = loadedKey === searchKey
  const showList = open && canPick && term.length > 0
  const shown = showList && fresh ? results : []

  // Runs the search after a short delay and ignores outdated responses
  useEffect(() => {
    const id = ++requestId.current

    if (!term) {
      setResults([])
      setFailed(false)
      setLoadedKey('')
      return undefined
    }

    setFailed(false)

    const timer = setTimeout(async () => {
      try {
        const res = await api.judgesList.search({
          q: term,
          limit: RESULT_LIMIT,
          district: scope || undefined,
        })
        if (id !== requestId.current) return
        setResults(Array.isArray(res) ? res : [])
        setLoadedKey(searchKey)
        setActive(0)
      } catch {
        if (id !== requestId.current) return
        setResults([])
        setLoadedKey(searchKey)
        setFailed(true)
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [term, scope, searchKey])

  // Closes the list when the user clicks outside the picker
  useEffect(() => {
    if (!open) return undefined
    // Close the list when the click lands outside the box
    const onDown = e => { if (boxRef.current && !boxRef.current.contains(e.target) && !inFloatingList(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Adds the clicked judge, or sets it in single mode, and closes the list
  function choose(judge) {
    if (multiple) {
      if (!selectedIds.has(judge.id)) onChange([...selected, judge])
    } else {
      onChange(judge)
    }
    setQuery('')
    setActive(0)
    setOpen(false)
  }

  // Removes a selected judge
  function remove(id) {
    if (multiple) onChange(selected.filter(j => j.id !== id))
    else onChange(null)
  }

  // Keyboard control: arrows move through the results, Enter picks one and Escape closes the list
  function onKeyDown(e) {
    if (e.key === 'Escape') { setOpen(false); return }
    if (!showList) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, Math.max(shown.length - 1, 0))) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter') {
      e.preventDefault()
      const pick = shown[active]
      if (pick && !selectedIds.has(pick.id)) choose(pick)
    }
  }

  return (
    <div className="form-group picker" ref={boxRef}>
      {label && <label className="form-label">{label}{required ? ' *' : ''}</label>}

      {selected.length > 0 && (
        <div className="picker__chips">
          {/* Chips for the judges already selected */}
          {selected.map(j => (
            <span className="picker__chip" key={j.id} title={judgeSub(j)}>
              <span className="picker__chip-text">
                {j.name} <span className="picker__chip-sub">· {j.district === j.court ? j.court : j.district}</span>
              </span>
              <button type="button" className="picker__chip-x" onClick={() => remove(j.id)} aria-label={`Remove ${j.name}`}><Icon name="close" /></button>
            </span>
          ))}
        </div>
      )}

      {/* Search input and the 'this district only' toggle */}
      <div className="picker__field">
        {canPick && (
          <input
            className={`form-input${error ? ' form-input--error' : ''}`}
            type="search"
            value={query}
            placeholder={placeholder}
            autoComplete="off"
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            {...toggleProps}
            onKeyDown={onKeyDown}
          />
        )}

        {showDistrictToggle && districtScope && canPick && (
          <label className="admin__check picker__scope">
            <input type="checkbox" checked={onlyDistrict} onChange={e => setOnlyDistrict(e.target.checked)} />
            Only judges of {districtScope}
          </label>
        )}

        {/* Dropdown with search status messages and matching judges */}
        {showList && (
          <FloatingList className="picker__list" role="listbox">
            {!fresh && <div className="picker__empty">Searching…</div>}
            {fresh && failed && <div className="picker__empty">Could not search the Judges List. Try again.</div>}
            {fresh && !failed && results.length === 0 && (
              <div className="picker__empty">
                No judge found for “{term}”{scope ? ` in ${scope}` : ''}.
              </div>
            )}

            {shown.map((j, i) => {
              const already = selectedIds.has(j.id)
              return (
                <button
                  type="button"
                  key={j.id}
                  role="option"
                  aria-selected={i === active}
                  className={`picker__option${i === active ? ' picker__option--active' : ''}`}
                  disabled={already}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(j)}
                >
                  <strong>{j.name}</strong>{already ? ' — added' : ''}
                  <span className="picker__option-sub">{judgeSub(j)}</span>
                </button>
              )
            })}
          </FloatingList>
        )}
      </div>

      {/* Error or hint text under the picker */}
      {error ? <p className="admin__hint admin__hint--error">{error}</p> : hint && <p className="admin__hint">{hint}</p>}
    </div>
  )
}
