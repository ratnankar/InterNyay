import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import { MISC_TYPE_MANUAL } from '../../constants/data'
import { useCourts, useDefaultCourt, getDistricts, getCourtNosByBuilding, buildingWithFloor, hasNamedDistricts, isHighCourt } from '../../constants/courts'
import { judgesForRoom } from '../../utils/courtMatch'
import { getErrorMessage } from '../../utils/errorMessages'
import { formatDate } from '../../utils/dateUtils'
import { APPLICATION_CHOICES, isValidCnr, resolveApplicationType } from '../misc/miscUtils'
import useUnsavedGuard from '../../hooks/useUnsavedGuard'
import Dropdown from '../common/Dropdown'
import HearingDateInput from '../common/HearingDateInput'
import Icon from '../common/Icon'
import ModalPortal from '../common/ModalPortal'
import Req from '../common/Req'
import SearchPick from '../misc/SearchPick'
import { CaseAddModePrompt } from './NewCasePrompts'
import { cnrCaseTitle, cnrDetailToForm } from '../../utils/cnrPrefill'
import ClearableDateInput from '../common/ClearableDateInput'

// A court no. in the dropdown is identified by building, floor and number, because the same number can be used in several buildings
const KEY_SEP = '\u0001'
const roomKey = (building, floor, courtNo) => [building || '', floor || '', courtNo || ''].join(KEY_SEP)

// Form values when the popup opens
const emptyForm = () => ({
  mode: 'EXISTING',          // EXISTING: a case the advocate already has. NEW: the case is created with the application
  caseId: null,
  linkedCaseId: null,  // New case only, optional: an existing case to link the application to
  clientId: null,
  caseTitle: '',
  caseNo: '',
  cnrNo: '',
  court: '',
  district: '',
  courtNo: '',
  building: '',
  floor: '',
  applicationChoice: '',
  applicationCustom: '',
  filingDate: formatDate(new Date()),
  hearingDate: '',
})

