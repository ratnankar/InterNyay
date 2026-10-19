import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import { MISC_TYPE_MANUAL } from '../../constants/data'
import { useCourts, useDefaultCourt, getDistricts, hasNamedDistricts, isHighCourt } from '../../constants/courts'
import { getErrorMessage } from '../../utils/errorMessages'
import { formatDate } from '../../utils/dateUtils'
import { APPLICATION_CHOICES, isValidCnr, resolveApplicationType } from '../misc/miscUtils'
import useUnsavedGuard from '../../hooks/useUnsavedGuard'
import Dropdown from '../common/Dropdown'
import HearingDateInput from '../common/HearingDateInput'
import Icon from '../common/Icon'
import ModalPortal from '../common/ModalPortal'
import Req from '../common/Req'

// How many matches are listed under a search box
const LIST_LIMIT = 6

// Form values when the popup opens
const emptyForm = () => ({
  mode: 'EXISTING',          // EXISTING: a case the advocate already has. NEW: the case is created with the application
  caseId: null,
  clientId: null,
  caseTitle: '',
  caseNo: '',
  cnrNo: '',
  court: '',
  district: '',
  applicationChoice: '',
  applicationCustom: '',
  history: '',
  filingDate: formatDate(new Date()),
  hearingDate: '',
})

