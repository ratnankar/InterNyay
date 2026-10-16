import { useEffect, useMemo, useRef, useState } from 'react'
import useFieldToggle from '../../hooks/useFieldToggle'
import FloatingList, { inFloatingList } from './FloatingList'

// Text field with a list of suggestions
export default function SuggestInput({ value, onChange, options, placeholder, maxLength }) {
  // Whether the suggestion list is showing
  const [open, setOpen] = useState(false)
  const toggleProps = useFieldToggle(open, setOpen)
  // Index of the highlighted suggestion for keyboard navigation (-1 means none)
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

  // The input stays free text; suggestions are only hints
  const text = value || ''
  // Filter suggestions by what the user has typed so far
  const shown = useMemo(() => {
    const q = text.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => o.toLowerCase().includes(q))
  }, [options, text])

  // Fill the input with the chosen suggestion and close the list
  function pick(option) {
    onChange(option)
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
      pick(shown[active])
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

      {open && shown.length > 0 && (
        <FloatingList className="picker__list" role="listbox">
          {shown.map((option, i) => (
            <button
              type="button"
              key={option}
              role="option"
              aria-selected={i === active}
              className={`picker__option${i === active ? ' picker__option--active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(option)}
            >
              {option}
            </button>
          ))}
        </FloatingList>
      )}
    </div>
  )
}
