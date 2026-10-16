import { Children, isValidElement, useEffect, useMemo, useRef, useState } from 'react'
import FloatingList, { inFloatingList } from './FloatingList'
import useFieldToggle from '../../hooks/useFieldToggle'
import Icon from './Icon'

// An <option> written with several parts, like {name} ({code}), gives React an array; String() would put commas between the parts
function optionText(children) {
  return Array.isArray(children) ? children.map(c => c ?? '').join('') : children
}

// Reads the <option> and <optgroup> children and flattens them into a list, so this can replace a native select
function collectOptions(children) {
  const flat = []

  Children.forEach(children, child => {
    if (!isValidElement(child)) return

    if (child.type === 'optgroup') {
      const group = child.props.label
      Children.forEach(child.props.children, opt => {
        if (!isValidElement(opt)) return
        flat.push({
          value: opt.props.value !== undefined ? String(opt.props.value) : String(optionText(opt.props.children) ?? ''),
          label: optionText(opt.props.children),
          disabled: !!opt.props.disabled,
          group,
        })
      })
      return
    }

    if (child.type === 'option') {
      flat.push({
        value: child.props.value !== undefined ? String(child.props.value) : String(optionText(child.props.children) ?? ''),
        label: optionText(child.props.children),
        disabled: !!child.props.disabled,
        group: null,
      })
    }
  })

  return flat
}

// Next option in the given direction, skipping disabled ones; stays put at either end
function nextEnabledIndex(options, from, dir) {
  let i = from
  for (let step = 0; step < options.length; step++) {
    i += dir
    if (i < 0 || i >= options.length) return from
    if (!options[i].disabled) return i
  }
  return from
}