// Popup to add a misc. application, either in a case the advocate already has or in a new case
export default function AddMiscApplicationModal({ onClose, onCreated }) {
  const { cases, clients, setCases, bumpHearings, addToast, setShowAddClient } = useApp()
  const { courtNames, highCourts } = useCourts()
  const preferred = useDefaultCourt()

  const [form, setForm] = useState(emptyForm)
  const [applicationFile, setApplicationFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [reading, setReading] = useState(false)

  const startSignature = useRef(JSON.stringify(emptyForm()))
  const set = patch => setForm(f => ({ ...f, ...patch }))

  // Court rooms (with the judge sitting in each) of the chosen court and district, for the Court No. / Judge field.
  // The cause list is looked up by court room, so an application with a CNR needs it
  const [courtNumbers, setCourtNumbers] = useState([])
  const [judgesLoading, setJudgesLoading] = useState(false)
  const roomCourt = form.court
  const roomDistrict = form.district
  useEffect(() => {
    if (form.mode !== 'NEW' || !roomCourt || (hasNamedDistricts(roomCourt) && !roomDistrict)) {
      setCourtNumbers([])
      setJudgesLoading(false)
      return undefined
    }
    let alive = true
    setJudgesLoading(true)
    api.judgesList.courtNumbers({ court: roomCourt, district: roomDistrict })
      .then(rows => { if (alive) setCourtNumbers(Array.isArray(rows) ? rows : []) })
      .catch(() => { if (alive) setCourtNumbers([]) })
      .finally(() => { if (alive) setJudgesLoading(false) })
    return () => { alive = false }
  }, [form.mode, roomCourt, roomDistrict])

  const courtNoGroups = useMemo(() => getCourtNosByBuilding(roomCourt, roomDistrict), [roomCourt, roomDistrict, courtNumbers])

  // "Court No." and the number, then the judge(s) sitting in that room
  function roomLabel(g, r) {
    const names = [...new Set(
      judgesForRoom(courtNumbers, { courtNo: r.courtNo, building: g.building, floor: r.floor })
        .map(j => (j.judgeName || '').trim())
        .filter(Boolean)
    )]
    return names.length ? `Court No. ${r.courtNo} — ${names.join(' / ')}` : `Court No. ${r.courtNo}`
  }

  // CNR typed in the New case form: once it is complete, eCourts is asked for the case and its details fill the form.
  // looking: the CNR being read now. fetched: what the last read of eCourts filled in, so a changed CNR can take it back
  const [looking, setLooking] = useState('')
  const [fetched, setFetched] = useState(null)
  const askedFor = useRef('')
  const cleanCnr = text => String(text || '').toUpperCase().replace(/[\s-]/g, '')

  function changeCnr(value) {
    const next = cleanCnr(value)
    setForm(f => {
      const patch = { cnrNo: value }
      // The CNR no longer is the one that was read: what it filled in goes again (what was edited since stays)
      if (fetched && next !== fetched.cnr) {
        if (f.caseTitle === fetched.caseTitle) patch.caseTitle = ''
        if (f.caseNo === fetched.caseNo) patch.caseNo = ''
        if (fetched.court && f.court === fetched.court && f.district === fetched.district) {
          patch.court = preferred.court || ''
          patch.district = preferred.court ? preferred.district : ''
          patch.courtNo = ''
          patch.building = ''
          patch.floor = ''
        }
      }
      return { ...f, ...patch }
    })
    if (fetched && next !== fetched.cnr) setFetched(null)
    // A CNR that is being read and is changed is not wanted any more
    if (looking && next !== looking) setLooking('')
    if (next !== askedFor.current) askedFor.current = ''
    if (isValidCnr(next) && next !== askedFor.current && next !== fetched?.cnr) {
      askedFor.current = next
      setLooking(next)
    }
  }

  // eCourts gave the case: its title, number and court fill the form
  function onCnrFetched(detail) {
    const filled = cnrDetailToForm(detail)
    const next = {
      caseTitle: cnrCaseTitle(detail) || '',
      caseNo: detail.caseNo || '',
      court: filled.court || '',
      district: filled.court ? (filled.district || '') : '',
      courtNo: filled.court ? (filled.courtNo || '') : '',
      building: filled.court ? (filled.building || '') : '',
      floor: filled.court ? (filled.floor || '') : '',
    }
    setForm(f => ({
      ...f,
      caseTitle: next.caseTitle || f.caseTitle,
      caseNo: next.caseNo || f.caseNo,
      ...(next.court ? { court: next.court, district: next.district, courtNo: next.courtNo, building: next.building, floor: next.floor } : {}),
    }))
    setFetched({ cnr: cleanCnr(looking), ...next })
    setLooking('')
  }

  // eCourts could not give the case: the form stays as it is, to be filled by hand
  function onCnrFailed(cnr, message) {
    addToast(`${message || 'Could not fetch the case from eCourts'}. Fill in the case details manually.`, 'error')
    setLooking('')
  }

  // A new case starts on the court the advocate usually works at
  const prefilled = useRef(false)
  useEffect(() => {
    if (prefilled.current || !preferred.ready || !preferred.court) return
    prefilled.current = true
    if (form.court) return
    const filled = { ...form, court: preferred.court, district: preferred.district }
    startSignature.current = JSON.stringify(filled)
    setForm(filled)
  }, [preferred.ready, preferred.court, preferred.district])

  // A client added from here (the Add Client window sits on top) is picked automatically
  const waitingForClient = useRef(false)
  const clientIdsBefore = useRef(new Set())
  useEffect(() => {
    if (!waitingForClient.current) return
    const fresh = clients.find(c => !clientIdsBefore.current.has(Number(c.id)))
    if (fresh) {
      waitingForClient.current = false
      setForm(f => ({ ...f, clientId: Number(fresh.id) }))
    }
  }, [clients])

  function addClient() {
    clientIdsBefore.current = new Set(clients.map(c => Number(c.id)))
    waitingForClient.current = true
    setShowAddClient('fromMisc')
  }

  // Cases to choose from: the open ones first, then the others
  const caseChoices = useMemo(() => {
    const isOpen = c => !['Decided', 'Withdrawn'].includes(c.status)
    return [...cases].sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)))
  }, [cases])

  const chosenCase = cases.find(c => Number(c.id) === Number(form.caseId))
  const chosenType = resolveApplicationType(form.applicationChoice, form.applicationCustom)
  const isNew = form.mode === 'NEW'

  const dirty = JSON.stringify(form) !== startSignature.current || !!applicationFile

  // First thing that is missing or wrong, in the order the form is read
  function problem() {
    if (!isNew && !form.caseId) return 'Choose the case the application is filed in'
    if (isNew) {
      if (!form.clientId) return 'Choose the client or add a new one'
      if (!form.caseTitle.trim()) return 'Enter the case title'
      // Case number and CNR are optional; a CNR that is typed must be the full 16 characters
      if (form.cnrNo.trim() && !isValidCnr(form.cnrNo)) return 'The CNR number must be 16 characters'
      if (!form.court) return 'Choose the court'
      if (hasNamedDistricts(form.court) && !form.district) return 'Choose the district'
    }
    if (!form.applicationChoice) return 'Choose the application, or pick "Other" and write its name'
    if (!chosenType) return 'Type the name of the application'
    return ''
  }

  async function save() {
    const msg = problem()
    if (msg) { addToast(msg, 'error'); return }

    setSaving(true)
    let app
    try {
      app = await api.miscApplications.create({
        caseMode: form.mode,
        caseId: isNew ? null : form.caseId,
        clientId: isNew ? form.clientId : null,
        caseTitle: isNew ? form.caseTitle.trim() : null,
        caseNo: isNew ? (form.caseNo.trim() || null) : null,
        cnrNo: isNew ? (form.cnrNo.trim() || null) : null,
        court: isNew ? form.court : null,
        district: isNew ? form.district : null,
        courtNo: isNew ? (form.courtNo || null) : null,
        building: isNew ? (form.building || null) : null,
        floor: isNew ? (form.floor || null) : null,
        linkedCaseId: isNew ? form.linkedCaseId : null,
        applicationType: chosenType,
        filingDate: form.filingDate || null,
        hearingDate: form.hearingDate || null,
      })
    } catch (e) {
      setSaving(false)
      addToast(getErrorMessage(e, 'Could not add the application'), 'error')
      return
    }

    // The application is saved; the files are sent one by one, and a file that fails does not undo it
    let failed = 0
    if (applicationFile) {
      try {
        app = await api.miscApplications.uploadDoc(app.id, applicationFile, 'APPLICATION')
      } catch {
        failed += 1
      }
    }

    // A case created together with the application joins the case list; a hearing date adds to the hearing history
    if (isNew) await addNewCaseToList(app)
    if (form.hearingDate) bumpHearings(app.caseId)

    // Added with a CNR: the hearing history and the orders are read from eCourts right away (also when the application is
    // linked to a case). If eCourts cannot be read now, the Refresh button in the hearing history does it later
    let readNote = ''
    if (isNew && app.portalSynced) {
      setReading(true)
      try {
        await api.cases.refreshHearing(app.caseId)
        app = await api.miscApplications.get(app.id)
        bumpHearings(app.caseId)
      } catch {
        readNote = 'Application added, but eCourts could not be read now. Use Refresh in its hearing history to try again.'
      } finally {
        setReading(false)
      }
    }

    setSaving(false)
    onCreated(app)
    addToast(failed
      ? 'Application added, but the file could not be uploaded. Open it to add it again.'
      : readNote || 'Application added', failed || readNote ? 'error' : undefined)
  }

  // Loads the case that was just created, with the same fee rules as every other case screen
  async function addNewCaseToList(app) {
    try {
      const res = await api.cases.list({ search: form.caseNo.trim() || form.caseTitle.trim(), size: 10 })
      const found = (Array.isArray(res) ? res : res?.content || []).find(c => Number(c.id) === Number(app.caseId))
      if (found) {
        setCases(prev => (prev.some(c => Number(c.id) === Number(found.id)) ? prev : [...prev, { ...found, documents: found.documents || [] }]))
      }
    } catch { /* the case shows up the next time the app loads its data */ }
  }

  const { requestClose, dialog } = useUnsavedGuard({ dirty, onSave: save, onDiscard: onClose })

  const districts = getDistricts(form.court)

  return (
    <>
      <ModalPortal>
        <div className="overlay">
          <div className="modal modal--md misc-modal" onClick={e => e.stopPropagation()}>

            <div className="modal__header">
              <h2 className="modal__title">Add Application</h2>
              <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={requestClose}><Icon name="close" /></button>
            </div>

            {/* Existing case or new case */}
            <div className="misc-modes" role="tablist" aria-label="Case">
              <button type="button" role="tab" aria-selected={!isNew}
                className={!isNew ? 'btn-gold' : 'btn-outline'} onClick={() => set({ mode: 'EXISTING' })}>
                Existing case
              </button>
              <button type="button" role="tab" aria-selected={isNew}
                className={isNew ? 'btn-gold' : 'btn-outline'} onClick={() => set({ mode: 'NEW' })}>
                New case
              </button>
            </div>

            {!isNew && (
              <>
                <SearchPick
                  label="Case"
                  placeholder="Search by case title or number…"
                  items={caseChoices}
                  selectedId={form.caseId}
                  onSelect={c => set({ caseId: Number(c.id), hearingDate: '' })}
                  onClear={() => set({ caseId: null, hearingDate: '' })}
                  matches={(c, q) => (c.title || '').toLowerCase().includes(q) || (c.caseNo || '').toLowerCase().includes(q)}
                  renderMain={c => c.title}
                  renderMeta={c => [c.caseNo, c.clientName].filter(Boolean).join(' • ')}
                  emptyText="You have no cases yet. Use New case to add the application with its case."
                />

                {/* The title is read from the case, it cannot be changed here */}
                {chosenCase && (
                  <div className="u-mt-12">
                    <label className="form-label">Case title</label>
                    <input className="form-input" value={chosenCase.title || ''} readOnly />
                  </div>
                )}
              </>
            )}

            {isNew && (
              <>
                <SearchPick
                  label="Client"
                  placeholder="Search client by name, email or phone…"
                  items={[...clients].sort((a, b) => Number(b.id) - Number(a.id))}
                  selectedId={form.clientId}
                  onSelect={c => set({ clientId: Number(c.id) })}
                  onClear={() => set({ clientId: null })}
                  matches={(c, q) => [c.name, c.email, c.whatsappPhone, c.additionalPhone].some(v => String(v || '').toLowerCase().includes(q))}
                  renderMain={c => c.name}
                  renderMeta={c => c.email || c.whatsappPhone || 'No contact details'}
                  emptyText="No clients yet. Use + Add Client to add your first client."
                  extra={<button type="button" className="btn-add-client" onClick={addClient}><span aria-hidden="true">+</span> Add Client</button>}
                />

                <div className="misc-grid u-mt-12">
                  <div className="misc-grid__wide">
                    <label className="form-label">CNR number</label>
                    <input className="form-input" maxLength={24} placeholder="16-character CNR"
                      autoComplete="off" value={form.cnrNo} onChange={e => changeCnr(e.target.value)} />
                    {looking && <p className="form-hint">Reading the case from eCourts…</p>}
                    {!looking && fetched && <p className="form-hint">Details taken from eCourts. Check them before adding.</p>}
                  </div>

                  <div className="misc-grid__wide">
                    <label className="form-label">Case title<Req /></label>
                    <input className="form-input" maxLength={500} placeholder="e.g. Ramesh Kumar vs State"
                      value={form.caseTitle} onChange={e => set({ caseTitle: e.target.value })} />
                  </div>

                  <div>
                    <label className="form-label">Case number</label>
                    <input className="form-input" maxLength={255} placeholder="e.g. CC 1234/2026"
                      value={form.caseNo} onChange={e => set({ caseNo: e.target.value })} />
                  </div>

                  <div className="misc-grid__wide">
                    <SearchPick
                      label="Case"
                      optional
                      placeholder="Search by case title or number…"
                      items={caseChoices}
                      selectedId={form.linkedCaseId}
                      onSelect={c => set({ linkedCaseId: Number(c.id) })}
                      onClear={() => set({ linkedCaseId: null })}
                      matches={(c, q) => (c.title || '').toLowerCase().includes(q) || (c.caseNo || '').toLowerCase().includes(q)}
                      renderMain={c => c.title}
                      renderMeta={c => [c.caseNo, c.clientName].filter(Boolean).join(' • ')}
                      emptyText="You have no cases yet."
                    />
                  </div>

                  <div>
                    <label className="form-label">Court<Req /></label>
                    <Dropdown className="form-input" value={form.court}
                      onChange={e => {
                        const court = e.target.value
                        set({ court, district: preferred.districtOf(court) || getDistricts(court)[0] || '', courtNo: '', building: '', floor: '' })
                      }}>
                      <option value="">Select Court</option>
                      {courtNames.length > 0 && (
                        <optgroup label="District Courts">
                          {courtNames.map(c => <option key={c} value={c}>{c}</option>)}
                        </optgroup>
                      )}
                      {highCourts.length > 0 && (
                        <optgroup label="High Courts">
                          {highCourts.map(c => <option key={c} value={c}>{c}</option>)}
                        </optgroup>
                      )}
                    </Dropdown>
                  </div>

                  <div>
                    <label className="form-label">District{hasNamedDistricts(form.court) && <Req />}</label>
                    <Dropdown className="form-input" value={form.district}
                      disabled={!hasNamedDistricts(form.court)}
                      onChange={e => set({ district: e.target.value, courtNo: '', building: '', floor: '' })}>
                      {!hasNamedDistricts(form.court) && (
                        <option value={form.district || ''}>
                          {!form.court ? 'Select a court first' : isHighCourt(form.court) ? 'Not applicable' : 'No district'}
                        </option>
                      )}
                      {hasNamedDistricts(form.court) && districts.map(d => <option key={d} value={d}>{d}</option>)}
                    </Dropdown>
                  </div>

                  <div className="misc-grid__wide">
                    <label className="form-label">Court No. / Judge</label>
                    {/* Court rooms come from the court table for the chosen court and district; each shows the judge sitting there */}
                    <Dropdown className="form-input"
                      value={roomKey(form.building, form.floor, form.courtNo)}
                      disabled={!form.court}
                      onChange={e => {
                        const [building = '', floor = '', courtNo = ''] = e.target.value.split(KEY_SEP)
                        set({ courtNo, building, floor })
                      }}>
                      <option value={roomKey('', '', '')}>{form.court ? (judgesLoading ? 'Loading court nos. and judges…' : 'Select Court No. / Judge') : 'Select a court first'}</option>
                      {courtNoGroups.flatMap(g => {
                        const opt = r => (
                          <option key={roomKey(g.building, r.floor, r.courtNo)} value={roomKey(g.building, r.floor, r.courtNo)}>
                            {roomLabel(g, r)}
                          </option>
                        )
                        // No building: plain options. With a building: one group per floor, "Building (Floor)"
                        if (!g.building) return g.rooms.map(opt)
                        const floors = [...new Set(g.rooms.map(r => r.floor))]
                        return floors.map(f => (
                          <optgroup key={`${g.building}|${f}`} label={buildingWithFloor(g.building, f)}>
                            {g.rooms.filter(r => r.floor === f).map(opt)}
                          </optgroup>
                        ))
                      })}
                    </Dropdown>
                  </div>
                </div>
              </>
            )}

            {/* The application itself */}
            <div className="misc-section">
              <div>
                <label className="form-label">Application<Req /></label>
                <Dropdown className="form-input" value={form.applicationChoice}
                  onChange={e => set({ applicationChoice: e.target.value })}>
                  <option value="">Select application</option>
                  {APPLICATION_CHOICES.map(t => <option key={t} value={t}>{t}</option>)}
                </Dropdown>
              </div>

              {form.applicationChoice === MISC_TYPE_MANUAL && (
                <div className="u-mt-12">
                  <label className="form-label">Application name<Req /></label>
                  <input className="form-input" maxLength={255} placeholder="Type the application name…"
                    value={form.applicationCustom} onChange={e => set({ applicationCustom: e.target.value })} />
                </div>
              )}

              <div className="misc-grid u-mt-12">
                <div>
                  <label className="form-label">Filing date</label>
                  <ClearableDateInput className="form-input"  value={form.filingDate}
                    onChange={e => set({ filingDate: e.target.value })} />
                </div>
                <div>
                  <label className="form-label">Next hearing date</label>
                  <HearingDateInput value={form.hearingDate} onChange={v => set({ hearingDate: v })}
                    placeholder="Select date" caseId={isNew ? null : form.caseId} />
                </div>
              </div>
            </div>

            <div className="misc-section">
              <label className="form-label">Application file</label>
              <div className="misc-file">
                <input type="file" id="misc-app-file" className="u-hidden"
                  onChange={e => { setApplicationFile(e.target.files?.[0] || null); e.target.value = '' }} />
                <label htmlFor="misc-app-file" className="btn-outline"><Icon name="folder" /> {applicationFile ? 'Change file' : 'Choose file'}</label>
                {applicationFile
                  ? <span className="misc-file__name">{applicationFile.name}
                      <button type="button" className="misc-file__remove" aria-label="Remove file" onClick={() => setApplicationFile(null)}><Icon name="close" /></button>
                    </span>
                  : <span className="doc-group__meta">You can upload it later.</span>}
              </div>
            </div>

            <div className="form-actions">
              <button type="button" className="btn-outline" onClick={requestClose} disabled={saving}>Cancel</button>
              <button type="button" className="btn-gold" onClick={save} disabled={saving}>{reading ? 'Reading eCourts…' : saving ? 'Saving…' : 'Add Application'}</button>
            </div>
          </div>
        </div>
      </ModalPortal>
      {dialog}
      {looking && (
        <CaseAddModePrompt
          key={looking}
          initialCnr={looking}
          hasCnr={cnr => cases.some(c => cleanCnr(c.cnrNo) === cnr)}
          onFetched={onCnrFetched}
          onFailed={onCnrFailed}
          onManual={() => setLooking('')}
          onClose={() => setLooking('')}
        />
      )}
    </>
  )
}
