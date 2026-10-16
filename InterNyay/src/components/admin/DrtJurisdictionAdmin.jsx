import { useCallback, useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import useOverlayClose from '../../hooks/useOverlayClose'
import { useDrtJurisdiction } from '../../hooks/useJurisdictionDirectory'
import Dropdown from '../common/Dropdown'
import PoliceStationLinkPicker from './PoliceStationLinkPicker'
import { getErrorMessage } from '../../utils/errorMessages'
import useSeeMore from '../../hooks/useSeeMore'
import SeeMore from '../common/SeeMore'
import { confirmDialog } from '../../utils/confirmDialog'
import ModalPortal from '../../components/common/ModalPortal'

// Tribunal types. The high-value bench and the appellate tribunal can exist only once each
const KINDS = [
  { value: 'BENCH',      label: 'Bench (territorial)',            unique: false },
  { value: 'HIGH_VALUE', label: 'High-value bench (₹100 crore+)', unique: true  },
  { value: 'APPELLATE',  label: 'Appellate tribunal',             unique: true  },
]

// Lookup from kind value to its display label
const KIND_LABEL = Object.fromEntries(KINDS.map(k => [k.value, k.label]))

// Blank form for a new tribunal
function emptyForm(kind = 'BENCH') {
  return {
    kind,
    name: '',
    location: '',
    phone: '',
    districtsLabel: '',
    amountLabel: '',
    jurisdictionText: '',
    note: '',
    stationIds: [],
  }
}

// Admin screen to manage Debts Recovery Tribunal benches and the police stations linked to territorial benches
export default function DrtJurisdictionAdmin() {
  const { addToast } = useApp()
  // Tribunal directory is loaded and shared through the jurisdiction hook
  const { directory, loading, error, reload } = useDrtJurisdiction()

  // Search text, tribunal being edited (null when closed), validation errors and saving flag
  const [search,  setSearch]  = useState('')
  const [editing, setEditing] = useState(null)
  const [errors,  setErrors]  = useState({})
  const [saving,  setSaving]  = useState(false)

  // All tribunals from the directory
  const rows = useMemo(() => directory?.tribunals || [], [directory])

  // Rows matching the search in name, location, phone, districts or police stations
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r =>
      [r.name, r.location, r.phone, r.districtsLabel, ...(r.stations || [])]
        .filter(Boolean)
        .some(v => v.toLowerCase().includes(q))
    )
  }, [rows, search])


  // Show the rows a page at a time; starts again when the search or filter changes
  const rowsStep = 25
  const {
    visible: visibleRows,
    remaining: rowsRemaining,
    showMore: showMoreRows,
  } = useSeeMore(visible, search, rowsStep)
  // Single-use kinds already taken by another tribunal, so they cannot be added twice
  const takenKinds = useMemo(
    () => new Set(rows.filter(r => r.kind !== 'BENCH' && r.id !== editing?.id).map(r => r.kind)),
    [rows, editing?.id]
  )

  // Closes the editor, also when the backdrop is clicked
  const closeEditor = useCallback(() => setEditing(null), [])
  const overlayHandlers = useOverlayClose(closeEditor, { backdrop: false })

  // Opens the editor with a blank form or the selected tribunal's values
  function startEdit(row) {
    const form = emptyForm()
    if (row) {
      form.kind = row.kind
      form.name = row.name || ''
      form.location = row.location || ''
      form.phone = row.phone || ''
      form.districtsLabel = row.districtsLabel || ''
      form.amountLabel = row.amountLabel || ''
      form.jurisdictionText = row.jurisdictionText || ''
      form.note = row.note || ''
      form.stationIds = row.stationIds || []
    }
    setErrors({})
    setEditing({ id: row?.id ?? null, isNew: !row, form })
  }

  // Updates one form field and clears its error
  function patch(key, value) {
    setEditing(s => ({ ...s, form: { ...s.form, [key]: value } }))
    setErrors(errs => ({ ...errs, [key]: undefined }))
  }

  // Validates the name, then creates or updates the tribunal and refreshes the shared directory
  async function save() {
    if (!editing) return
    const f = editing.form

    if (!f.name.trim()) {
      setErrors({ name: 'Name is required' })
      addToast('Fix the highlighted fields before saving', 'error')
      return
    }

    const body = {
      kind: f.kind,
      name: f.name.trim(),
      location: f.location.trim(),
      phone: f.phone.trim(),
      districtsLabel: f.districtsLabel.trim(),
      amountLabel: f.amountLabel.trim(),
      jurisdictionText: f.jurisdictionText.trim(),
      note: f.note.trim(),
      stationIds: f.kind === 'BENCH' ? f.stationIds : [],
    }

    setSaving(true)
    try {
      const res = editing.isNew
        ? await api.jurisdiction.drt.create(body)
        : await api.jurisdiction.drt.update(editing.id, body)
      useDrtJurisdiction.publish(res)
      addToast('Saved')
      setEditing(null)
    } catch (e) {
      addToast(getErrorMessage(e, 'Save failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  // Deletes a tribunal after confirmation; a bench's station list goes with it
  async function remove(row) {
    if (!await confirmDialog(`Delete ${row.name}?${row.kind === 'BENCH' ? ' Its police station list is deleted with it.' : ''}`)) return
    try {
      useDrtJurisdiction.publish(await api.jurisdiction.drt.remove(row.id))
      addToast('Deleted')
    } catch (e) {
      addToast(getErrorMessage(e, 'Delete failed'), 'error')
    }
  }

  const form = editing?.form

  return (
    <>
      <div className="admin__toolbar">
        {/* Search box */}
        <input
          className="form-input"
          placeholder="Search tribunals or police stations…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button type="button" className="btn-gold" onClick={() => startEdit(null)}>+ Add tribunal</button>
        <span className="admin__count">
          {loading && !directory ? 'Loading…' : `${visible.length} record${visible.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {error && !directory && (
        <p className="admin__hint admin__hint--error">
          {error} <button type="button" className="btn-outline btn-outline--sm" onClick={reload}>Retry</button>
        </p>
      )}

      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr>
              <th>Tribunal</th><th>Type</th><th>Location</th><th>Phone</th><th>Amount of debt</th><th>Stations</th><th />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && directory && (
              <tr><td colSpan={7} className="admin__empty">No tribunals added yet</td></tr>
            )}
            {visibleRows.map(r => (
              <tr key={r.id}>
                <td className="admin__multiline"><strong>{r.name}</strong></td>
                <td>{KIND_LABEL[r.kind] || r.kind}</td>
                <td className="admin__multiline">{r.location || '—'}</td>
                <td>{r.phone || '—'}</td>
                <td className="admin__multiline">{r.amountLabel || '—'}</td>
                <td>{r.kind === 'BENCH' ? (r.stations || []).length : '—'}</td>
                <td className="admin__actions">
                  <button type="button" className="btn-outline btn-outline--sm" onClick={() => startEdit(r)}>Edit</button>
                  <button type="button" className="btn-outline btn-outline--sm btn-outline--danger" onClick={() => remove(r)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SeeMore remaining={rowsRemaining} onClick={showMoreRows} step={rowsStep} />

      {/* Add / edit dialog */}
      {editing && (
        <ModalPortal>
          <div className="overlay" {...overlayHandlers}>
            <div className="modal modal--md" onClick={e => e.stopPropagation()}>
              <h3 className="section-title">{editing.isNew ? 'Add tribunal' : 'Edit tribunal'}</h3>

              <div className="admin__form">
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <Dropdown
                    className="form-input"
                    value={form.kind}
                    disabled={!editing.isNew}
                    onChange={e => patch('kind', e.target.value)}
                  >
                    {KINDS.map(k => (
                      <option key={k.value} value={k.value} disabled={k.unique && takenKinds.has(k.value)}>
                        {k.label}
                      </option>
                    ))}
                  </Dropdown>
                </div>

                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-input" value={form.phone} onChange={e => patch('phone', e.target.value)} />
                </div>

                <div className="form-group admin__form-group--full">
                  <label className="form-label">Name *</label>
                  <input
                    className={`form-input${errors.name ? ' form-input--error' : ''}`}
                    value={form.name}
                    onChange={e => patch('name', e.target.value)}
                  />
                  {errors.name && <p className="admin__hint admin__hint--error">{errors.name}</p>}
                </div>

                <div className="form-group admin__form-group--full">
                  <label className="form-label">Location</label>
                  <input className="form-input" value={form.location} onChange={e => patch('location', e.target.value)} />
                </div>

                {form.kind !== 'APPELLATE' && (
                  <div className="form-group admin__form-group--full">
                    <label className="form-label">Amount of debt</label>
                    <input
                      className="form-input"
                      value={form.amountLabel}
                      onChange={e => patch('amountLabel', e.target.value)}
                      placeholder="e.g. Less than one hundred crore rupees."
                    />
                  </div>
                )}

                {form.kind === 'BENCH' && (
                  <div className="form-group admin__form-group--full">
                    <label className="form-label">Districts covered</label>
                    <input
                      className="form-input"
                      value={form.districtsLabel}
                      onChange={e => patch('districtsLabel', e.target.value)}
                    />
                  </div>
                )}

                {form.kind === 'HIGH_VALUE' && (
                  <div className="form-group admin__form-group--full">
                    <label className="form-label">Note shown with the result</label>
                    <textarea
                      className="form-input"
                      rows={3}
                      value={form.note}
                      onChange={e => patch('note', e.target.value)}
                    />
                  </div>
                )}

                {form.kind === 'BENCH' && (
                  // Police stations that fall under this bench
                  <PoliceStationLinkPicker
                    value={form.stationIds}
                    onChange={v => patch('stationIds', v)}
                    hint="Stations come from the Police Directory. A police station can belong to only one bench."
                  />
                )}
              </div>

              <div className="form-actions">
                <button type="button" className="btn-outline" onClick={closeEditor}>Cancel</button>
                <button type="button" className="btn-gold" onClick={save} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  )
}
