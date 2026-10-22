import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import useOverlayClose from '../../hooks/useOverlayClose'
import usePoliceDirectory, { setPoliceDirectory } from '../../hooks/usePoliceDirectory'
import Dropdown from '../common/Dropdown'
import { useCourts } from '../../constants/courts'
import { getErrorMessage } from '../../utils/errorMessages'
import useSeeMore from '../../hooks/useSeeMore'
import SeeMore from '../common/SeeMore'
import { confirmDialog } from '../../utils/confirmDialog'
import ModalPortal from '../../components/common/ModalPortal'
import useSessionState from '../../hooks/useSessionState'
import SearchInput from '../common/SearchInput'

// Tabs of the police directory admin
const VIEWS = [
  { id: 'stations',  label: 'Police stations' },
  { id: 'subs',      label: 'Sub-divisions'   },
  { id: 'districts', label: 'Districts'       },
  { id: 'notes',     label: 'CAW HQ & notes'  },
]

// Empty contact details for an office
const blankOffice = () => ({ post: '', address: '', email: '', phone: '' })
// Turns null or undefined into an empty string
const orEmpty = v => (v == null ? '' : String(v))
// Trims every string value in an object
const trimAll = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]))

// Hook that runs a save call, updates the shared police directory with the result and shows a toast
function useSaver() {
  const { addToast } = useApp()
  const [saving, setSaving] = useState(false)

  // Runs a save call, stores the returned directory, shows a toast and reports success
  const run = useCallback(async (call, okMessage = 'Saved') => {
    setSaving(true)
    try {
      setPoliceDirectory(await call())
      addToast(okMessage)
      return true
    } catch (e) {
      addToast(getErrorMessage(e, 'Save failed'), 'error')
      return false
    } finally {
      setSaving(false)
    }
  }, [addToast])

  return { saving, run }
}

