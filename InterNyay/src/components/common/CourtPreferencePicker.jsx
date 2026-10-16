import { useMemo } from 'react'
import { useCourts } from '../../constants/courts'

// Pick one or more courts. Each court (for example Saket or Rohini) is one button; districts are not asked.
// Under the hood a court stands for all of its districts, so choosing it saves every district row of that court.
// value is the list of chosen court table ids, onChange gets the new list
export default function CourtPreferencePicker({ value = [], onChange, disabled = false }) {
  const { rows, loaded } = useCourts()

  // One entry per court: its name and the ids of its district rows (not its buildings or court numbers)
  const { courts, highCourts } = useMemo(() => {
    const district = new Map()
    const high = new Map()
    rows.forEach(r => {
      if (r.building || r.courtNo) return
      if (r.highCourt) high.set(r.court, [...(high.get(r.court) || []), r.id])
      else if (r.district) district.set(r.court, [...(district.get(r.court) || []), r.id])
    })
    return { courts: [...district.entries()], highCourts: [...high.entries()] }
  }, [rows])

  const chosen = new Set(value)
  // A court shows as chosen when any of its districts is chosen (older saved choices may hold only some of them)
  const isChosen = ids => ids.some(id => chosen.has(id))

  // Choosing a court adds all of its districts, choosing it again removes them all
  const toggle = ids => {
    if (disabled) return
    if (isChosen(ids)) onChange(value.filter(v => !ids.includes(v)))
    else onChange([...value, ...ids.filter(id => !chosen.has(id))])
  }

  if (!loaded) return <p className="profile-note">Loading courts…</p>
  if (!courts.length && !highCourts.length) return <p className="profile-note">No courts are listed yet.</p>

  const chip = ([name, ids], label) => {
    const on = isChosen(ids)
    return (
      <button
        key={name}
        type="button"
        className={`qa-filter-btn court-pref__chip${on ? ' active' : ''}`}
        aria-pressed={on}
        disabled={disabled}
        onClick={() => toggle(ids)}
      >{on ? '✓ ' : ''}{label}</button>
    )
  }

  return (
    <div className="court-pref">
      {courts.length > 0 && (
        <div className="court-pref__group">
          <p className="court-pref__court">District Courts</p>
          <div className="court-pref__chips">{courts.map(c => chip(c, c[0]))}</div>
        </div>
      )}
      {highCourts.length > 0 && (
        <div className="court-pref__group">
          <p className="court-pref__court">High Courts</p>
          <div className="court-pref__chips">{highCourts.map(c => chip(c, c[0]))}</div>
        </div>
      )}
    </div>
  )
}
