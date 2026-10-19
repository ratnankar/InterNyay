import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import { useCourts, getCourtNames, courtDistrictLabel } from '../../constants/courts'
import useImageCrop from '../../hooks/useImageCrop'
import { indianPhoneError } from '../../utils/validators'
import useOverlayClose from '../../hooks/useOverlayClose'
import JudgeCard from '../common/JudgeCard'
import CopyButton from '../common/CopyButton'
import CourtFields, { firstDistrict } from './CourtFields'
import CourtPlaceFields from './CourtPlaceFields'
import CourtNoHistoryEditor from './CourtNoHistoryEditor'
import ChangeJudgeModal from './ChangeJudgeModal'
import JudgeProfilePicker from './JudgeProfilePicker'
import DistrictPdfManager from './DistrictPdfManager'
import PoliceStationPicker from './PoliceStationPicker'
import Dropdown from '../common/Dropdown'

import Icon from '../common/Icon'
import useUnsavedGuard from '../../hooks/useUnsavedGuard'
import { getErrorMessage } from '../../utils/errorMessages'
import useSeeMore from '../../hooks/useSeeMore'
import SeeMore from '../common/SeeMore'
import { confirmDialog } from '../../utils/confirmDialog'
import ModalPortal from '../../components/common/ModalPortal'
import useSessionState from '../../hooks/useSessionState'
import SearchInput from '../common/SearchInput'
import ClearableDateInput from '../common/ClearableDateInput'
import PlaceGroupedGrid, { sortByPlace, buildingKey } from './PlaceGroupedGrid'
// Patterns used to check the court email and the virtual court link
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LINK_PATTERN = /^https?:\/\/\S+$/

// Text inputs of the listing form: key, label, whether required and input type.
// The judge's name and photo are not here, they belong to the judge (Judges section)
const TEXT_FIELDS = [
  { key: 'designation',       label: 'Designation',                  required: true },
  { key: 'vcMeetingId',       label: 'VC meeting ID' },
  { key: 'courtEmail',        label: 'Court email ID',               type: 'email' },
  { key: 'virtualCourtLink',  label: 'Virtual court hearing link',   type: 'url' },
  { key: 'courtReaderName',   label: 'Court reader name' },
  { key: 'courtReaderPhone', label: 'Court reader mobile number',   type: 'tel' },
]

// Blank form for a new listing
function emptyForm() {
  const form = {
    court: getCourtNames()[0] || '',
    district: firstDistrict(getCourtNames()[0]),
    building: '',
    floor: '',
    courtRoomNo: '',
    jurisdiction: '',
    courtNoFrom: '',
  }
  TEXT_FIELDS.forEach(f => { form[f.key] = '' })
  return form
}

// Checks required fields, the email, the hearing link and the court reader's mobile number
function validate(form) {
  const errors = {}

  TEXT_FIELDS.forEach(f => {
    if (f.required && !form[f.key].trim()) errors[f.key] = `${f.label} is required`
  })

  if (form.courtEmail.trim() && !EMAIL_PATTERN.test(form.courtEmail.trim())) {
    errors.courtEmail = 'Enter a valid email address'
  }

  if (form.virtualCourtLink.trim() && !LINK_PATTERN.test(form.virtualCourtLink.trim())) {
    errors.virtualCourtLink = 'Link must start with http:// or https://'
  }

  const phoneError = indianPhoneError(form.courtReaderPhone)
  if (phoneError) errors.courtReaderPhone = phoneError

  return errors
}

