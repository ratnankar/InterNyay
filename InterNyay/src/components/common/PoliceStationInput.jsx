import { useEffect, useMemo, useRef, useState } from 'react'
import useFieldToggle from '../../hooks/useFieldToggle'
import FloatingList, { inFloatingList } from './FloatingList'
import usePoliceDirectory from '../../hooks/usePoliceDirectory'
import { buildStationIndex, searchStations } from '../../utils/policeDirectory'

// Maximum number of suggestions shown at once
const MAX_RESULTS = 10

// Text field that suggests police stations while typing
export default function PoliceStationInput({ value, onChange, placeholder, maxLength = 255 }) {
  // Police station directory loaded by the hook
  const { directory, loading, error } = usePoliceDirectory()
  // Search index built once per directory load
  const index = useMemo(() => buildStationIndex(directory), [directory])

  // Whether the suggestion list is showing
  const [open, setOpen] = useState(false)
  const toggleProps = useFieldToggle(open, setOpen)
  // Highlighted suggestion index for keyboard navigation (-1 means none)
  const [active, setActive] = useState(-1)
  const boxRef = useRef(null)

  // While the list is open, a click outside it closes it
  useEffect(() => {
    if (!open) return undefined

    // Close the suggestions when the click lands outside the field
    const onDown = e => {
      if (boxRef.current && !boxRef.current.contains(e.target) && !inFloatingList(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])

  // The field stays free text so a station missing from the directory can still be typed
  const text = value || ''
  // Stations matching what the user has typed
  const matches = useMemo(() => searchStations(index, text, 'all'), [index, text])
  // Only the top few matches are displayed
  const shown = matches.slice(0, MAX_RESULTS)

  // Fill the field with the chosen station and close the list
  function pick(station) {
    onChange(station)
    setOpen(false)
    setActive(-1)
  }

  // Arrow keys move through suggestions, Enter picks one, Escape or Tab closes the list
  function onKeyDown(e) {
    if (e.key === 'Escape' || e.key === 'Tab') { setOpen(false); return }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive(i => Math.min(i + 1, shown.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && open && shown[active]) {
      e.preventDefault()
      pick(shown[active].station)
    }
  }

  return (
    <div className="picker__field" ref={boxRef}>
      <input
        className="form-input"
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        value={text}
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(-1) }}
        {...toggleProps}
        onKeyDown={onKeyDown}
      />

      {open && (
        <FloatingList className="picker__list" role="listbox">
          {loading && !directory && (
            <div className="picker__empty">Loading police stations…</div>
          )}

          {error && !directory && (
            <div className="picker__empty">The police directory could not be loaded — type the station name.</div>
          )}

          {shown.map((e, i) => (
            <button
              type="button"
              key={e.key}
              role="option"
              aria-selected={i === active}
              className={`picker__option${i === active ? ' picker__option--active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(e.station)}
            >
              <strong>PS {e.station}</strong>
              <span className="picker__option-sub">{e.district} District · {e.subDivision} Sub-Division</span>
            </button>
          ))}

          {directory && shown.length === 0 && (
            <div className="picker__empty">
              No station in the directory matches “{text.trim()}” — it will be saved as typed.
            </div>
          )}

          {matches.length > shown.length && (
            <div className="picker__empty">
              Showing {shown.length} of {matches.length} — keep typing to narrow down.
            </div>
          )}
        </FloatingList>
      )}
    </div>
  )
}
