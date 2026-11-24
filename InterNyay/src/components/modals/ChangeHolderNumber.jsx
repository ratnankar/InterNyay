import { useState } from 'react'
import api from '../../services/api'
import { useApp } from '../../context/AppContext'
import { getErrorMessage } from '../../utils/errorMessages'

export default function ChangeHolderNumber({ holder, suggested, onChanged }) {
  const { setCases, addToast } = useApp()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  function start() {
    setValue(String(suggested))
    setOpen(true)
  }

  async function apply() {
    const text = value.trim()
    if (!/^[1-9]\d{0,8}$/.test(text)) {
      addToast('Enter a whole number for the file number', 'error')
      return
    }
    setBusy(true)
    try {
      const updated = await api.cases.changeFileNumber(holder.caseId, Number(text))
      setCases(prev => prev.map(c => (c.id === updated.id ? { ...c, ...updated } : c)))
      setOpen(false)
      addToast(`File number of "${holder.caseTitle}" changed to ${text}`)
      onChanged?.(updated)
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not change the file number'), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn-outline btn-outline--sm" onClick={start}>
        Change that case's number
      </button>
    )
  }

  return (
    <span className="file-no-change">
      <input
        className="form-input file-no-change__input"
        inputMode="numeric"
        maxLength={9}
        autoFocus
        aria-label={`New file number for ${holder.caseTitle}`}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            apply()
          }
        }}
      />
      <button type="button" className="btn-gold btn-outline--sm" disabled={busy || !value.trim()} onClick={apply}>
        {busy ? 'Changing…' : 'Apply'}
      </button>
      <button type="button" className="btn-outline btn-outline--sm" disabled={busy} onClick={() => setOpen(false)}>
        Cancel
      </button>
    </span>
  )
}