// Admin screen for the listings of the Judges List: a listing is a court seat (court, building, court no., contacts,
// jurisdiction) that always has a judge. Add or edit listings, change the judge of a listing, remove a listing (history is kept)
export default function ListingAdmin() {
  useCourts()
  const { addToast } = useApp()

  // Judges, loading flag, search text and court filter
  const [judges,   setJudges]   = useState([])
  const [loading,  setLoading]  = useState(false)
  const [search,   setSearch]   = useState('')
  const [courtFilter, setCourtFilter] = useState('')
  // Judges (name and photo), which listings to show (all / judge holds more than one court) and the listing whose judge is being changed
  const [profiles, setProfiles] = useState([])
  const [view, setView] = useSessionState('admin_listing_view', 'all')
  const [changing, setChanging] = useState(null)
  // Judge being edited (null when closed), its validation errors and the saving flag
  const [editing,  setEditing]  = useState(null)
  const [errors,   setErrors]   = useState({})
  const [saving,   setSaving]   = useState(false)

  // Closes the editor, also when the backdrop is clicked
  const closeEditor = useCallback(() => setEditing(null), [])
  const overlayHandlers = useOverlayClose(closeEditor, { backdrop: false })

  // Fetches the Judges List
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [res, people] = await Promise.all([
        api.judgesList.list({ includeHistory: true }),
        api.judgeProfiles.list(),
      ])
      setJudges(Array.isArray(res) ? res : [])
      setProfiles(Array.isArray(people) ? people : [])
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not load listings'), 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  // Judges matching the court filter and the search text
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()

    return sortByPlace(judges.filter(j => {
      if (courtFilter && j.court !== courtFilter) return false
      if (view === 'multi' && !(j.courtCount > 1)) return false
      if (view === 'vacant' && !j.vacant) return false
      if (!q) return true
      return [j.name, j.designation, j.courtRoomNo, ...(j.courtNoHistory || []).map(r => r.courtRoomNo), j.building, j.floor, j.court, j.district, j.jurisdiction, j.courtReaderName]
        .filter(Boolean)
        .some(v => v.toLowerCase().includes(q))
    }))
  }, [judges, search, courtFilter, view])

  // The courts that have a listing, for the court filter
  const courtOptions = useMemo(
    () => [...new Set(judges.map(j => j.court).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [judges],
  )

  // Show the rows a page at a time; starts again when the search or filter changes
  const rowsStep = 18
  const {
    visible: visibleRows,
    remaining: rowsRemaining,
    showMore: showMoreRows,
    step: rowsRowStep,
  } = useSeeMore(visible, `${search}|${courtFilter}|${view}`, rowsStep, 0, { groupOf: buildingKey })
  // Opens the editor with a blank form or the selected judge's values
  function startEdit(row) {
    const form = emptyForm()

    if (row) {
      TEXT_FIELDS.forEach(f => { form[f.key] = row[f.key] || '' })
      form.court = row.court
      form.district = row.district
      form.building = row.building || ''
      form.floor = row.floor || ''
      form.courtRoomNo = row.courtRoomNo || ''
      form.jurisdiction = row.jurisdiction || ''
    }

    setErrors({})
    setEditing({
      id: row?.id ?? null,
      isNew: !row,
      form,
      baseline: JSON.stringify(form),
      // Judge of a new listing: an existing judge (picked) or a new one (name and photo)
      judgeMode: 'existing',
      picked: null,
      newJudgeName: '',
      newJudgePhoto: '',
      // The judge of an existing listing, shown read only
      judgeName: row?.name || '',
      originalCourtNo: row?.courtRoomNo || '',
      originalBuilding: row?.building || '',
      originalFloor: row?.floor || '',
      // Ticked when the change fixes a wrongly saved place instead of moving the judge
      correction: false,
      // Court and district as saved: the past court number records belong to these
      savedCourt: row?.court || '',
      savedDistrict: row?.district || '',
      history: row?.courtNoHistory || [],
    })
  }

  // Updates one form field and clears its error
  function setField(key, value) {
    setEditing(s => ({ ...s, form: { ...s.form, [key]: value } }))
    setErrors(errs => ({ ...errs, [key]: undefined }))
  }

  // Updates the court and district together
  // Changing the court or district clears the building and court number, they belong to the old place
  function setCourtFields(fields) {
    setEditing(s => ({ ...s, form: { ...s.form, ...fields, building: '', floor: '', courtRoomNo: '' } }))
  }

  // Updates the building and court number picked from the court table
  function setPlaceFields(fields) {
    setEditing(s => ({ ...s, form: { ...s.form, ...fields } }))
    setErrors(errs => ({ ...errs, courtRoomNo: undefined }))
  }

  // Lets the admin crop the judge's photo before saving
  const { pick: pickJudgePhoto, cropper } = useImageCrop({
    shape: 'portrait',
    title: 'Adjust judge photo',
    onError: msg => addToast(msg, 'error'),
  })

  // Stores the cropped photo on the new judge of the listing being added
  function pickPhoto(file) {
    pickJudgePhoto(file, dataUrl =>
      setEditing(s => ({ ...s, newJudgePhoto: dataUrl })))
  }

  // The judge's court, district, building or court number differs from what is saved (new judges have nothing to compare to)
  const placeDiffers = !!editing && !editing.isNew && (
    editing.form.courtRoomNo.trim() !== editing.originalCourtNo
    || (editing.form.building || '') !== editing.originalBuilding
    || (editing.form.floor || '') !== editing.originalFloor
    || editing.form.court !== editing.savedCourt
    || editing.form.district !== editing.savedDistrict
  )
  // Only the district was filled in for a court room that had none: that completes the place, it is not a move,
  // so there is no effective date to ask for
  const onlyDistrictFilled = !!editing && !editing.isNew && editing.savedDistrict === '' && editing.form.district !== ''
    && editing.form.court === editing.savedCourt
    && editing.form.courtRoomNo.trim() === editing.originalCourtNo
    && (editing.form.building || '') === editing.originalBuilding
    && (editing.form.floor || '') === editing.originalFloor
  const courtNoChanged = placeDiffers && !onlyDistrictFilled

  // Closing with unsaved changes asks Save / Discard / Cancel
  const { requestClose, dialog } = useUnsavedGuard({
    dirty: !!editing && (JSON.stringify(editing.form) !== editing.baseline
      || !!editing.picked || !!editing.newJudgeName.trim() || !!editing.newJudgePhoto),
    onSave: () => save(),
    onDiscard: closeEditor,
  })

  // Validates, then sends the judge as form data (with the photo only if it changed)
  async function save() {
    if (!editing) return

    const found = validate(editing.form)
    if (Object.keys(found).length > 0) {
      setErrors(found)
      addToast('Fix the highlighted fields before saving', 'error')
      return
    }

    // A new listing always has a judge
    if (editing.isNew) {
      if (editing.judgeMode === 'existing' && !editing.picked) {
        addToast('Choose the judge of this listing', 'error')
        return
      }
      if (editing.judgeMode === 'new' && !editing.newJudgeName.trim()) {
        addToast('Enter the name of the new judge', 'error')
        return
      }
    }

    const body = new FormData()
    Object.entries(editing.form).forEach(([k, v]) => {
      if (k === 'courtNoFrom' && (!v || !courtNoChanged || editing.correction)) return
      body.append(k, v.trim())
    })
    if (courtNoChanged && editing.correction) body.append('courtNoCorrection', 'true')
    if (editing.isNew) {
      if (editing.judgeMode === 'existing') {
        body.append('judgeId', editing.picked.id)
      } else {
        body.append('newJudgeName', editing.newJudgeName.trim())
        if (editing.newJudgePhoto) body.append('newJudgePhoto', editing.newJudgePhoto)
      }
    }

    setSaving(true)
    try {
      if (editing.isNew) await api.judgesList.create(body)
      else               await api.judgesList.update(editing.id, body)

      addToast('Saved')
      setEditing(null)
      load()
    } catch (e) {
      addToast(getErrorMessage(e, 'Save failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  // Removes a listing after confirmation. The listing is switched off, its court history is kept
  async function remove(judge) {
    const where = `${courtDistrictLabel(judge.court, judge.district)}${judge.courtRoomNo ? `, Court No. ${judge.courtRoomNo}` : ''}`
    const message = judge.vacant
      ? `Remove the vacant listing (${where})? Its court history is kept.`
      : `Remove the listing of "${judge.name}" (${where})? Its court history is kept, and ${judge.name} stays in the Judges list.`
    if (!await confirmDialog(message)) return
    try {
      await api.judgesList.remove(judge.id)
      addToast('Listing removed')
      load()
    } catch (e) {
      addToast(getErrorMessage(e, 'Remove failed'), 'error')
    }
  }

  return (
    <>
      {/* Photo cropper dialog */}
      {cropper}
      {/* Upload area for the district Judges List PDFs */}
      <DistrictPdfManager section="JUDGES_LIST" />

      {/* Search box, court filter, add button and judge count */}
      <div className="admin__toolbar">
        <SearchInput placeholder="Search…" value={search} onChange={setSearch} />
        <Dropdown className="form-input" wrapperClassName="u-maxw-200" value={courtFilter} onChange={e => setCourtFilter(e.target.value)}>
          <option value="">All courts</option>
          {courtOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </Dropdown>
        <Dropdown className="form-input" wrapperClassName="u-maxw-240" value={view} onChange={e => setView(e.target.value)}>
          <option value="all">All listings</option>
          <option value="multi">Judge holds more than one court</option>
          <option value="vacant">Vacant courts (no judge)</option>
        </Dropdown>
        <button type="button" className="btn-gold" onClick={() => startEdit(null)}>+ Add listing</button>
        <span className="admin__count">
          {loading ? 'Loading…' : `${visible.length} listing${visible.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {visible.length === 0 && !loading
        ? <p className="admin__empty">{view === 'multi' ? 'No judge holds more than one court' : view === 'vacant' ? 'No court is vacant' : 'No listings added yet'}</p>
        : (
          <PlaceGroupedGrid
            byCourt={!courtFilter}
            storageKey="listing"
            entries={visibleRows.map(j => ({
              key: j.id,
              court: j.court,
              district: j.district,
              building: j.building,
              floor: j.floor,
              courtRoomNo: j.courtRoomNo,
              node: (
                <JudgeCard
                  judge={j}
                  tags={j.courtCount > 1 && <span className="qa-tag qa-tag--multi" title={j.otherCourts.join('\n')}>Holds {j.courtCount} courts</span>}
                  note={j.courtCount > 1 && <>Also sits in: {j.otherCourts.join('; ')}</>}
                  actions={
                    <>
                      <button type="button" className="btn-outline btn-outline--sm" onClick={() => startEdit(j)}>Edit</button>
                      <button type="button" className="btn-outline btn-outline--sm" onClick={() => setChanging(j)}>{j.vacant ? 'Assign judge' : 'Change judge'}</button>
                      <button type="button" className="btn-outline btn-outline--sm btn-outline--danger" onClick={() => remove(j)}>Remove</button>
                    </>
                  }
                />
              ),
            }))}
            footer={<SeeMore remaining={rowsRemaining} onClick={showMoreRows} step={rowsRowStep} />}
          />
        )}

      {/* Change the judge of a listing */}
      {changing && (
        <ChangeJudgeModal
          listing={changing}
          judges={profiles}
          listings={judges}
          onClose={() => setChanging(null)}
          onDone={() => { setChanging(null); load() }}
        />
      )}

      {/* Add / edit dialog */}
      {editing && (
        <ModalPortal>
          <div className="overlay" {...overlayHandlers}>
            <div className="modal modal--wide" onClick={e => e.stopPropagation()}>
              <h3 className="section-title">{editing.isNew ? 'Add listing' : 'Edit listing'}</h3>

              <div className="admin__form">
                {/* The judge of the listing: picked or added when the listing is new, read only afterwards */}
                <div className="form-group admin__form-group--full">
                  <label className="form-label">Judge *</label>
                  {editing.isNew ? (
                    <>
                      <div className="change-judge__tabs">
                        <button type="button" className={editing.judgeMode === 'existing' ? 'btn-gold' : 'btn-outline'}
                          onClick={() => setEditing(s => ({ ...s, judgeMode: 'existing' }))}>Existing judge</button>
                        <button type="button" className={editing.judgeMode === 'new' ? 'btn-gold' : 'btn-outline'}
                          onClick={() => setEditing(s => ({ ...s, judgeMode: 'new' }))}>New judge</button>
                      </div>

                      {editing.judgeMode === 'existing' ? (
                        <JudgeProfilePicker
                          judges={profiles}
                          value={editing.picked}
                          onChange={j => setEditing(s => ({ ...s, picked: j }))}
                        />
                      ) : (
                        <div className="judge-new">
                          <input
                            className="form-input"
                            placeholder="Name of the new judge"
                            value={editing.newJudgeName}
                            onChange={e => setEditing(s => ({ ...s, newJudgeName: e.target.value }))}
                          />
                          <div className="admin__photo">
                            {editing.newJudgePhoto
                              ? <img className="admin__photo-preview" src={editing.newJudgePhoto} alt="Judge" />
                              : <span className="admin__photo-preview admin__photo-preview--empty"><Icon name="scale" /></span>}
                            <div className="admin__photo-actions">
                              <input className="form-input" type="file" accept="image/*"
                                onChange={e => { pickPhoto(e.target.files?.[0]); e.target.value = '' }} />
                              {editing.newJudgePhoto && (
                                <button type="button" className="btn-outline btn-outline--sm"
                                  onClick={() => setEditing(s => ({ ...s, newJudgePhoto: '' }))}>Remove photo</button>
                              )}
                            </div>
                          </div>
                          <p className="admin__hint">The new judge is also added to the Judges section.</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="admin__hint">
                      <strong>{editing.judgeName}</strong>. To put a different judge in this listing, close this and use Change judge, so the history stays right.
                    </p>
                  )}
                </div>

                <CourtFields
                  court={editing.form.court}
                  district={editing.form.district}
                  onChange={setCourtFields}
                  allowNoDistrict
                />

                <CourtPlaceFields
                  court={editing.form.court}
                  district={editing.form.district}
                  building={editing.form.building}
                  floor={editing.form.floor}
                  courtNo={editing.form.courtRoomNo}
                  onChange={setPlaceFields}
                />

                {courtNoChanged && (
                  <div className="form-group admin__form-group--full admin__correction">
                    <label className="admin__check">
                      <input
                        type="checkbox"
                        checked={editing.correction}
                        onChange={e => setEditing(s => ({ ...s, correction: e.target.checked }))}
                      />
                      This is a correction (it was saved wrongly), do not keep the old one in the history
                    </label>

                    {!editing.correction && (
                      <>
                        <label className="form-label admin__subfield-label">Court number effective from</label>
                        <ClearableDateInput
                          className="form-input"
                          
                          value={editing.form.courtNoFrom}
                          onChange={e => setField('courtNoFrom', e.target.value)}
                        />
                        <p className="admin__hint">Leave empty to start today. The previous court number is closed the day before and stays in the history.</p>
                      </>
                    )}
                  </div>
                )}

                {TEXT_FIELDS.map(f => (
                  <div className="form-group" key={f.key}>
                    <label className="form-label">{f.label}{f.required ? ' *' : ''}</label>
                    <input
                      className={`form-input${errors[f.key] ? ' form-input--error' : ''}`}
                      type={f.type || 'text'}
                      value={editing.form[f.key]}
                      onChange={e => setField(f.key, e.target.value)}
                      {...(f.key === 'courtReaderPhone' ? { inputMode: 'tel', maxLength: 16 } : {})}
                    />
                    {errors[f.key] && <p className="admin__hint admin__hint--error">{errors[f.key]}</p>}
                    {f.key === 'virtualCourtLink' && editing.form.virtualCourtLink.trim() && !errors.virtualCourtLink && (
                      <p className="admin__hint">
                        <CopyButton text={editing.form.virtualCourtLink.trim()} label="Copy link" title="Copy virtual hearing link" />
                      </p>
                    )}
                  </div>
                ))}

                <PoliceStationPicker
                  value={editing.form.jurisdiction}
                  onChange={v => setField('jurisdiction', v)}
                  hint="Search the police station directory and click to add. Pick a police district to add all its stations at once."
                />

                {!editing.isNew && (
                  <CourtNoHistoryEditor
                    judgeId={editing.id}
                    court={editing.savedCourt}
                    district={editing.savedDistrict}
                    records={editing.history}
                    onChange={history => {
                      setEditing(s => ({ ...s, history }))
                      load()
                    }}
                  />
                )}

                <p className="admin__hint admin__form-group--full">
                  Each district has its own Judges List PDF — upload it under “Judges List PDFs” above the list.
                </p>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-outline" onClick={requestClose}>Cancel</button>
                <button type="button" className="btn-gold" onClick={save} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
      {dialog}
    </>
  )
}