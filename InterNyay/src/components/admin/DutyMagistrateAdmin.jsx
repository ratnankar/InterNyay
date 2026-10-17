import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import { formatIsoDate, parseDateList, serializeDateList, validityError } from '../../utils/rosterUtils'
import useOverlayClose from '../../hooks/useOverlayClose'
import { formatDate } from '../../utils/dateUtils'
import ArchiveTree from '../common/ArchiveTree'
import SeeMoreList from '../common/SeeMoreList'
import DateChips from '../common/DateChips'
import ValidityCell from '../common/ValidityCell'
import DistrictPdfManager from './DistrictPdfManager'
import DateListField from './DateListField'
import JudgeSearchSelect, { judgeSub } from './JudgeSearchSelect'
import ValidityFields from './ValidityFields'
import { getErrorMessage } from '../../utils/errorMessages'
import { confirmDialog } from '../../utils/confirmDialog'
import ModalPortal from '../../components/common/ModalPortal'
import SearchInput from '../common/SearchInput'

const issuedDate = row => row.issuedOn

// Blank form for a new duty magistrate entry
function emptyForm() {
  return {
    issuedOn: formatDate(new Date()),
    judge: null,
    workingDays: [''],
    holidays: [''],
    fromDate: '',
    tillDate: '',
    furtherOrder: false,
  }
}

// Checks the form: a judge is selected, no date is both a working day and a holiday, and the validity dates are right
function validate(form) {
  const errors = {}

  if (!form.judge) errors.judge = 'Search and select the duty magistrate from the Judges List'

  const working = new Set(form.workingDays.filter(Boolean))
  const clash = [...new Set(form.holidays.filter(d => working.has(d)))]
  if (clash.length > 0) {
    errors.holidays = `${clash.map(formatIsoDate).join(', ')} ${clash.length === 1 ? 'is' : 'are'} also picked as a working day`
  }

  if (!form.issuedOn) errors.issuedOn = 'Enter the date this roster came'

  const dateError = validityError(form)
  if (dateError) errors.validity = dateError

  return errors
}

