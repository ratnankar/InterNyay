import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import { useCourts, getCourtNames } from '../../constants/courts'
import { validityError, formatIsoDate } from '../../utils/rosterUtils'
import { formatDate } from '../../utils/dateUtils'
import ArchiveTree from '../common/ArchiveTree'
import SeeMoreList from '../common/SeeMoreList'
import useOverlayClose from '../../hooks/useOverlayClose'
import ValidityCell from '../common/ValidityCell'
import CourtFields, { firstDistrict } from './CourtFields'
import DistrictPdfManager from './DistrictPdfManager'
import JudgeSearchSelect from './JudgeSearchSelect'
import PoliceStationPicker from './PoliceStationPicker'
import ValidityFields from './ValidityFields'
import { getErrorMessage } from '../../utils/errorMessages'
import { confirmDialog } from '../../utils/confirmDialog'
import ModalPortal from '../../components/common/ModalPortal'
import SearchInput from '../common/SearchInput'

const issuedDate = row => row.issuedOn

// Blank form for a new bail roster entry, starting on the first court
function emptyForm() {
  return {
    issuedOn: formatDate(new Date()),
    court: getCourtNames()[0] || '',
    district: firstDistrict(getCourtNames()[0]),
    officers: [],
    linkOne: null,
    linkTwo: null,
    policeStationAgencies: '',
    fromDate: '',
    tillDate: '',
    furtherOrder: false,
  }
}

// Checks the form: at least one officer or link, two different link judges, and valid dates
function validate(form) {
  const errors = {}

  if (form.officers.length === 0 && !form.linkOne && !form.linkTwo) {
    errors.officers = 'Search and add at least one judicial officer from the Judges List'
  }

  if (form.linkOne && form.linkTwo && form.linkOne.id === form.linkTwo.id) {
    errors.linkTwo = 'Link 1 and Link 2 must be two different judicial officers'
  }

  if (!form.issuedOn) errors.issuedOn = 'Enter the date this roster came'

  const dateError = validityError(form)
  if (dateError) errors.validity = dateError

  return errors
}

// Hint shown when a linked judge has no virtual court link in the Judges List
const linkHint = judge =>
  judge && !judge.virtualCourtLink
    ? `${judge.name} has no virtual court hearing link in the Judges List yet — add it there and it shows up here automatically.`
    : undefined

// Table cell showing a judge's name, designation and a warning if they have no hearing link
function JudgeCell({ judge }) {
  if (!judge) return '—'
  return (
    <>
      <strong>{judge.name}</strong>
      <span className="qa-subtext">{judge.designation || 'Judge'}</span>
      {!judge.virtualCourtLink && <span className="qa-subtext">No hearing link on Judges List</span>}
    </>
  )
}

