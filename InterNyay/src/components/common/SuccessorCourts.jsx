import { useCallback, useEffect, useMemo, useState } from 'react'
import { onLiveRefresh } from '../../utils/liveRefresh'
import api from '../../services/api'
import { useApp } from '../../context/AppContext'
import CourtPeriodModal from '../admin/CourtPeriodModal'
import { useCourts, getCourtNames, getDistricts, buildingWithFloor } from '../../constants/courts'
import useOverlayClose from '../../hooks/useOverlayClose'
import { getErrorMessage } from '../../utils/errorMessages'
import { formatIsoDate } from '../../utils/rosterUtils'
import Dropdown from './Dropdown'
import Icon from './Icon'
import { confirmDialog } from '../../utils/confirmDialog'
import ModalPortal from './ModalPortal'
import useSessionState from '../../hooks/useSessionState'

const byNumber = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })

// Courts in the usual order first, then any other name alphabetically
function byCourt(a, b) {
  const ia = getCourtNames().indexOf(a)
  const ib = getCourtNames().indexOf(b)
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  return a.localeCompare(b)
}

// Districts in the order of their court, then any other name alphabetically
function byDistrict(court) {
  const order = getDistricts(court)
  return (a, b) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    return a.localeCompare(b)
  }
}

// Court -> District -> Building (when there is one) -> Floor (when there is one) -> Court no., each court no. with all its periods
function buildTree(entries) {
  const courts = new Map()

  entries.forEach(e => {
    const court = e.court || 'Other'
    const district = e.district || 'Other'
    const building = e.building || ''
    if (!courts.has(court)) courts.set(court, new Map())
    const districts = courts.get(court)
    if (!districts.has(district)) districts.set(district, new Map())
    const buildings = districts.get(district)
    if (!buildings.has(building)) buildings.set(building, new Map())
    const floors = buildings.get(building)
    const floor = e.floor || ''
    if (!floors.has(floor)) floors.set(floor, new Map())
    const nos = floors.get(floor)
    if (!nos.has(e.courtRoomNo)) nos.set(e.courtRoomNo, [])
    nos.get(e.courtRoomNo).push(e)
  })

  return [...courts.keys()].sort(byCourt).map(court => {
    const districts = courts.get(court)
    const districtNodes = [...districts.keys()].sort(byDistrict(court)).map(district => {
      const buildings = districts.get(district)
      const buildingNodes = [...buildings.keys()].sort(byNumber).map(building => {
        const floors = buildings.get(building)
        const floorNodes = [...floors.keys()].sort(byNumber).map(floor => {
          const nos = floors.get(floor)
          const courtNos = [...nos.keys()].sort(byNumber).map(no => ({
            key: `${court}|${district}|${building}|${floor}|${no}`,
            court, district, building, floor, no,
            rows: nos.get(no),
          }))
          return { key: `${court}|${district}|${building}|${floor}`, floor, courtNos, count: courtNos.length }
        })
        return {
          key: `${court}|${district}|${building}`,
          building,
          hasFloors: floorNodes.some(f => f.floor),
          floors: floorNodes,
          count: floorNodes.reduce((n, f) => n + f.count, 0),
        }
      })
      return {
        key: `${court}|${district}`,
        district,
        // Only show the building level when this district has at least one building
        hasBuildings: buildingNodes.some(b => b.building),
        buildings: buildingNodes,
        count: buildingNodes.reduce((n, b) => n + b.count, 0),
      }
    })
    return {
      key: court,
      court,
      districts: districtNodes,
      count: districtNodes.reduce((n, d) => n + d.count, 0),
    }
  })
}

export function Head({ level, open, label, count, onToggle }) {
  return (
    <button
      type="button"
      className={`archive__head archive__head--${level}`}
      aria-expanded={open}
      onClick={onToggle}
    >
      <span className={`archive__chevron${open ? ' archive__chevron--open' : ''}`} aria-hidden="true" />
      <span className="archive__label">{label}</span>
      <span className="archive__count">{count}</span>
    </button>
  )
}