// Picks one item of a list by searching it; shows the chosen one with a Change button
function SearchPick({ label, placeholder, items, selectedId, onSelect, onClear, renderMain, renderMeta, matches, extra, emptyText }) {
  const [query, setQuery] = useState('')
  // Suggestions are shown only after the search box is clicked, and hidden again after a pick or a click outside
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  useEffect(() => {
    if (!open) return
    const away = e => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  const selected = items.find(i => Number(i.id) === Number(selectedId))
  const q = query.trim().toLowerCase()

  const shown = useMemo(() => {
    const pool = q ? items.filter(i => matches(i, q)) : items
    return pool.slice(0, LIST_LIMIT)
  }, [items, q, matches])

  return (
    <div className="misc-pick" ref={box}>
      <label className="form-label">{label}<Req /></label>

      {selected ? (
        <div className="misc-pick__chosen">
          <div className="misc-pick__info">
            <p className="misc-pick__name">{renderMain(selected)}</p>
            <p className="misc-pick__meta">{renderMeta(selected)}</p>
          </div>
          <button type="button" className="btn-outline" onClick={() => { setQuery(''); setOpen(false); onClear() }}>Change</button>
        </div>
      ) : (
        <>
          <div className="client-search-row">
            <input
              className="form-input"
              placeholder={placeholder}
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(true) }}
              onClick={() => setOpen(true)}
              onFocus={() => setOpen(true)}
              autoComplete="off"
            />
            {extra}
          </div>

          {open && shown.length > 0 && (
            <div className="client-result-list">
              {shown.map(item => (
                <div key={item.id} className="client-result" onClick={() => { setOpen(false); onSelect(item) }}>
                  <div className="client-result__info">
                    <p className="client-result__name">{renderMain(item)}</p>
                    <p className="client-result__meta">{renderMeta(item)}</p>
                  </div>
                  <button type="button" className="btn-gold client-result__select"
                    onClick={e => { e.stopPropagation(); setOpen(false); onSelect(item) }}>
                    Select
                  </button>
                </div>
              ))}
            </div>
          )}

          {open && shown.length === 0 && (
            <div className="client-not-found">
              <p className="client-not-found__text">{q ? 'Nothing matches your search.' : emptyText}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Popup to add a misc. application, either in a case the advocate already has or in a new case
export default function AddMiscApplicationModal({ onClose, onCreated }) {
  const { cases, clients, setCases, bumpHearings, addToast, setShowAddClient } = useApp()
  const { courtNames, highCourts } = useCourts()
  const preferred = useDefaultCourt()

  const [form, setForm] = useState(emptyForm)
  const [applicationFile, setApplicationFile] = useState(null)
  const [extraFiles, setExtraFiles] = useState([])
  const [saving, setSaving] = useState(false)

  const startSignature = useRef(JSON.stringify(emptyForm()))
  const set = patch => setForm(f => ({ ...f, ...patch }))

  // A new case starts on the court the advocate usually works at
  const prefilled = useRef(false)
  useEffect(() => {
    if (prefilled.current || !preferred.ready || !preferred.court) return
    prefilled.current = true
    setForm(f => (f.court ? f : { ...f, court: preferred.court, district: preferred.district }))
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

  const dirty = JSON.stringify(form) !== startSignature.current || !!applicationFile || extraFiles.length > 0

  // First thing that is missing or wrong, in the order the form is read
  function problem() {
    if (!isNew && !form.caseId) return 'Choose the case the application is filed in'
    if (isNew) {
      if (!form.clientId) return 'Choose the client or add a new one'
      if (!form.caseTitle.trim()) return 'Enter the case title'
      if (!form.caseNo.trim()) return 'Enter the case number'
      if (!isValidCnr(form.cnrNo)) return 'Enter the 16-character CNR number'
      if (!form.court) return 'Choose the court'
      if (hasNamedDistricts(form.court) && !form.district) return 'Choose the district'
    }
    if (!form.applicationChoice) return 'Choose the application, or pick "Type manually" and write its name'
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
        caseNo: isNew ? form.caseNo.trim() : null,
        cnrNo: isNew ? form.cnrNo.trim() : null,
        court: isNew ? form.court : null,
        district: isNew ? form.district : null,
        applicationType: chosenType,
        history: form.history.trim(),
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
    const uploads = [
      ...(applicationFile ? [{ file: applicationFile, role: 'APPLICATION' }] : []),
      ...extraFiles.map(file => ({ file, role: 'ADDITIONAL' })),
    ]
    for (const { file, role } of uploads) {
      try {
        app = await api.miscApplications.uploadDoc(app.id, file, role)
      } catch {
        failed += 1
      }
    }

    // A case created together with the application joins the case list; a hearing date adds to the hearing history
    if (isNew) await addNewCaseToList(app)
    if (form.hearingDate) bumpHearings(app.caseId)

    setSaving(false)
    onCreated(app)
    addToast(failed
      ? `Application added, but ${failed} file${failed === 1 ? '' : 's'} could not be uploaded. Open it to add them again.`
      : 'Application added', failed ? 'error' : undefined)
  }

  // Loads the case that was just created, with the same fee rules as every other case screen
  async function addNewCaseToList(app) {
    try {
      const res = await api.cases.list({ search: form.caseNo.trim(), size: 10 })
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
                    <label className="form-label">Case title<Req /></label>
                    <input className="form-input" maxLength={500} placeholder="e.g. Ramesh Kumar vs State"
                      value={form.caseTitle} onChange={e => set({ caseTitle: e.target.value })} />
                  </div>

                  <div>
                    <label className="form-label">Case number<Req /></label>
                    <input className="form-input" maxLength={255} placeholder="e.g. CC 1234/2026"
                      value={form.caseNo} onChange={e => set({ caseNo: e.target.value })} />
                  </div>

                  <div>
                    <label className="form-label">CNR number<Req /></label>
                    <input className="form-input" maxLength={24} placeholder="16-character CNR"
                      value={form.cnrNo} onChange={e => set({ cnrNo: e.target.value })} />
                  </div>

                  <div>
                    <label className="form-label">Court<Req /></label>
                    <Dropdown className="form-input" value={form.court}
                      onChange={e => {
                        const court = e.target.value
                        set({ court, district: preferred.districtOf(court) || getDistricts(court)[0] || '' })
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
                      onChange={e => set({ district: e.target.value })}>
                      {!hasNamedDistricts(form.court) && (
                        <option value={form.district || ''}>
                          {!form.court ? 'Select a court first' : isHighCourt(form.court) ? 'Not applicable' : 'No district'}
                        </option>
                      )}
                      {hasNamedDistricts(form.court) && districts.map(d => <option key={d} value={d}>{d}</option>)}
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

              <div className="u-mt-12">
                <label className="form-label">History</label>
                <textarea className="form-input misc-history" rows={3} maxLength={5000}
                  placeholder="What has happened so far in this application…"
                  value={form.history} onChange={e => set({ history: e.target.value })} />
                <p className="admin__hint">Shown on the application and added to the case's hearing history on the hearing date.</p>
              </div>

              <div className="misc-grid u-mt-12">
                <div>
                  <label className="form-label">Filing date</label>
                  <input className="form-input" type="date" value={form.filingDate}
                    onChange={e => set({ filingDate: e.target.value })} />
                </div>
                <div>
                  <label className="form-label">Hearing date</label>
                  <HearingDateInput value={form.hearingDate} onChange={v => set({ hearingDate: v })}
                    placeholder="Select hearing date" caseId={isNew ? null : form.caseId} />
                </div>
              </div>
            </div>

            {/* Files: all optional, they can be added later from the application */}
            <div className="misc-section">
              <label className="form-label">Application file (optional)</label>
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

              <label className="form-label u-mt-12">Additional documents (optional)</label>
              <div className="misc-file">
                <input type="file" id="misc-extra-files" className="u-hidden" multiple
                  onChange={e => { setExtraFiles(prev => [...prev, ...Array.from(e.target.files || [])]); e.target.value = '' }} />
                <label htmlFor="misc-extra-files" className="btn-outline"><Icon name="folder" /> Add files</label>
              </div>
              {extraFiles.map((f, i) => (
                <span key={`${f.name}-${i}`} className="misc-file__name">{f.name}
                  <button type="button" className="misc-file__remove" aria-label={`Remove ${f.name}`}
                    onClick={() => setExtraFiles(prev => prev.filter((_, j) => j !== i))}><Icon name="close" /></button>
                </span>
              ))}
            </div>

            <div className="form-actions">
              <button type="button" className="btn-outline" onClick={requestClose} disabled={saving}>Cancel</button>
              <button type="button" className="btn-gold" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Add Application'}</button>
            </div>
          </div>
        </div>
      </ModalPortal>
      {dialog}
    </>
  )
}