// Admin screen to manage the bail roster: list, search, add, edit and delete entries
export default function BailRosterAdmin() {
  useCourts()
  const { addToast } = useApp()

  // Roster rows, loading flag and search text
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(false)
  const [search,  setSearch]  = useState('')
  // Entry being edited (null when the editor is closed), its validation errors and the saving flag
  const [editing, setEditing] = useState(null)
  const [errors,  setErrors]  = useState({})
  const [saving,  setSaving]  = useState(false)

  // Closes the editor, also when the backdrop is clicked
  const closeEditor = useCallback(() => setEditing(null), [])
  const overlayHandlers = useOverlayClose(closeEditor, { backdrop: false })

  // Fetches the roster from the backend
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.bailRoster.list()
      setRows(Array.isArray(res) ? res : [])
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not load the bail roster'), 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  // Rows that match the search text in any of the searchable fields
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r =>
      [
        r.policeStationAgencies, r.court, r.district, r.judicialOfficersText,
        ...(r.judicialOfficers || []).map(j => j.name),
        r.linkOneJudge?.name, r.linkTwoJudge?.name,
      ]
        .filter(Boolean)
        .some(v => v.toLowerCase().includes(q))
    )
  }, [rows, search])

  // Opens the editor with a blank form, or with the row's values when editing
  function startEdit(row) {
    const form = emptyForm()

    if (row) {
      form.issuedOn = row.issuedOn || form.issuedOn
      form.court = row.court
      form.district = row.district
      form.officers = row.judicialOfficers || []
      form.linkOne = row.linkOneJudge || null
      form.linkTwo = row.linkTwoJudge || null
      form.policeStationAgencies = row.policeStationAgencies || ''
      form.fromDate = row.fromDate || ''
      form.tillDate = row.tillDate || ''
      form.furtherOrder = !!row.furtherOrder
    }

    setErrors({})
    setEditing({
      id: row?.id ?? null,
      isNew: !row,
      form,
    })
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

  // Sets Link 1 or Link 2 judge
  function setLink(which, judge) {
    const key = which === 1 ? 'linkOne' : 'linkTwo'
    setEditing(s => ({
      ...s,
      form: { ...s.form, [key]: judge },
    }))
    setErrors(errs => ({ ...errs, linkTwo: undefined, officers: undefined }))
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
    body.append('court', f.court)
    body.append('district', f.district)
    f.officers.forEach(j => body.append('judicialOfficerIds', String(j.id)))
    if (f.linkOne) body.append('linkOneJudgeId', String(f.linkOne.id))
    if (f.linkTwo) body.append('linkTwoJudgeId', String(f.linkTwo.id))
    body.append('policeStationAgencies', f.policeStationAgencies.trim())
    if (f.fromDate) body.append('fromDate', f.fromDate)
    if (!f.furtherOrder && f.tillDate) body.append('tillDate', f.tillDate)
    body.append('furtherOrder', String(f.furtherOrder))

    setSaving(true)
    try {
      if (editing.isNew) await api.bailRoster.create(body)
      else               await api.bailRoster.update(editing.id, body)

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
    if (!await confirmDialog('Delete this bail roster entry?')) return
    try {
      await api.bailRoster.remove(row.id)
      addToast('Deleted')
      load()
    } catch (e) {
      addToast(getErrorMessage(e, 'Delete failed'), 'error')
    }
  }

  const form = editing?.form

  return (
    <>
      {/* Upload area for the district bail roster PDFs */}
      <DistrictPdfManager section="BAIL_ROSTER" />

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
          <p className="admin__empty">{loading ? 'Loading…' : 'No bail roster entries added yet'}</p>
        </div>
      ) : (
        <ArchiveTree
  stateKey="bail"
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
                    <th>Came on</th><th>District · Court</th><th>Judicial officer</th><th>Police stations &amp; agencies</th>
                    <th>Link 1 judicial officer</th><th>Link 2 judicial officer</th><th>Valid</th><th />
                  </tr>
                </thead>
                <tbody>
                  {shown.map(r => (
                    <tr key={r.id}>
                      <td>{r.issuedOn ? formatIsoDate(r.issuedOn) : '—'}</td>
                      <td>{r.district === r.court ? r.court : `${r.district} · ${r.court}`}</td>
                      <td className="admin__multiline">
                        {(r.judicialOfficers || []).length > 0
                          ? r.judicialOfficers.map(j => j.name).join('\n')
                          : r.judicialOfficersText || '—'}
                      </td>
                      <td className="admin__multiline">{r.policeStationAgencies || '—'}</td>
                      <td><JudgeCell judge={r.linkOneJudge} /></td>
                      <td><JudgeCell judge={r.linkTwoJudge} /></td>
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
              <h3 className="section-title">{editing.isNew ? 'Add bail roster entry' : 'Edit bail roster entry'}</h3>

              <div className="admin__form">
                <CourtFields
                  court={form.court}
                  district={form.district}
                  onChange={court => patchForm(court, [])}
                />

                <JudgeSearchSelect
                  label="Name of judicial officer"
                  required
                  multiple
                  maxItems={1}
                  value={form.officers}
                  onChange={officers => patchForm({ officers }, ['officers'])}
                  districtScope={form.district}
                  showDistrictToggle={false}
                  error={errors.officers}
                  hint="Type the judge’s name to search the Judges List."
                />

                <JudgeSearchSelect
                  label="Link 1 judicial officer"
                  value={form.linkOne}
                  onChange={judge => setLink(1, judge)}
                  districtScope={form.district}
                  showDistrictToggle={false}
                  hint={linkHint(form.linkOne)}
                />

                <JudgeSearchSelect
                  label="Link 2 judicial officer"
                  value={form.linkTwo}
                  onChange={judge => setLink(2, judge)}
                  districtScope={form.district}
                  showDistrictToggle={false}
                  error={errors.linkTwo}
                  hint={errors.linkTwo ? undefined : linkHint(form.linkTwo)}
                />

                <PoliceStationPicker
                  label="Name of the police station & investigation agencies"
                  value={form.policeStationAgencies}
                  onChange={v => patchForm({ policeStationAgencies: v })}
                  hint="Type to search the police directory as you go — a name that isn't in the directory (e.g. CBI, ED) can still be added as typed."
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