// Admin screen to manage duty magistrate entries: list, search, add, edit and delete
export default function DutyMagistrateAdmin() {
  const { addToast } = useApp()

  // Entries, loading flag and search text
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(false)
  const [search,  setSearch]  = useState('')
  // Entry being edited (null when closed), its validation errors and the saving flag
  const [editing, setEditing] = useState(null)
  const [errors,  setErrors]  = useState({})
  const [saving,  setSaving]  = useState(false)

  // Closes the editor, also when the backdrop is clicked
  const closeEditor = useCallback(() => setEditing(null), [])
  const overlayHandlers = useOverlayClose(closeEditor, { backdrop: false })

  // Fetches the duty magistrate entries
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.dutyMagistrate.list()
      setRows(Array.isArray(res) ? res : [])
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not load the duty magistrate roster'), 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  // Rows matching the search in judge, designation, court room, court or district
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r =>
      [r.judgeName, r.designation, r.courtRoomNo, r.court, r.district]
        .filter(Boolean)
        .some(v => v.toLowerCase().includes(q))
    )
  }, [rows, search])

  // Opens the editor with a blank form or the selected entry's values
  function startEdit(row) {
    const form = emptyForm()

    if (row) {
      const working = parseDateList(row.workingDay)
      const holidays = parseDateList(row.holiday)

      form.judge = row.judgeId
        ? {
            id: row.judgeId,
            name: row.judgeName,
            designation: row.designation,
            court: row.court,
            district: row.district,
            courtRoomNo: row.courtRoomNo,
          }
        : null
      form.issuedOn = row.issuedOn || form.issuedOn
      form.workingDays = working.dates.length ? working.dates : ['']
      form.holidays = holidays.dates.length ? holidays.dates : ['']
      form.fromDate = row.fromDate || ''
      form.tillDate = row.tillDate || ''
      form.furtherOrder = !!row.furtherOrder
    }

    setErrors({})
    setEditing({ id: row?.id ?? null, isNew: !row, form })
  }

  // Updates form fields and clears the errors for them
  function patchForm(patch, clearKeys = Object.keys(patch)) {
    setEditing(s => ({ ...s, form: { ...s.form, ...patch } }))
    setErrors(errs => {
      const next = { ...errs }
      clearKeys.forEach(k => { next[k] = undefined })
      return next
    })
  }

  // Validates, then sends the entry as form data to create or update it
  async function save() {
    if (!editing) return

    const found = validate(editing.form)
    if (Object.keys(found).length > 0) {
      setErrors(found)
      addToast('Fix the highlighted fields before saving', 'error')
      return
    }

    const f = editing.form
    const body = new FormData()
    body.append('issuedOn', f.issuedOn)
    body.append('judgeId', String(f.judge.id))
    body.append('workingDay', serializeDateList(f.workingDays))
    body.append('holiday', serializeDateList(f.holidays))
    if (f.fromDate) body.append('fromDate', f.fromDate)
    if (!f.furtherOrder && f.tillDate) body.append('tillDate', f.tillDate)
    body.append('furtherOrder', String(f.furtherOrder))

    setSaving(true)
    try {
      if (editing.isNew) await api.dutyMagistrate.create(body)
      else               await api.dutyMagistrate.update(editing.id, body)

      addToast('Saved')
      setEditing(null)
      load()
    } catch (e) {
      addToast(getErrorMessage(e, 'Save failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  // Deletes an entry after confirmation
  async function remove(row) {
    if (!await confirmDialog(`Delete the duty magistrate entry for "${row.judgeName}"?`)) return
    try {
      await api.dutyMagistrate.remove(row.id)
      addToast('Deleted')
      load()
    } catch (e) {
      addToast(getErrorMessage(e, 'Delete failed'), 'error')
    }
  }

  const form = editing?.form

  return (
    <>
      <DistrictPdfManager section="DUTY_MAGISTRATE" />

      {/* Search box, add button and entry count */}
      <div className="admin__toolbar">
        <SearchInput placeholder="Search…" value={search} onChange={setSearch} />
        <button type="button" className="btn-gold" onClick={() => startEdit(null)}>+ Add entry</button>
        <span className="admin__count">
          {loading ? 'Loading…' : `${visible.length} entr${visible.length === 1 ? 'y' : 'ies'}`}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="admin__table-wrap">
          <p className="admin__empty">{loading ? 'Loading…' : 'No duty magistrate entries added yet'}</p>
        </div>
      ) : (
        <ArchiveTree
  stateKey="duty"
          items={visible}
          getDate={issuedDate}
          forceOpen={!!search.trim()}
          renderItems={monthItems => (
            <SeeMoreList items={monthItems} step={25}>
            {shown => (
            <div className="admin__table-wrap">
              <table className="admin__table">
                <thead>
                  <tr>
                    <th>Came on</th><th>District · Court</th><th>Court no.</th><th>Judge</th><th>Designation</th>
                    <th>Working days</th><th>Holidays</th><th>Valid</th><th />
                  </tr>
                </thead>
                <tbody>
                  {shown.map(r => (
                    <tr key={r.id}>
                      <td>{r.issuedOn ? formatIsoDate(r.issuedOn) : '—'}</td>
                      <td>{r.district === r.court ? r.court : `${r.district} · ${r.court}`}</td>
                      <td>{r.courtRoomNo || '—'}</td>
                      <td>
                        {r.judgeName}
                        {r.judgeId && <span className="admin__pill admin__pill--gold admin__pill--inline">Linked</span>}
                      </td>
                      <td>{r.designation || '—'}</td>
                      <td><DateChips value={r.workingDay} tone="work" /></td>
                      <td><DateChips value={r.holiday} tone="holiday" /></td>
                      <td><ValidityCell entry={r} /></td>
                      <td className="admin__actions">
                        <button type="button" className="btn-outline btn-outline--sm" onClick={() => startEdit(r)}>Edit</button>
                        <button type="button"
                          className="btn-outline btn-outline--sm btn-outline--danger"
                          onClick={() => remove(r)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
            </SeeMoreList>
          )}
        />
      )}

      {/* Add / edit dialog */}
      {editing && (
        <ModalPortal>
          <div className="overlay" {...overlayHandlers}>
            <div className="modal modal--md" onClick={e => e.stopPropagation()}>
              <h3 className="section-title">
                {editing.isNew ? 'Add duty magistrate entry' : 'Edit duty magistrate entry'}
              </h3>

              <div className="admin__form">
                <JudgeSearchSelect
                  label="Duty magistrate (from Judges List)"
                  required
                  value={form.judge}
                  onChange={judge => patchForm({ judge }, ['judge'])}
                  error={errors.judge}
                  hint={
                    form.judge
                      ? `${judgeSub(form.judge)} — court, court number, name and designation come from the Judges List and update automatically when that judge is edited.`
                      : 'Type the judge’s name to search the Judges List.'
                  }
                />

                <div className="form-group">
                  <label className="form-label">Date this roster came *</label>
                  <input
                    className={`form-input${errors.issuedOn ? ' form-input--error' : ''}`}
                    type="date"
                    value={form.issuedOn}
                    onChange={e => patchForm({ issuedOn: e.target.value })}
                  />
                  {errors.issuedOn && <p className="admin__hint admin__hint--error">{errors.issuedOn}</p>}
                  <p className="admin__hint">The roster comes once a month — it is filed under this date's month.</p>
                </div>

                <ValidityFields
                  form={form}
                  error={errors.validity}
                  onChange={patch => patchForm(patch, ['validity'])}
                />

                {/* Working days list; the next one is the holidays list */}
                <DateListField
                  label="Working days"
                  addLabel="Add one more working day"
                  dates={form.workingDays}
                  onChange={workingDays => patchForm({ workingDays }, ['holidays'])}
                />

                <DateListField
                  label="Holidays"
                  addLabel="Add one more holiday"
                  dates={form.holidays}
                  error={errors.holidays}
                  onChange={holidays => patchForm({ holidays }, ['holidays'])}
                />
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
