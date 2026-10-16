import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import { loadCourts } from '../../constants/courts'
import { getErrorMessage } from '../../utils/errorMessages'

export default function CourtNoAdder({ court, district = '', building = '' }) {
  const { addToast } = useApp()
  const [courtNo, setCourtNo] = useState('')
  const [busy, setBusy] = useState(false)

  async function add() {
    const no = courtNo.trim()
    if (!no) { addToast('Enter the court no.', 'error'); return }
    setBusy(true)
    try {
      await api.courts.add({ court, district, building, courtNo: no, highCourt: false })
      await loadCourts(true)
      addToast(building ? `Court no. ${no} added to building ${building}` : `Court no. ${no} added`)
      setCourtNo('')
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not add'), 'error')
    } finally {
      setBusy(false)
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      add()
    }
  }

  return (
    <div className="courts-adder">
      <input
        className="form-input courts-adder__input"
        placeholder="Court no."
        value={courtNo}
        onChange={e => setCourtNo(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <button type="button" className="courts-btn courts-btn--solid" onClick={add} disabled={busy}>+ Add</button>
    </div>
  )
}
