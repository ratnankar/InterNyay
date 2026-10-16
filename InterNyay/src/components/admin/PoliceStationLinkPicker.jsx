import { useEffect, useMemo, useRef, useState } from 'react'
import useFieldToggle from '../../hooks/useFieldToggle'
import FloatingList, { inFloatingList } from '../common/FloatingList'
import usePoliceDirectory from '../../hooks/usePoliceDirectory'
import { buildStationIndex, districtOptions, searchStations } from '../../utils/policeDirectory'
import Dropdown from '../common/Dropdown'

import Icon from '../common/Icon'
// Maximum number of stations shown in the dropdown
const MAX_RESULTS = 12

// Picker that links police stations by id, searching the police directory by name or district
export default function PoliceStationLinkPicker({ label = 'Police stations', value, onChange, hint }) {
  // Police directory, a searchable index of its stations and the district options
  const { directory, loading } = usePoliceDirectory()
  // Station index, district options and a lookup by station id
  const index   = useMemo(() => buildStationIndex(directory), [directory])
  const options = useMemo(() => districtOptions(directory),   [directory])
  const byId    = useMemo(() => new Map(index.map(e => [e.stationId, e])), [index])

  // Selected station ids and a set of them for quick lookup
  const ids    = useMemo(() => value || [], [value])
  // Ids already picked, so they are left out of the results
  const chosen = useMemo(() => new Set(ids), [ids])

  // Typed text, selected district filter, dropdown open state and highlighted result
  const [query,      setQuery]      = useState('')
  const [districtId, setDistrictId] = useState('all')
  const [open,       setOpen]       = useState(false)
  const toggleProps = useFieldToggle(open, setOpen)
  const [active,     setActive]     = useState(0)
  // Ref to the picker, used to close the list on outside clicks
  const fieldRef = useRef(null)

  // Closes the list when the user clicks outside the picker
  useEffect(() => {
    if (!open) return undefined
    // Close the list when the click lands outside the field
    const onDown = e => { if (fieldRef.current && !fieldRef.current.contains(e.target) && !inFloatingList(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])

  // Stations matching the search and district, minus those already selected
  const all     = useMemo(() => searchStations(index, query, districtId), [index, query, districtId])
  // Search results without the stations already picked
  const results = useMemo(() => all.filter(e => !chosen.has(e.stationId)), [all, chosen])
  const shown   = results.slice(0, MAX_RESULTS)

  // Adds stations by id, skipping ones already selected, or removes one
  const add    = list => onChange([...ids, ...list.map(e => e.stationId).filter(id => !chosen.has(id))])
  // Unpick a station
  const remove = id   => onChange(ids.filter(x => x !== id))

  // Adds one station from the list and closes the dropdown
  function pick(entry) {
    add([entry])
    setQuery('')
    setActive(0)
    setOpen(false)
  }

  // Keyboard control: arrows move through the results, Enter picks one, Escape and Tab close the list
  function onKeyDown(e) {
    if (e.key === 'Escape' || e.key === 'Tab') { setOpen(false); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(i => Math.min(i + 1, Math.max(shown.length - 1, 0))) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) pick(shown[active]) }
  }

  const typed = query.trim()
  // The 'add all' option is offered only for a small, filtered set of results
  const canAddAll = results.length > 0 && results.length <= 60 && (districtId !== 'all' || typed)

  return (
    <div className="form-group picker admin__form-group--full">
      <label className="form-label">{label}{ids.length ? ` (${ids.length})` : ''}</label>

      {/* Chips for the stations already selected, with a clear all button */}
      {ids.length > 0 && (
        <div className="picker__chips">
          {ids.map(id => {
            const e = byId.get(id)
            const name = e ? e.station : `Station #${id}`
            return (
              <span className="picker__chip" key={id} title={e ? `${e.district} District · ${e.subDivision} Sub-Division` : undefined}>
                <span className="picker__chip-text">{name}</span>
                <button type="button" className="picker__chip-x" onClick={() => remove(id)} aria-label={`Remove ${name}`}><Icon name="close" /></button>
              </span>
            )
          })}
          <button type="button" className="btn-outline btn-outline--sm" onClick={() => onChange([])}>Clear all</button>
        </div>
      )}

      {/* Search input and district filter */}
      <div className="picker__field" ref={fieldRef}>
        <div className="picker__row">
          <input
            className="form-input"
            type="search"
            value={query}
            placeholder="Search the police directory — e.g. Saket, Kalkaji, 110017"
            autoComplete="off"
            onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0) }}
            {...toggleProps}
            onKeyDown={onKeyDown}
          />
          <Dropdown
            className="form-input picker__district"
            value={districtId}
            onChange={e => { setDistrictId(e.target.value); setOpen(true); setActive(0) }}
            aria-label="Police district"
          >
            {options.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Dropdown>
        </div>

        {/* Dropdown with the matching stations */}
        {open && (
          <FloatingList className="picker__list" role="listbox">
            <div className="picker__list-head">
              <button type="button" className="picker__close" onClick={() => setOpen(false)}><Icon name="close" /> Close</button>
            </div>

            {canAddAll && (
              <button
                type="button"
                className="picker__option"
                onClick={() => { add(results); setQuery(''); setOpen(false) }}
              >
                <strong>＋ Add all {results.length} shown</strong>
                <span className="picker__option-sub">
                  {districtId !== 'all' ? options.find(d => String(d.id) === String(districtId))?.name + ' district' : `matching “${typed}”`}
                </span>
              </button>
            )}

            {shown.map((e, i) => (
              <button
                type="button"
                key={e.key}
                role="option"
                aria-selected={i === active}
                className={`picker__option${i === active ? ' picker__option--active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(e)}
              >
                <strong>PS {e.station}</strong>
                <span className="picker__option-sub">{e.district} District · {e.subDivision} Sub-Division</span>
              </button>
            ))}

            {shown.length === 0 && (
              <div className="picker__empty">
                {loading ? 'Loading police stations…'
                  : all.length > 0 ? 'Every matching station is already added.'
                  : 'No police station in the directory matches that search.'}
              </div>
            )}

            {results.length > shown.length && (
              <div className="picker__empty">Showing {shown.length} of {results.length} — type more to narrow down.</div>
            )}
          </FloatingList>
        )}
      </div>

      {/* Optional hint under the picker */}
      {hint && <p className="admin__hint">{hint}</p>}
    </div>
  )
}
