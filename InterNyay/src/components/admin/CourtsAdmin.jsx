import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import { useCourts, loadCourts } from '../../constants/courts'
import Dropdown from '../common/Dropdown'
import CourtNoAdder from './CourtNoAdder'
import { Head } from '../common/SuccessorCourts'
import { getErrorMessage } from '../../utils/errorMessages'
import { confirmDialog } from '../../utils/confirmDialog'
import useSessionState from '../../hooks/useSessionState'

const LEVELS = [
  { id: 'court',    label: 'Court' },
  { id: 'district', label: 'District' },
  { id: 'building', label: 'Building' },
  { id: 'courtNo',  label: 'Court no.' },
]

const NEW_BUILDING = '__new__'

const blank = { court: '', district: '', building: '', newBuilding: '', courtNo: '', highCourt: false }

// Admin: the court table behind every court, district, building and court no. list in the app.
// Anything can be added at its own level: a court, a district, a building or a court no.
export default function CourtsAdmin() {
  const { addToast } = useApp()
  const { rows, loaded, courtNames, highCourts, hierarchy } = useCourts()
  const [level, setLevel] = useState('court')
  const [form, setForm] = useState(blank)
  const [busy, setBusy] = useState(false)

  const set = patch => setForm(f => ({ ...f, ...patch }))
  const pickLevel = id => { setLevel(id); setForm(blank) }

  const districts = hierarchy[form.court] || []
  const buildings = [...new Set(rows
    .filter(r => r.court === form.court && r.district === form.district && r.building)
    .map(r => r.building))]
  const isHigh = highCourts.includes(form.court)
  const addingBuilding = level === 'courtNo' && form.building === NEW_BUILDING
  const typedBuilding = form.newBuilding.trim()
  const chosenBuilding = addingBuilding
    ? (buildings.find(b => b.toLowerCase() === typedBuilding.toLowerCase()) || typedBuilding)
    : form.building

  // What has to be filled for the chosen level
  function problem() {
    if (level === 'court') return form.court.trim() ? '' : 'Enter the court name'
    if (!form.court) return 'Choose a court'
    if (level === 'district') return form.district.trim() ? '' : 'Enter the district name'
    if (!isHigh && !form.district) return 'Choose a district'
    if (level === 'building') return form.building.trim() ? '' : 'Enter the building'
    if (addingBuilding && !typedBuilding) return 'Enter the building'
    return form.courtNo.trim() ? '' : 'Enter the court no.'
  }

  async function add() {
    const msg = problem()
    if (msg) { addToast(msg, 'error'); return }
    setBusy(true)
    try {
      const body = { court: form.court, district: '', building: '', courtNo: '', highCourt: false }
      if (level === 'court') body.highCourt = form.highCourt
      if (level !== 'court') body.district = form.district
      if (level === 'building') body.building = form.building
      if (level === 'courtNo') { body.building = chosenBuilding; body.courtNo = form.courtNo }
      await api.courts.add(body)
      await loadCourts(true)
      addToast('Added to the court table')
      setForm(f => level === 'court' ? blank : { ...f, building: level === 'courtNo' ? chosenBuilding : '', newBuilding: '', courtNo: '', district: level === 'district' ? '' : f.district })
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not add'), 'error')
    } finally { setBusy(false) }
  }

  async function remove(row, scope) {
    const what = scope === 'court' ? `the whole ${row.court} court with all its districts`
      : scope === 'district' ? `${row.district} district with its buildings and court numbers`
      : 'this row'
    if (!await confirmDialog(`Remove ${what}? It is refused if judges, cases, rosters or the police directory still use it.`)) return
    try {
      await api.courts.remove(row.id, scope)
      await loadCourts(true)
      addToast('Removed')
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not remove'), 'error')
    }
  }

  const existingCourts = courtNames.concat(highCourts)

  // ---- Expandable tree: Court > District > Building (when there is one) > Court no. ----
  const [open, setOpen] = useSessionState('admin_courts_open', {})
  const toggle = key => setOpen(o => ({ ...o, [key]: !o[key] }))

  const tree = useMemo(() => {
    const courts = new Map()
    rows.forEach(r => {
      if (!courts.has(r.court)) courts.set(r.court, { court: r.court, high: false, rowId: r.id, districts: new Map() })
      const c = courts.get(r.court)
      if (r.highCourt) c.high = true
      const dKey = r.district || ''
      if (!c.districts.has(dKey)) c.districts.set(dKey, { district: dKey, rowId: r.id, buildings: new Map() })
      const d = c.districts.get(dKey)
      const bKey = r.building || ''
      if (!d.buildings.has(bKey)) d.buildings.set(bKey, { building: bKey, rowIds: [], nos: [] })
      const b = d.buildings.get(bKey)
      if (r.courtNo) b.nos.push({ courtNo: r.courtNo, id: r.id, mahilaCourt: !!r.mahilaCourt })
      else if (bKey) b.rowIds.push(r.id)
    })
    return [...courts.values()].map(c => {
      const districts = [...c.districts.values()]
        .filter(d => c.high || d.district || d.buildings.size > 1 || [...d.buildings.values()].some(b => b.building || b.nos.length))
        .map(d => {
          const named = [...d.buildings.values()].filter(b => b.building)
          const none = d.buildings.get('') || { building: '', rowIds: [], nos: [] }
          return { ...d, buildings: new Map([['', none], ...named.map(b => [b.building, b])]) }
        })
      const count = d => [...d.buildings.values()].reduce((n, b) => n + b.nos.length, 0)
      return { ...c, districts: districts.map(d => ({ ...d, count: count(d) })), count: districts.reduce((n, d) => n + count(d), 0) }
    })
  }, [rows])

  // Removes rows one by one (court numbers before their building), then reloads the table
  async function removeRows(ids, what) {
    if (!await confirmDialog(`Remove ${what}? It is refused if judges, cases, rosters or the police directory still use it.`)) return
    try {
      for (const id of ids) await api.courts.remove(id, 'row')
      await loadCourts(true)
      addToast('Removed')
    } catch (e) {
      await loadCourts(true).catch(() => {})
      addToast(getErrorMessage(e, 'Could not remove'), 'error')
    }
  }

  // Marks or unmarks a court room as a Mahila court: orders are not declared there
  async function toggleMahila(n) {
    try {
      await api.courts.setMahila(n.id, !n.mahilaCourt)
      await loadCourts(true)
      addToast(n.mahilaCourt ? `Court no. ${n.courtNo} is no longer a Mahila court` : `Court no. ${n.courtNo} marked as a Mahila court`)
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not update the court'), 'error')
    }
  }

  const RemoveBtn = ({ onClick, label }) => (
    <button type="button" className="courts-btn courts-btn--danger courts-row__action" aria-label={label} title={label} onClick={onClick}>Remove</button>
  )

  function courtNoChips(nos) {
    return (
      <div className="courts-chips">
        {nos.map(n => (
          <div key={n.id} className="courts-chip">
            <div className="courts-chip__main">
              <strong className="courts-chip__label">Court No. {n.courtNo}</strong>
              {n.mahilaCourt && <span className="courts-chip__tag">Mahila court</span>}
            </div>
            <div className="courts-chip__actions">
              <button type="button" className="courts-btn courts-btn--gold"
                      title={n.mahilaCourt ? 'Clear the Mahila court mark' : 'Mark as a Mahila court: orders are not declared there'}
                      onClick={() => toggleMahila(n)}>{n.mahilaCourt ? 'Unmark Mahila' : 'Mark Mahila'}</button>
              <button type="button" className="courts-btn courts-btn--danger" aria-label={`Remove court no. ${n.courtNo}`}
                      title="Remove" onClick={() => removeRows([n.id], `court no. ${n.courtNo}`)}>Remove</button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="courts-admin">
      <div className="courts-add">
      <div className="admin__toolbar">
        {LEVELS.map(l => (
          <button key={l.id} type="button"
                  className={`qa-filter-btn${level === l.id ? ' active' : ''}`}
                  onClick={() => pickLevel(l.id)}>Add {l.label.toLowerCase()}</button>
        ))}
        <span className="admin__count">{loaded ? `${rows.length} rows · ${existingCourts.length} courts` : 'Loading…'}</span>
      </div>

      <div className="admin__toolbar">
        {level === 'court' ? (
          <>
            <input className="form-input" placeholder="Court name" value={form.court}
                   onChange={e => set({ court: e.target.value })} />
            <label className="courts-check">
              <input type="checkbox" checked={form.highCourt} onChange={e => set({ highCourt: e.target.checked })} />
              High court (has no districts)
            </label>
          </>
        ) : (
          <Dropdown className="form-input" value={form.court} onChange={e => set({ court: e.target.value, district: '', building: '', newBuilding: '' })}>
            <option value="">Select court</option>
            {(level === 'district' ? courtNames : existingCourts).map(c => <option key={c} value={c}>{c}</option>)}
          </Dropdown>
        )}

        {level === 'district' && (
          <input className="form-input" placeholder="District name" value={form.district}
                 onChange={e => set({ district: e.target.value })} />
        )}

        {(level === 'building' || level === 'courtNo') && form.court && !isHigh && (
          <Dropdown className="form-input" value={form.district} onChange={e => set({ district: e.target.value, building: '', newBuilding: '' })}>
            <option value="">Select district</option>
            {districts.map(d => <option key={d} value={d}>{d}</option>)}
          </Dropdown>
        )}

        {level === 'building' && (
          <input className="form-input" placeholder="Building" value={form.building}
                 onChange={e => set({ building: e.target.value })} />
        )}

        {level === 'courtNo' && (
          <>
            <Dropdown className="form-input" value={form.building} onChange={e => set({ building: e.target.value, newBuilding: '' })}>
              <option value="">No building</option>
              {buildings.map(b => <option key={b} value={b}>Building {b}</option>)}
              <option value={NEW_BUILDING}>+ Add new building</option>
            </Dropdown>
            {addingBuilding && (
              <input className="form-input" placeholder="New building" value={form.newBuilding}
                     onChange={e => set({ newBuilding: e.target.value })} />
            )}
            <input className="form-input" placeholder="Court no." value={form.courtNo}
                   onChange={e => set({ courtNo: e.target.value })} />
          </>
        )}

        <button type="button" className="btn-gold" onClick={add} disabled={busy}>+ Add</button>
      </div>
      </div>

      <div className="archive courts-tree">
        {!loaded ? null : tree.length === 0 ? <p className="qa-empty">No courts yet.</p> : tree.map(c => {
          const cKey = c.court
          return (
            <section key={cKey} className="archive__year">
              <div className="courts-row courts-row--year">
                <Head level="year" open={!!open[cKey]} label={c.high ? `${c.court} · High court` : c.court}
                      count={c.count} onToggle={() => toggle(cKey)} />
                {c.rowId && <RemoveBtn label="Remove court" onClick={() => remove({ id: c.rowId, court: c.court }, 'court')} />}
              </div>

              {open[cKey] && (
                <div className="archive__body">
                  {c.districts.length === 0 && <p className="courts-empty">No districts yet.</p>}
                  {c.districts.map(d => {
                    const dKey = `${cKey}|${d.district}`
                    const buildings = [...d.buildings.values()]
                    const body = buildings.map(b => {
                      const bKey = `${dKey}|${b.building}`
                      return (
                        <div key={bKey} className="archive__day">
                          <div className="courts-row courts-row--day">
                            <Head level="day" open={!!open[bKey]} label={b.building ? `Building ${b.building}` : 'No building'}
                                  count={b.nos.length} onToggle={() => toggle(bKey)} />
                            {b.building && (
                              <RemoveBtn label="Remove building"
                                         onClick={() => removeRows([...b.nos.map(n => n.id), ...b.rowIds], `building ${b.building} with its court numbers`)} />
                            )}
                          </div>
                          {open[bKey] && (
                            <div className="archive__body">
                              {b.nos.length ? courtNoChips(b.nos) : <p className="courts-empty">No court numbers yet.</p>}
                              <CourtNoAdder court={c.court} district={d.district} building={b.building} />
                            </div>
                          )}
                        </div>
                      )
                    })

                    if (c.high) return <div key={dKey} className="courts-flat">{body}</div>
                    return (
                      <div key={dKey} className="archive__month">
                        <div className="courts-row courts-row--month">
                          <Head level="month" open={!!open[dKey]} label={d.district} count={d.count} onToggle={() => toggle(dKey)} />
                          {d.rowId && <RemoveBtn label="Remove district" onClick={() => remove({ id: d.rowId, district: d.district }, 'district')} />}
                        </div>
                        {open[dKey] && <div className="archive__body">{body}</div>}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}