// True on phones and tablets (touch screens), where a typing box would pop the keyboard up over the list
function useTouchScreen() {
  const query = '(pointer: coarse)'
  const [touch, setTouch] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches)
  useEffect(() => {
    if (!window.matchMedia) return undefined
    const mq = window.matchMedia(query)
    const onChange = () => setTouch(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return touch
}

// Custom dropdown list used instead of the browser select.
// searchable (default): the list can be searched by typing, for long lists.
//   - Computer: the field itself is a typing box.
//   - Phone / tablet: tapping shows the list first with no keyboard; a "Search" row at the top of the list opens the typing box.
//   - touchSearch={false} removes that Search row on phones / tablets only (computers keep the typing box)
// searchable={false}: a plain select for short lists (click to choose, no typing box, no keyboard)
export default function Dropdown({
  value,
  onChange,
  children,
  disabled = false,
  className = '',
  wrapperClassName = '',
  style,
  id,
  placeholder,
  searchable = true,
  touchSearch = true,
  'aria-label': ariaLabel,
}) {
  // Whether the option list is open
  const [open, setOpen] = useState(false)
  // Search text typed while the list is open
  const [query, setQuery] = useState('')
  // Phone / tablet only: whether the search box inside the list has been opened
  const [searching, setSearching] = useState(false)
  // Highlighted option index for keyboard navigation
  const [active, setActive] = useState(-1)
  const boxRef = useRef(null)
  // Letters typed quickly in a row on a plain select, used to jump to a matching option
  const typeBuf = useRef({ text: '', timer: null })
  const touch = useTouchScreen()
  // Typing happens in the field itself (computer) or in a search box inside the list (touch screens)
  const inlineTyping = searchable && !touch
  const listSearch = searchable && touch && touchSearch
  // Click toggles the list open and closed
  const toggleProps = useFieldToggle(open, setOpen, disabled)

  // Flat option list rebuilt only when the children change
  const options = useMemo(() => collectOptions(children), [children])
  // The select's value as a string (empty when none is set)
  const currentValue = value === undefined || value === null ? '' : String(value)
  // Option matching the current value, used for the displayed label
  const selected = options.find(o => o.value === currentValue)

  // While open, a click outside closes the list
  useEffect(() => {
    if (!open) return undefined
    // Close the list when the click lands outside the dropdown
    const onDown = e => {
      if (boxRef.current && !boxRef.current.contains(e.target) && !inFloatingList(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])

  // Reset the search text and highlight whenever the list closes
  useEffect(() => {
    if (!open) { setQuery(''); setActive(-1); setSearching(false) }
  }, [open])

  // Clear the type-ahead timer on unmount
  useEffect(() => () => clearTimeout(typeBuf.current.timer), [])

  // Options filtered by the search text (a plain select always lists everything)
  const shown = useMemo(() => {
    const q = searchable ? query.trim().toLowerCase() : ''
    if (!q) return options
    return options.filter(o => String(o.label ?? '').toLowerCase().includes(q))
  }, [options, query, searchable])

  // Choose an option and call onChange with a select-style event so existing handlers keep working
  function pick(option) {
    if (!option || option.disabled) return
    onChange?.({ target: { value: option.value } })
    setOpen(false)
  }

  // Arrow keys move through options, Enter picks, Space opens, Escape or Tab closes
  function onKeyDown(e) {
    if (disabled) return
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'Tab') { setOpen(false); return }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setActive(i => nextEnabledIndex(shown, i, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setActive(i => nextEnabledIndex(shown, i, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && active >= 0) pick(shown[active])
      else setOpen(true)
    } else if (e.key === ' ' && !open && !inlineTyping) {
      e.preventDefault()
      setOpen(true)
    } else if (!inlineTyping && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Field that cannot be typed in: letters typed quickly jump to the first option starting with them
      e.preventDefault()
      const buf = typeBuf.current
      clearTimeout(buf.timer)
      buf.text += e.key.toLowerCase()
      buf.timer = setTimeout(() => { buf.text = '' }, 700)
      const hit = shown.findIndex(o => !o.disabled && String(o.label ?? '').toLowerCase().startsWith(buf.text))
      if (!open) setOpen(true)
      if (hit >= 0) setActive(hit)
    }
  }

  // Keys inside the list's search box (touch screens): arrows move, Enter picks, Escape closes
  function onSearchKeyDown(e) {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => nextEnabledIndex(shown, i, 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => nextEnabledIndex(shown, i, -1)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (active >= 0) pick(shown[active])
      else if (shown.length === 1) pick(shown[0])
    }
  }

  // Options plus group headers in display order
  const rows = []
  let lastGroup = null
  shown.forEach((o, i) => {
    if (o.group && o.group !== lastGroup) rows.push({ kind: 'header', label: o.group, key: `h-${o.group}` })
    lastGroup = o.group
    rows.push({ kind: 'option', option: o, index: i, key: `${o.group || ''}::${o.value}::${i}` })
  })

  // A field you can type in shows the typed text while open; otherwise the selected label
  const displayValue = inlineTyping && open ? query : String(selected?.label ?? (currentValue === '' ? '' : currentValue))

  return (
    <div
      className={`picker__field dropdown${disabled ? ' dropdown--disabled' : ''}${wrapperClassName ? ` ${wrapperClassName}` : ''}`}
      ref={boxRef}
      style={style}
    >
      <input
        id={id}
        className={`${className} dropdown__input`}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete={inlineTyping ? 'list' : undefined}
        aria-label={ariaLabel}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
        value={displayValue}
        readOnly={!inlineTyping}
        onChange={inlineTyping ? e => { setQuery(e.target.value); setOpen(true); setActive(-1) } : undefined}
        {...toggleProps}
        onKeyDown={onKeyDown}
      />
      <span className="dropdown__chevron" aria-hidden="true">▾</span>

      {open && !disabled && (
        <FloatingList className="picker__list dropdown__list" role="listbox">
          {/* Touch screens: the list comes first; a Search row opens the typing box */}
          {listSearch && (
            <div className="dropdown__search">
              {searching ? (
                <input
                  className="form-input dropdown__search-input"
                  type="text"
                  autoFocus
                  autoComplete="off"
                  placeholder="Type to search"
                  aria-label="Search the list"
                  value={query}
                  onChange={e => { setQuery(e.target.value); setActive(-1) }}
                  onKeyDown={onSearchKeyDown}
                />
              ) : (
                <button type="button" className="dropdown__search-btn" onClick={() => setSearching(true)}>
                  <Icon name="search" /> Search
                </button>
              )}
            </div>
          )}
          {rows.length === 0 && <div className="picker__empty">No matches</div>}
          {rows.map(row => row.kind === 'header'
            ? <div key={row.key} className="dropdown__group-label">{row.label}</div>
            : (
              <button
                key={row.key}
                type="button"
                role="option"
                aria-selected={row.option.value === currentValue}
                disabled={row.option.disabled}
                className={`picker__option${row.index === active ? ' picker__option--active' : ''}${row.option.value === currentValue ? ' dropdown__option--selected' : ''}`}
                ref={el => { if (el && row.index === active) el.scrollIntoView({ block: 'nearest' }) }}
                onMouseEnter={() => setActive(row.index)}
                onClick={() => pick(row.option)}
              >
                {row.option.label}
              </button>
            ))}
        </FloatingList>
      )}
    </div>
  )
}
