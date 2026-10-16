import { useState } from 'react'
import Dropdown from './Dropdown'
import {
  SPECIALIZATIONS, SPECIALIZATION_OTHER, SPEC_DELIMITER, SPEC_MAX_LENGTH,
  parseSpecializations, joinSpecializations,
} from '../../constants/specializations'

// Pick one or more specializations. `value` and `onChange` use one string, entries separated by ";".
export default function SpecializationSelect({ value, onChange, className = 'form-input', inputClassName = 'form-input' }) {
  const [otherOpen, setOtherOpen] = useState(false)
  const [otherText, setOtherText] = useState('')
  const selected = parseSpecializations(value)
  const remaining = SPECIALIZATIONS.filter(s => !selected.some(x => x.toLowerCase() === s.toLowerCase()))

  function commit(list) {
    const joined = joinSpecializations(list)
    if (joined.length <= SPEC_MAX_LENGTH) onChange(joined)
  }

  function pick(next) {
    if (next === SPECIALIZATION_OTHER) { setOtherOpen(true); return }
    if (next) commit([...selected, next])
  }

  function addOther() {
    const text = otherText.replace(new RegExp(SPEC_DELIMITER, 'g'), ' ').trim()
    if (text) commit([...selected, text])
    setOtherText('')
    setOtherOpen(false)
  }

  return (
    <>
      {selected.length > 0 && (
        <div className="spec-chips">
          {selected.map(s => (
            <span className="spec-chip" key={s}>
              {s}
              <button
                type="button"
                className="spec-chip__x"
                aria-label={`Remove ${s}`}
                onClick={() => commit(selected.filter(x => x !== s))}
              >×</button>
            </span>
          ))}
        </div>
      )}
      <Dropdown
        className={className}
        placeholder={selected.length ? 'Add another specialization' : 'Select your specialization'}
        aria-label="Specialization"
        value=""
        onChange={e => pick(e.target.value)}
      >
        {remaining.map(s => <option key={s} value={s}>{s}</option>)}
        <option value={SPECIALIZATION_OTHER}>Other (type your own)</option>
      </Dropdown>
      {otherOpen && (
        <div className="spec-other">
          <input
            className={inputClassName}
            type="text"
            placeholder="Type your specialization"
            maxLength={100}
            autoFocus
            value={otherText}
            onChange={e => setOtherText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOther() } }}
          />
          <button type="button" className="btn btn-outline" onClick={addOther}>Add</button>
        </div>
      )}
    </>
  )
}