// Shared dialog frame with title, Cancel and Save buttons
function EditModal({ title, wide, onClose, onSave, saving, children }) {
  const overlay = useOverlayClose(onClose, { backdrop: false })

  return (
    <ModalPortal>
      <div className="overlay" {...overlay}>
        <div className={`modal ${wide ? 'modal--wide' : 'modal--md'}`} onClick={e => e.stopPropagation()}>
          <h3 className="section-title">{title}</h3>

          <div className="admin__form">{children}</div>

          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-gold" onClick={onSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

// Labelled input or textarea with an error message
function Field({ label, value, onChange, error, required, full, textarea, ...rest }) {
  const Tag = textarea ? 'textarea' : 'input'
  return (
    <div className={`form-group${full ? ' admin__form-group--full' : ''}`}>
      <label className="form-label">{label}{required ? ' *' : ''}</label>
      <Tag
        className={`form-input${error ? ' form-input--error' : ''}`}
        value={value}
        onChange={e => onChange(e.target.value)}
        {...(textarea ? { rows: 3 } : {})}
        {...rest}
      />
      {error && <p className="admin__hint admin__hint--error">{error}</p>}
    </div>
  )
}

// Post, phone, email and address inputs for one office
function OfficeFields({ title, value, onChange, showPost = true }) {
  // Updates one field of the office value
  const set = (k, v) => onChange({ ...value, [k]: v })
  return (
    <>
      <p className="admin__hint admin__form-group--full u-bold u-mt-8" >{title}</p>
      {showPost && <Field label="Post"    value={value.post}    onChange={v => set('post', v)} />}
      <Field label="Phone"   value={value.phone}   onChange={v => set('phone', v)} />
      <Field label="E-mail"  value={value.email}   onChange={v => set('email', v)} />
      <Field label="Office address" full value={value.address} onChange={v => set('address', v)} />
    </>
  )
}

// Toolbar row with the filter controls and a count
function Toolbar({ children, count }) {
  return (
    <div className="admin__toolbar">
      {children}
      <span className="admin__count">{count}</span>
    </div>
  )
}

// Number with the word in singular or plural form
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// Police stations tab: list, search, add, edit and delete stations
function StationsView({ directory }) {
  const { saving, run } = useSaver()
  const [search, setSearch] = useState('')
  const [districtFilter, setDistrictFilter] = useState('')
  const [editing, setEditing] = useState(null)
  const [errors, setErrors] = useState({})

  // Every police station flattened into one list with its sub-division and district
  const districts = directory.districts

  // Every station flattened into one list with its district and sub division, sorted by name
  const rows = useMemo(() => {
    const out = []
    districts.forEach(d => (d.subDivisions || []).forEach(sd => (sd.stations || []).forEach(ps =>
      out.push({ ...ps, subId: sd.id, acp: sd.acp, districtId: d.id, district: d.name }))))
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }, [districts])

  // Rows matching the district filter and the search text
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r =>
      (!districtFilter || String(r.districtId) === districtFilter) &&
      (!q || [r.name, r.pin, r.phone, r.email, r.address, r.acp, r.district]
        .some(v => orEmpty(v).toLowerCase().includes(q))))
  }, [rows, search, districtFilter])

  // Show the stations a page at a time; starts again when the search or district changes
  const rowsStep = 25
  const { visible: visibleRows, remaining: rowsRemaining, showMore: showMoreRows, step: showMoreRowsStep } =
    useSeeMore(visible, `${search}|${districtFilter}`, rowsStep)

  // Opens the editor with a blank form or the selected station, starting from a sensible district and sub-division
  function startEdit(row) {
    const firstDistrict = districts.find(d => (d.subDivisions || []).length) || districts[0]
    const districtId = row ? row.districtId : (districtFilter ? Number(districtFilter) : firstDistrict?.id)
    const district = districts.find(d => d.id === districtId)

    setErrors({})
    setEditing({
      id: row?.id ?? null,
      districtId: districtId ?? '',
      subDivisionId: row ? row.subId : (district?.subDivisions?.[0]?.id ?? ''),
      name: orEmpty(row?.name), phone: orEmpty(row?.phone), email: orEmpty(row?.email),
      address: orEmpty(row?.address), pin: orEmpty(row?.pin),
    })
  }

  // Updates one form field and clears its error
  const set = (k, v) => { setEditing(s => ({ ...s, [k]: v })); setErrors(e => ({ ...e, [k]: undefined })) }

  // Changing the district also resets the sub-division to that district's first one
  function setDistrict(id) {
    const d = districts.find(x => String(x.id) === String(id))
    setEditing(s => ({ ...s, districtId: d?.id ?? '', subDivisionId: d?.subDivisions?.[0]?.id ?? '' }))
  }

  // Validates the name and sub-division, then creates or updates the station
  async function save() {
    const errs = {}
    if (!editing.name.trim()) errs.name = 'Police station name is required'
    if (!editing.subDivisionId) errs.subDivisionId = 'Pick a sub-division (add one under “Sub-divisions” first if the district has none)'
    if (Object.keys(errs).length) { setErrors(errs); return }

    const { id, districtId, ...form } = editing
    const body = trimAll({ ...form, subDivisionId: Number(form.subDivisionId) })

    const ok = await run(
      () => (id ? api.police.stations.update(id, body) : api.police.stations.create(body)),
      id ? 'Police station updated' : 'Police station added')
    if (ok) setEditing(null)
  }

  // Deletes a station after confirmation
  async function remove(row) {
    if (!await confirmDialog(`Delete Police Station ${row.name}?`)) return
    await run(() => api.police.stations.remove(row.id), 'Police station deleted')
  }

  // Sub-divisions of the district chosen in the form
  const subOptions = districts.find(d => d.id === editing?.districtId)?.subDivisions || []

  return (
    <>
      {/* Search box, district filter and add button */}
      <Toolbar count={plural(visible.length, 'police station')}>
        <SearchInput placeholder="Search name, PIN, sub-division…" value={search} onChange={setSearch} />
        <Dropdown className="form-input" wrapperClassName="u-maxw-200" value={districtFilter}
                onChange={e => setDistrictFilter(e.target.value)} aria-label="Filter by district">
          <option value="">All districts</option>
          {districts.map(d => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
        </Dropdown>
        <button type="button" className="btn-gold" onClick={() => startEdit(null)}>+ Add police station</button>
      </Toolbar>

      <div className="admin__table-wrap">
        {/* Police stations table */}
        <table className="admin__table">
          <thead>
            <tr><th>Police station</th><th>Sub-division</th><th>District</th><th>Phone</th><th>E-mail</th><th>PIN</th><th /></tr>
          </thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={7} className="admin__empty">No police stations</td></tr>}
            {visibleRows.map(r => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.acp}</td>
                <td>{r.district}</td>
                <td>{r.phone || '—'}</td>
                <td>{r.email || '—'}</td>
                <td>{r.pin || '—'}</td>
                <td className="admin__actions">
                  <button type="button" className="btn-outline btn-outline--sm" onClick={() => startEdit(r)}>Edit</button>
                  <button type="button" className="btn-outline btn-outline--sm btn-outline--danger" onClick={() => remove(r)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SeeMore remaining={rowsRemaining} onClick={showMoreRows} step={showMoreRowsStep} />

      {/* Add / edit dialog */}
      {editing && (
        <EditModal title={editing.id ? 'Edit police station' : 'Add police station'}
                   onClose={() => setEditing(null)} onSave={save} saving={saving}>
          <div className="form-group">
            <label className="form-label">District *</label>
            <Dropdown className="form-input" value={editing.districtId} onChange={e => setDistrict(e.target.value)}>
              {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Dropdown>
          </div>
          <div className="form-group">
            <label className="form-label">Sub-division (ACP) *</label>
            <Dropdown className={`form-input${errors.subDivisionId ? ' form-input--error' : ''}`}
                    value={editing.subDivisionId} onChange={e => set('subDivisionId', e.target.value)}>
              {subOptions.length === 0 && <option value="">— none in this district —</option>}
              {subOptions.map(sd => <option key={sd.id} value={sd.id}>{sd.acp}</option>)}
            </Dropdown>
            {errors.subDivisionId && <p className="admin__hint admin__hint--error">{errors.subDivisionId}</p>}
          </div>
          <Field label="Police station name" required value={editing.name} error={errors.name} onChange={v => set('name', v)} />
          <Field label="PIN code" value={editing.pin} onChange={v => set('pin', v)} maxLength={10} inputMode="numeric" />
          <Field label="SHO phone" value={editing.phone} onChange={v => set('phone', v)} />
          <Field label="SHO e-mail" value={editing.email} onChange={v => set('email', v)} />
          <Field label="Address" full value={editing.address} onChange={v => set('address', v)} />
        </EditModal>
      )}
    </>
  )
}

// Sub-divisions tab: list, search, add, edit and delete sub-divisions
function SubDivisionsView({ directory }) {
  const { saving, run } = useSaver()
  const [search, setSearch] = useState('')
  const [districtFilter, setDistrictFilter] = useState('')
  const [editing, setEditing] = useState(null)
  const [errors, setErrors] = useState({})

  const districts = directory.districts

  // Every sub-division flattened into one list with its district and station count
  const rows = useMemo(() => {
    const out = []
    districts.forEach(d => (d.subDivisions || []).forEach(sd =>
      out.push({ ...sd, districtId: d.id, district: d.name, stationCount: (sd.stations || []).length })))
    return out
  }, [districts])

  // Rows matching the district filter and the search text
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r =>
      (!districtFilter || String(r.districtId) === districtFilter) &&
      (!q || [r.acp, r.address, r.email, r.phone, r.district].some(v => orEmpty(v).toLowerCase().includes(q))))
  }, [rows, search, districtFilter])

  // Show the sub-divisions a page at a time; starts again when the search or district changes
  const rowsStep = 25
  const { visible: visibleRows, remaining: rowsRemaining, showMore: showMoreRows, step: showMoreRowsStep } =
    useSeeMore(visible, `${search}|${districtFilter}`, rowsStep)

  // Opens the editor with a blank form or the selected sub-division
  function startEdit(row) {
    setErrors({})
    setEditing({
      id: row?.id ?? null,
      districtId: row ? row.districtId : (districtFilter ? Number(districtFilter) : (districts[0]?.id ?? '')),
      acp: orEmpty(row?.acp), address: orEmpty(row?.address), email: orEmpty(row?.email), phone: orEmpty(row?.phone),
      stationCount: row?.stationCount ?? 0,
    })
  }

  // Updates one field and clears its error
  const set = (k, v) => { setEditing(s => ({ ...s, [k]: v })); setErrors(e => ({ ...e, [k]: undefined })) }

  // Validates the ACP post and district, then creates or updates the sub-division
  async function save() {
    const errs = {}
    if (!editing.acp.trim()) errs.acp = 'ACP post is required (e.g. “ACP / Hauz Khas”)'
    if (!editing.districtId) errs.districtId = 'Pick a district'
    if (Object.keys(errs).length) { setErrors(errs); return }

    const { id, stationCount, ...form } = editing
    const body = trimAll({ ...form, districtId: Number(form.districtId) })

    const ok = await run(
      () => (id ? api.police.subDivisions.update(id, body) : api.police.subDivisions.create(body)),
      id ? 'Sub-division updated' : 'Sub-division added')
    if (ok) setEditing(null)
  }

  // Deletes a sub-division after confirmation, warning that its stations go with it
  async function remove(row) {
    const extra = row.stationCount
      ? ` Its ${plural(row.stationCount, 'police station')} will be deleted with it.` : ''
    if (!await confirmDialog(`Delete sub-division "${row.acp}"?${extra}`)) return
    await run(() => api.police.subDivisions.remove(row.id), 'Sub-division deleted')
  }

  return (
    <>
      {/* Search box, district filter and add button */}
      <Toolbar count={plural(visible.length, 'sub-division')}>
        <SearchInput placeholder="Search…" value={search} onChange={setSearch} />
        <Dropdown className="form-input" wrapperClassName="u-maxw-200" value={districtFilter}
                onChange={e => setDistrictFilter(e.target.value)} aria-label="Filter by district">
          <option value="">All districts</option>
          {districts.map(d => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
        </Dropdown>
        <button type="button" className="btn-gold" onClick={() => startEdit(null)} disabled={districts.length === 0}>+ Add sub-division</button>
      </Toolbar>

      <div className="admin__table-wrap">
        {/* Sub-divisions table */}
        <table className="admin__table">
          <thead>
            <tr><th>ACP / Sub-division</th><th>District</th><th>Phone</th><th>E-mail</th><th>Stations</th><th /></tr>
          </thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={6} className="admin__empty">No sub-divisions</td></tr>}
            {visibleRows.map(r => (
              <tr key={r.id}>
                <td>{r.acp}</td>
                <td>{r.district}</td>
                <td>{r.phone || '—'}</td>
                <td>{r.email || '—'}</td>
                <td>{r.stationCount}</td>
                <td className="admin__actions">
                  <button type="button" className="btn-outline btn-outline--sm" onClick={() => startEdit(r)}>Edit</button>
                  <button type="button" className="btn-outline btn-outline--sm btn-outline--danger" onClick={() => remove(r)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SeeMore remaining={rowsRemaining} onClick={showMoreRows} step={showMoreRowsStep} />

      {/* Add / edit dialog */}
      {editing && (
        <EditModal title={editing.id ? 'Edit sub-division' : 'Add sub-division'}
                   onClose={() => setEditing(null)} onSave={save} saving={saving}>
          <div className="form-group">
            <label className="form-label">District *</label>
            <Dropdown className="form-input" value={editing.districtId} onChange={e => set('districtId', e.target.value)}>
              {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Dropdown>
          </div>
          <Field label="ACP post" required value={editing.acp} error={errors.acp} onChange={v => set('acp', v)}
                 placeholder="ACP / Hauz Khas" />
          <Field label="Phone" value={editing.phone} onChange={v => set('phone', v)} />
          <Field label="E-mail" value={editing.email} onChange={v => set('email', v)} />
          <Field label="Office address" full value={editing.address} onChange={v => set('address', v)} />
        </EditModal>
      )}
    </>
  )
}

// Builds the district form values from a district, or blank values for a new one
function districtForm(d) {
  return {
    id: d?.id ?? null,
    name: orEmpty(d?.name), range: orEmpty(d?.range), court: orEmpty(d?.court),
    defaultType: orEmpty(d?.defaultType || 'Territorial'), hq: orEmpty(d?.hq),
    dcp: { ...blankOffice(), ...Object.fromEntries(Object.entries(d?.dcp || {}).map(([k, v]) => [k, orEmpty(v)])) },
    caw: { ...blankOffice(), ...Object.fromEntries(Object.entries(d?.caw || {}).map(([k, v]) => [k, orEmpty(v)])) },
    addlDcp: (d?.addlDcp || []).map(a => ({ post: orEmpty(a.post), address: orEmpty(a.address), email: orEmpty(a.email), phone: orEmpty(a.phone) })),
  }
}

// Districts tab: list, add, edit and delete districts
function DistrictsView({ directory }) {
  const { courtNames } = useCourts()
  const { saving, run } = useSaver()
  const [editing, setEditing] = useState(null)
  const [errors, setErrors] = useState({})

  // Districts with their sub-division and station counts
  const rows = directory.districts.map(d => ({
    ...d,
    subCount: (d.subDivisions || []).length,
    stationCount: (d.subDivisions || []).reduce((n, sd) => n + (sd.stations || []).length, 0),
  }))

  // Updates one field and clears its error
  const set = (k, v) => { setEditing(s => ({ ...s, [k]: v })); setErrors(e => ({ ...e, [k]: undefined })) }
  // Updates one additional DCP office in the form
  const setAddl = (i, office) => setEditing(s => ({ ...s, addlDcp: s.addlDcp.map((a, j) => (j === i ? office : a)) }))

  // Validates the name, then creates or updates the district with its DCP and CAW details
  async function save() {
    if (!editing.name.trim()) { setErrors({ name: 'District name is required' }); return }

    const { id, ...form } = editing
    const body = {
      ...trimAll(form),
      dcp: trimAll(form.dcp), caw: trimAll(form.caw),
      addlDcp: form.addlDcp.map(trimAll),
    }

    const ok = await run(
      () => (id ? api.police.districts.update(id, body) : api.police.districts.create(body)),
      id ? 'District updated' : 'District added')
    if (ok) setEditing(null)
  }

  // Deletes a district after confirmation, warning that its sub-divisions and stations go with it
  async function remove(row) {
    if (!await confirmDialog(
      `Delete the ${row.name} district? Its ${plural(row.subCount, 'sub-division')} and ` +
      `${plural(row.stationCount, 'police station')} will be deleted with it.`)) return
    await run(() => api.police.districts.remove(row.id), 'District deleted')
  }

  return (
    <>
      {/* Add button and district count */}
      <Toolbar count={plural(rows.length, 'district')}>
        <button type="button" className="btn-gold" onClick={() => { setErrors({}); setEditing(districtForm(null)) }}>+ Add district</button>
      </Toolbar>

      <div className="admin__table-wrap">
        {/* Districts table */}
        <table className="admin__table">
          <thead>
            <tr><th>District</th><th>Range</th><th>Court</th><th>DCP phone</th><th>Additional DCPs</th><th>Sub-divisions</th><th>Stations</th><th /></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="admin__empty">No districts</td></tr>}
            {rows.map(r => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.range || '—'}</td>
                <td>{r.court || '—'}</td>
                <td>{r.dcp?.phone || '—'}</td>
                <td>{(r.addlDcp || []).length}</td>
                <td>{r.subCount}</td>
                <td>{r.stationCount}</td>
                <td className="admin__actions">
                  <button type="button" className="btn-outline btn-outline--sm" onClick={() => { setErrors({}); setEditing(districtForm(r)) }}>Edit</button>
                  <button type="button" className="btn-outline btn-outline--sm btn-outline--danger" onClick={() => remove(r)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add / edit dialog */}
      {editing && (
        <EditModal wide title={editing.id ? 'Edit district' : 'Add district'}
                   onClose={() => setEditing(null)} onSave={save} saving={saving}>
          <Field label="District name" required value={editing.name} error={errors.name} onChange={v => set('name', v)} />
          <Field label="Police range" value={editing.range} onChange={v => set('range', v)} placeholder="Southern Range" />
          <div className="form-group">
            <label className="form-label">Court</label>
            <Dropdown className="form-input" value={editing.court} onChange={e => set('court', e.target.value)}>
              <option value="">No court</option>
              {courtNames.map(c => <option key={c} value={c}>{c}</option>)}
              {editing.court && !courtNames.includes(editing.court) && <option value={editing.court}>{editing.court} (not in court table)</option>}
            </Dropdown>
          </div>
          <Field label="Type" value={editing.defaultType} onChange={v => set('defaultType', v)} />
          <Field label="District headquarters" full value={editing.hq} onChange={v => set('hq', v)} />

          {/* DCP and Crime Against Women cell offices, followed by any additional DCP offices */}
          <OfficeFields title="DCP" value={editing.dcp} onChange={o => set('dcp', o)} />
          <OfficeFields title="Crime Against Women (CAW) cell" value={editing.caw} onChange={o => set('caw', o)} />

          <p className="admin__hint admin__form-group--full u-bold u-mt-8" >Additional DCPs</p>
          {editing.addlDcp.map((a, i) => (
            <div className="admin__form-group--full admin__subform" key={i}>
              <OfficeFields title={`Additional DCP ${i + 1}`} value={a} onChange={o => setAddl(i, o)} />
              <div className="admin__form-group--full">
                <button type="button" className="btn-outline btn-outline--sm btn-outline--danger"
                        onClick={() => setEditing(s => ({ ...s, addlDcp: s.addlDcp.filter((_, j) => j !== i) }))}>
                  Remove this Additional DCP
                </button>
              </div>
            </div>
          ))}
          <div className="admin__form-group--full">
            <button type="button" className="btn-outline btn-outline--sm"
                    onClick={() => setEditing(s => ({ ...s, addlDcp: [...s.addlDcp, { ...blankOffice(), post: `Additional DCP-${s.addlDcp.length + 1}` }] }))}>
              + Add another additional DCP
            </button>
          </div>
        </EditModal>
      )}
    </>
  )
}

// Tab for the CAW headquarters details and the directory footnote
function NotesView({ directory }) {
  const { saving, run } = useSaver()

  // Form values taken from the directory settings
  const fromDirectory = useCallback(() => ({
    cawHqPost: orEmpty(directory.cawHeadquarter?.post),
    cawHqAddress: orEmpty(directory.cawHeadquarter?.address),
    cawHqNote: orEmpty(directory.cawHeadquarter?.note),
    sourceNote: orEmpty(directory.sourceNote),
  }), [directory])

  const [form, setForm] = useState(fromDirectory)
  // Reset the form when the directory changes
  useEffect(() => { setForm(fromDirectory()) }, [fromDirectory])

  // Updates one field of the form
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="admin__form u-maxh-none">
      <p className="admin__hint admin__form-group--full">
        Shown at the bottom of every police station in the Police Directory. The counts
        (“179 police stations · 67 sub-divisions …”) are worked out automatically from the data.
      </p>
      <Field label="CAW headquarters — name" full value={form.cawHqPost} onChange={v => set('cawHqPost', v)} />
      <Field label="CAW headquarters — address" full value={form.cawHqAddress} onChange={v => set('cawHqAddress', v)} />
      <Field label="CAW headquarters — note" full textarea value={form.cawHqNote} onChange={v => set('cawHqNote', v)} />
      <Field label="Directory footnote (source, disclaimer)" full textarea value={form.sourceNote} onChange={v => set('sourceNote', v)} />
      <div className="admin__form-group--full">
        <button type="button" className="btn-gold" disabled={saving}
                onClick={() => run(() => api.police.updateSettings(trimAll(form)), 'Notes saved')}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// Admin screen for the Police Directory with a tab for each kind of record
export default function PoliceAdmin() {
  const { directory, loading, error, reload } = usePoliceDirectory()
  // Tab currently showing
  const [view, setView] = useSessionState('admin_police_view', 'stations')

  return (
    <>
      {/* Tab buttons */}
      <div className="admin__tabs u-mb-12">
        {VIEWS.map(v => (
          <button key={v.id}
                  className={`admin__tab${view === v.id ? ' admin__tab--active' : ''}`}
                  onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </div>

      {/* Loading, error or empty state while the directory is not available */}
      {!directory && (
        <p className="admin__empty">
          {error
            ? <>{error} <button type="button" className="btn-outline btn-outline--sm" onClick={reload}>Retry</button></>
            : (loading ? 'Loading…' : 'No data')}
        </p>
      )}

      {/* Hint shown when the directory has no data yet */}
      {directory && directory.districts.length === 0 && (
        <p className="admin__hint">
          The Police Directory is empty. Run <code>sql/police_directory.sql</code> (in the backend project)
          once to load every district, sub-division and police station — or add them here one by one,
          starting with a district.
        </p>
      )}

      {/* Only the selected tab is shown */}
      {directory && view === 'stations'  && <StationsView directory={directory} />}
      {directory && view === 'subs'      && <SubDivisionsView directory={directory} />}
      {directory && view === 'districts' && <DistrictsView directory={directory} />}
      {directory && view === 'notes'     && <NotesView directory={directory} />}
    </>
  )
}
