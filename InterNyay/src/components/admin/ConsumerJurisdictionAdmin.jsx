import { useCallback, useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import useOverlayClose from '../../hooks/useOverlayClose'
import { useConsumerJurisdiction } from '../../hooks/useJurisdictionDirectory'
import Dropdown from '../common/Dropdown'
import PoliceStationLinkPicker from './PoliceStationLinkPicker'
import { getErrorMessage } from '../../utils/errorMessages'
import useSeeMore from '../../hooks/useSeeMore'
import SeeMore from '../common/SeeMore'
import { confirmDialog } from '../../utils/confirmDialog'
import ModalPortal from '../../components/common/ModalPortal'
import SearchInput from '../common/SearchInput'

// Commission types. State and National commissions can exist only once each
const KINDS = [
  { value: 'DISTRICT', label: 'District Commission', unique: false },
  { value: 'STATE',    label: 'State Commission',    unique: true  },
  { value: 'NATIONAL', label: 'National Commission', unique: true  },
]

// Lookup from kind value to its display label
const KIND_LABEL = Object.fromEntries(KINDS.map(k => [k.value, k.label]))

// Blank form for a new commission
function emptyForm() {
  return { kind: 'DISTRICT', name: '', location: '', stationIds: [] }
}

// Admin screen to manage consumer commissions and the police stations linked to district commissions
export default function ConsumerJurisdictionAdmin() {
  const { addToast } = useApp()
  // Commission directory is loaded and shared through the jurisdiction hook
  const { directory, loading, error, reload } = useConsumerJurisdiction()

  // Search text, commission being edited (null when closed), validation errors and saving flag
  const [search,  setSearch]  = useState('')
  const [editing, setEditing] = useState(null)
  const [errors,  setErrors]  = useState({})
  const [saving,  setSaving]  = useState(false)

  // All commissions from the directory
  const rows = useMemo(() => directory?.commissions || [], [directory])

  // Rows matching the search in name, location or police stations
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r =>
      [r.name, r.location, ...(r.stations || [])]
        .filter(Boolean)
        .some(v => v.toLowerCase().includes(q))
    )
  }, [rows, search])


  // Show the rows a page at a time; starts again when the search or filter changes
  const rowsStep = 25
  const {
    visible: visibleRows,
    remaining: rowsRemaining,
    showMore: showMoreRows, step: showMoreRowsStep,
  } = useSeeMore(visible, search, rowsStep)
  // State or National kinds already used by another commission, so they cannot be added twice
  const takenKinds = useMemo(
    () => new Set(rows.filter(r => r.kind !== 'DISTRICT' && r.id !== editing?.id).map(r => r.kind)),
    [rows, editing?.id]
  )

  // Closes the editor, also when the backdrop is clicked
  const closeEditor = useCallback(() => setEditing(null), [])
  const overlayHandlers = useOverlayClose(closeEditor, { backdrop: false })

  // Opens the editor with a blank form or the selected commission's values
  function startEdit(row) {
    const form = emptyForm()
    if (row) {
      form.kind = row.kind
      form.name = row.name || ''
      form.location = row.location || ''
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

  // Validates the name, then creates or updates the commission and refreshes the shared directory
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
      stationIds: f.kind === 'DISTRICT' ? f.stationIds : [],
    }

    setSaving(true)
    try {
      const res = editing.isNew
        ? await api.jurisdiction.consumer.create(body)
        : await api.jurisdiction.consumer.update(editing.id, body)
      useConsumerJurisdiction.publish(res)
      addToast('Saved')
      setEditing(null)
    } catch (e) {
      addToast(getErrorMessage(e, 'Save failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  // Deletes a commission after confirmation; a district commission's station list goes with it
  async function remove(row) {
    if (!await confirmDialog(`Delete ${row.name}?${row.kind === 'DISTRICT' ? ' Its police station list is deleted with it.' : ''}`)) return
    try {
      useConsumerJurisdiction.publish(await api.jurisdiction.consumer.remove(row.id))
      addToast('Deleted')
    } catch (e) {
      addToast(getErrorMessage(e, 'Delete failed'), 'error')
    }
  }

  const form = editing?.form

  return (
    <>
      {/* Search box, add button and record count */}
      <div className="admin__toolbar">
        <SearchInput placeholder="Search commissions or police stations…" value={search} onChange={setSearch} />
        <button type="button" className="btn-gold" onClick={() => startEdit(null)}>+ Add commission</button>
        <span className="admin__count">
          {loading && !directory ? 'Loading…' : `${visible.length} record${visible.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Error shown when the directory could not be loaded */}
      {error && !directory && (
        <p className="admin__hint admin__hint--error">
          {error} <button type="button" className="btn-outline btn-outline--sm" onClick={reload}>Retry</button>
        </p>
      )}

      <div className="admin__table-wrap">
        {/* Commissions table */}
        <table className="admin__table">
          <thead>
            <tr>
              <th>Commission</th><th>Type</th><th>Address</th><th>Stations</th><th />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && directory && (
              <tr><td colSpan={5} className="admin__empty">No commissions added yet</td></tr>
            )}
            {visibleRows.map(r => (
              <tr key={r.id}>
                <td className="admin__multiline"><strong>{r.name}</strong></td>
                <td>{KIND_LABEL[r.kind] || r.kind}</td>
                <td className="admin__multiline">{r.location || '—'}</td>
                <td>{r.kind === 'DISTRICT' ? (r.stations || []).length : '—'}</td>
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
      <SeeMore remaining={rowsRemaining} onClick={showMoreRows} step={showMoreRowsStep} />

      {/* Add / edit dialog */}
      {editing && (
        <ModalPortal>
          <div className="overlay" {...overlayHandlers}>
            <div className="modal modal--md" onClick={e => e.stopPropagation()}>
              <h3 className="section-title">{editing.isNew ? 'Add commission' : 'Edit commission'}</h3>

              <div className="admin__form">
                <div className="form-group admin__form-group--full">
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
                  <label className="form-label">Address</label>
                  <input className="form-input" value={form.location} onChange={e => patch('location', e.target.value)} />
                </div>

                {form.kind === 'DISTRICT' && (
                  <PoliceStationLinkPicker
                    value={form.stationIds}
                    onChange={v => patch('stationIds', v)}
                    hint="Stations come from the Police Directory. A station may appear under more than one commission."
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