// Popup with every judge who sat in this court no. and when.
// In the admin console (onAdd, onEdit, onDelete given) every period, the current one too, can be edited or deleted, and new past ones added
function CourtHistoryModal({ node, onClose, onAdd, onEdit, onDelete }) {
  const overlayHandlers = useOverlayClose(onClose)
  const path = [node.court, node.district, node.building && `Building ${buildingWithFloor(node.building, node.floor)}`].filter(Boolean).join(' › ')

  return (
    <ModalPortal>
      <div className="overlay" {...overlayHandlers}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal__header">
            <div>
              <h2 className="modal__title">Court No. {node.no} — history</h2>
              <p className="court-log__path">{path}</p>
            </div>
            <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={onClose}><Icon name="close" /></button>
          </div>
          {onAdd && (
            <div className="successor__admin-bar">
              <button type="button" className="btn-outline btn-outline--sm" onClick={onAdd}>+ Add period</button>
            </div>
          )}
          {node.rows.length === 0 && <p className="qa-empty">No periods left for this court number.</p>}
          <ul className="court-history__list">
            {node.rows.map((r, i) => (
              <li key={`${r.id ?? r.judgeId}-${r.fromDate}-${i}`} className="court-history__item">
                <strong className="court-history__no">{r.judgeName}</strong>
                {r.designation && <span className="court-history__range">{r.designation}</span>}
                <span className="court-history__range">
                  {formatIsoDate(r.fromDate)} – {r.tillDate ? formatIsoDate(r.tillDate) : 'Present'}
                </span>
                {r.current && <span className="qa-status qa-status--active">Current</span>}
                {onEdit && (
                  <span className="court-history__actions">
                    <button type="button" className="btn-outline btn-outline--sm" onClick={() => onEdit(r)}>Edit</button>
                    <button type="button" className="btn-outline btn-outline--sm btn-outline--danger" onClick={() => onDelete(r)}>Delete</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ModalPortal>
  )
}

// Quick Access: choose court, district, building and court no. from dropdowns, open Court > District > Building > Court no. and click a court no. for its history
export default function SuccessorCourts({ admin = false }) {
  useCourts()
  const { addToast } = useApp()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [pick,    setPick]    = useSessionState('qa_successor_pick', { court: '', district: '', building: '', floor: '', courtNo: '' })
  const [open,    setOpen]    = useSessionState('qa_successor_open', {})
  const [picked,  setPicked]  = useSessionState('qa_successor_picked', null)
  // Period being added or edited in the admin console: { period, defaults }
  const [editor,  setEditor]  = useState(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(null) }
    try {
      const res = await api.judgesList.courtNoLog({})
      setEntries(Array.isArray(res) ? res : [])
    } catch (e) {
      if (!silent) setError(getErrorMessage(e, "We couldn't load the successor courts. Please try again."))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => onLiveRefresh(() => load(true)), [load])

  const NONE = '__none'

  // The open court number with its periods taken from the latest data, so edits show up without closing the popup
  const pickedNode = useMemo(() => picked && {
    ...picked,
    rows: entries.filter(e =>
      (e.court || 'Other') === picked.court && (e.district || 'Other') === picked.district &&
      (e.building || '') === picked.building && (e.floor || '') === (picked.floor || '') && e.courtRoomNo === picked.no),
  }, [picked, entries])

  // Court, district, building and court no. a new period starts from: the open court number, else the chosen filters
  const startFor = () => picked
    ? { court: picked.court, district: picked.district, building: picked.building, floor: picked.floor || '', courtRoomNo: picked.no }
    : { court: pick.court, district: pick.district, building: pick.building === NONE ? '' : pick.building, floor: pick.floor === NONE ? '' : (pick.floor || ''), courtRoomNo: pick.courtNo }

  async function removePeriod(r) {
    const message = r.current
      ? `Delete ${r.judgeName}'s current period in Court No. ${r.courtRoomNo}? The judge will have no court number until you set one again in Judges List.`
      : `Delete ${r.judgeName}'s period in Court No. ${r.courtRoomNo} (${formatIsoDate(r.fromDate)} – ${formatIsoDate(r.tillDate)})?`
    if (!await confirmDialog(message)) return
    try {
      await api.judgesList.removeCourtNo(r.judgeId, r.id)
      addToast('Deleted')
      load()
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not delete the court number period'), 'error')
    }
  }
  const choose = patch => setPick(p => ({ ...p, ...patch }))

  // Each dropdown only lists what exists under the choices made before it
  const options = useMemo(() => {
    const uniq = list => [...new Set(list)]
    const inCourt = entries.filter(e => !pick.court || e.court === pick.court)
    const inDistrict = inCourt.filter(e => !pick.district || e.district === pick.district)
    const inBuilding = inDistrict.filter(e => !pick.building || (e.building || '') === (pick.building === NONE ? '' : pick.building))
    const inFloor = inBuilding.filter(e => !pick.floor || (e.floor || '') === (pick.floor === NONE ? '' : pick.floor))
    return {
      courts:    uniq(entries.map(e => e.court).filter(Boolean)).sort(byCourt),
      districts: pick.court ? uniq(inCourt.map(e => e.district).filter(Boolean)).sort(byDistrict(pick.court)) : [],
      buildings: pick.court ? uniq(inDistrict.map(e => e.building).filter(Boolean)).sort(byNumber) : [],
      hasUnbuilt: pick.court ? inDistrict.some(e => !e.building) : false,
      floors:    pick.building ? uniq(inBuilding.map(e => e.floor).filter(Boolean)).sort(byNumber) : [],
      hasUnfloored: pick.building ? inBuilding.some(e => !e.floor) : false,
      courtNos:  pick.building ? uniq(inFloor.map(e => e.courtRoomNo).filter(Boolean)).sort(byNumber) : [],
    }
  }, [entries, pick])

  const filtered = useMemo(() => {
    const matched = entries.filter(e =>
      (!pick.court    || e.court === pick.court) &&
      (!pick.district || e.district === pick.district) &&
      (!pick.building || (e.building || '') === (pick.building === NONE ? '' : pick.building)) &&
      (!pick.floor    || (e.floor || '') === (pick.floor === NONE ? '' : pick.floor)) &&
      (!pick.courtNo  || e.courtRoomNo === pick.courtNo)
    )
    return matched
  }, [entries, pick])

  const tree = useMemo(() => buildTree(filtered), [filtered])
  const searching = !!(pick.court || pick.district || pick.building || pick.floor || pick.courtNo)
  const total = tree.reduce((n, c) => n + c.count, 0)
  const reset = () => { setPick({ court: '', district: '', building: '', floor: '', courtNo: '' }) }

  const isOpen = key => searching || !!open[key]
  const toggle = key => setOpen(o => ({ ...o, [key]: !o[key] }))

  function courtNoButtons(courtNos) {
    return (
      <div className="successor__nos">
        {courtNos.map(n => {
          const current = n.rows.find(r => r.current)
          return (
            <button key={n.key} type="button" className="successor__no" onClick={() => setPicked(n)}>
              <strong>Court No. {n.no}</strong>
              <span className="successor__judge">{current ? current.judgeName : 'No current judge'}</span>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="successor">
      <div className="qa-jur-search">
        <p className="qa-section-header">
          <span><Icon name="search" /> Search by Court, District, Building, Floor &amp; Court no.</span>
        </p>

        <div className="successor__filters">
          <div className="successor__field">
            <label className="form-label">Court</label>
            <Dropdown className="form-input" value={pick.court}
                      onChange={e => setPick({ court: e.target.value, district: '', building: '', floor: '', courtNo: '' })}>
              <option value="">All courts</option>
              {options.courts.map(c => <option key={c} value={c}>{c}</option>)}
            </Dropdown>
          </div>

          <div className="successor__field">
            <label className="form-label">District</label>
            <Dropdown className="form-input" value={pick.district} disabled={!pick.court || options.districts.length === 0}
                      onChange={e => choose({ district: e.target.value, building: '', floor: '', courtNo: '' })}>
              <option value="">All districts</option>
              {options.districts.map(d => <option key={d} value={d}>{d}</option>)}
            </Dropdown>
          </div>

          <div className="successor__field">
            <label className="form-label">Building</label>
            <Dropdown className="form-input" value={pick.building}
                      disabled={!pick.court || (options.buildings.length === 0 && !options.hasUnbuilt)}
                      onChange={e => choose({ building: e.target.value, floor: '', courtNo: '' })}>
              <option value="">All buildings</option>
              {options.buildings.map(b => <option key={b} value={b}>{b}</option>)}
              {options.hasUnbuilt && <option value={NONE}>No building</option>}
            </Dropdown>
          </div>

          <div className="successor__field">
            <label className="form-label">Floor</label>
            <Dropdown className="form-input" value={pick.floor || ''}
                      disabled={!pick.building || (options.floors.length === 0 && !options.hasUnfloored)}
                      onChange={e => choose({ floor: e.target.value, courtNo: '' })}>
              <option value="">All floors</option>
              {options.floors.map(f => <option key={f} value={f}>{f}</option>)}
              {options.hasUnfloored && options.floors.length > 0 && <option value={NONE}>No floor</option>}
            </Dropdown>
          </div>

          <div className="successor__field">
            <label className="form-label">Court no.</label>
            <Dropdown className="form-input" value={pick.courtNo} disabled={!pick.building || options.courtNos.length === 0}
                      onChange={e => choose({ courtNo: e.target.value })}>
              <option value="">All court numbers</option>
              {options.courtNos.map(n => <option key={n} value={n}>{n}</option>)}
            </Dropdown>
          </div>
        </div>

        <div className="successor__footer">
          <p className="successor__summary">
            {!loading && !error && searching && `${total} court ${total === 1 ? 'number' : 'numbers'} found`}
          </p>
          <div className="successor__actions">
            <button type="button" className="btn-outline successor__reset" disabled={!searching} onClick={reset}>Start Over</button>
            {admin && (
              <button type="button" className="btn-gold btn-outline--sm successor__add" onClick={() => setEditor({ period: null, defaults: startFor() })}>
                + Add court number period
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? <p className="qa-empty">Loading successor courts…</p>
        : error ? (
          <div className="qa-empty">
            <p>{error}</p>
            <button type="button" className="btn-outline btn-outline--sm" onClick={() => load()}>Try again</button>
          </div>
        )
        : tree.length === 0 ? <p className="qa-empty">{searching ? 'No courts found.' : 'No court history recorded yet.'}</p>
        : (
          <div className="archive courts-tree">
            {tree.map(court => (
              <section key={court.key} className="archive__year">
                <div className="courts-row courts-row--year">
                  <Head level="year" open={isOpen(court.key)} label={court.court} count={court.count} onToggle={() => toggle(court.key)} />
                </div>

                {isOpen(court.key) && (
                  <div className="archive__body">
                    {court.districts.map(d => (
                      <div key={d.key} className="archive__month">
                        <div className="courts-row courts-row--month">
                          <Head level="month" open={isOpen(d.key)} label={d.district} count={d.count} onToggle={() => toggle(d.key)} />
                        </div>

                        {isOpen(d.key) && (
                          <div className="archive__body">
                            {d.hasBuildings
                              ? d.buildings.map(b => {
                                  const bKey = `${d.key}|${b.building}`
                                  return (
                                    <div key={bKey} className="archive__day">
                                      <div className="courts-row courts-row--day">
                                        <Head
                                          level="day"
                                          open={isOpen(bKey)}
                                          label={b.building ? `Building ${b.building}` : 'No building recorded'}
                                          count={b.count}
                                          onToggle={() => toggle(bKey)}
                                        />
                                      </div>
                                      {isOpen(bKey) && (
                                        <div className="archive__body">
                                          {b.hasFloors
                                            ? b.floors.map(f => {
                                                const fKey = `${bKey}|${f.floor}`
                                                return (
                                                  <div key={fKey} className="archive__day">
                                                    <div className="courts-row courts-row--day">
                                                      <Head
                                                        level="day"
                                                        open={isOpen(fKey)}
                                                        label={f.floor ? `Floor ${f.floor}` : 'No floor recorded'}
                                                        count={f.count}
                                                        onToggle={() => toggle(fKey)}
                                                      />
                                                    </div>
                                                    {isOpen(fKey) && <div className="archive__body">{courtNoButtons(f.courtNos)}</div>}
                                                  </div>
                                                )
                                              })
                                            : courtNoButtons(b.floors.flatMap(f => f.courtNos))}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })
                              : d.buildings.some(b => b.hasFloors)
                                ? d.buildings.map(b => {
                                    const bKey = `${d.key}|${b.building}`
                                    return (
                                      <div key={bKey} className="archive__day">
                                        {b.floors.map(f => {
                                          const fKey = `${bKey}|${f.floor}`
                                          return (
                                            <div key={fKey}>
                                              <div className="courts-row courts-row--day">
                                                <Head
                                                  level="day"
                                                  open={isOpen(fKey)}
                                                  label={f.floor ? `Floor ${f.floor}` : 'No floor recorded'}
                                                  count={f.count}
                                                  onToggle={() => toggle(fKey)}
                                                />
                                              </div>
                                              {isOpen(fKey) && <div className="archive__body">{courtNoButtons(f.courtNos)}</div>}
                                            </div>
                                          )
                                        })}
                                      </div>
                                    )
                                  })
                                : courtNoButtons(d.buildings.flatMap(b => b.floors.flatMap(f => f.courtNos)))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}

      {pickedNode && (
        <CourtHistoryModal
          node={pickedNode}
          onClose={() => setPicked(null)}
          {...(admin ? {
            onAdd: () => setEditor({ period: null, defaults: startFor() }),
            onEdit: r => setEditor({ period: r, defaults: {} }),
            onDelete: removePeriod,
          } : {})}
        />
      )}

      {editor && (
        <CourtPeriodModal
          period={editor.period}
          defaults={editor.defaults}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); load() }}
        />
      )}
    </div>
  )
}