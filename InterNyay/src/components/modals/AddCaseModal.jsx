import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import {
  CASE_NATURES,
  PARTY_SIDES,
  SIDE_ACCUSED,
  SIDE_COMPLAINANT,
  caseTypeOptions,
  composeCaseTitle,
  isNiAct138Complaint,
  isPoliceChallan,
  reliefOptions,
} from '../../constants/caseCatalog'
import { judgesForCourtNo } from '../../utils/courtMatch'
import { hasCorporatePanelClient } from '../../utils/caseClients'
import { useCourts, useDefaultCourt, getDistricts, getCourtNos, hasNamedDistricts, isHighCourt } from '../../constants/courts'
import { CHEQUE_BOUNCE_REASONS, WITHDRAWN_STATUS } from '../../constants/data'
import CaseFeeSection from './CaseFeeSection'
import FileNumbersModal from './FileNumbersModal'
import OpposingPartyModal from './OpposingPartyModal'
import { CaseAgePrompt, ClientSearchPrompt } from './NewCasePrompts'
import useUnsavedGuard from '../../hooks/useUnsavedGuard'
import HearingDateInput from '../common/HearingDateInput'
import PoliceStationInput from '../common/PoliceStationInput'
import SuggestInput from '../common/SuggestInput'
import Dropdown from '../common/Dropdown'
import CaseStatusSelect from '../common/CaseStatusSelect'
import Req from '../common/Req'

import Icon from '../common/Icon'
import ModalPortal from '../../components/common/ModalPortal'
// FIR number, section and police station inputs for police challan cases
function ChallanDetails({ form, setForm }) {

  return (
    <div className="case-challan">
      <p className="case-challan__title">Police Challan Details</p>

      <div>
        <label className="form-label">FIR No.</label>
        <input
          className="form-input"
          placeholder="e.g. 123/2024"
          maxLength={100}
          value={form.firNo}
          onChange={e => setForm(f => ({ ...f, firNo: e.target.value }))}
        />
      </div>

      <div>
        <label className="form-label">Section</label>
        <input
          className="form-input"
          placeholder="e.g. 303(2) BNS"
          maxLength={255}
          value={form.firSection}
          onChange={e => setForm(f => ({ ...f, firSection: e.target.value }))}
        />
      </div>

      <div>
        <label className="form-label">Police Station</label>
        <PoliceStationInput
          placeholder="Start typing a station…"
          maxLength={255}
          value={form.policeStation}
          onChange={policeStation => setForm(f => ({ ...f, policeStation }))}
        />
      </div>
    </div>
  )
}

// Cheque bounce (NI Act 138) inputs: cheque number and date, memo date, bouncing reason, claim amount and notice date
function ChequeDetails({ form, setForm }) {
  // Returns an input handler that updates one field of the case form
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))

  return (
    <div className="case-sec138">
      <p className="case-challan__title">Cheque Dishonour Details (Sec 138 NI Act)</p>

      <div>
        <label className="form-label">Cheque Number</label>
        <input
          className="form-input"
          placeholder="e.g. 004512"
          maxLength={50}
          value={form.chequeNo}
          onChange={set('chequeNo')}
        />
      </div>

      <div>
        <label className="form-label">Cheque Date</label>
        <input className="form-input" type="date" value={form.chequeDate} onChange={set('chequeDate')} />
      </div>

      <div>
        <label className="form-label">Memo Date</label>
        <input className="form-input" type="date" value={form.memoDate} onChange={set('memoDate')} />
      </div>

      <div>
        <label className="form-label">Bouncing Reason</label>
        <SuggestInput
          value={form.bouncingReason}
          onChange={v => setForm(f => ({ ...f, bouncingReason: v }))}
          options={CHEQUE_BOUNCE_REASONS}
          placeholder="Select a common reason or type your own"
          maxLength={255}
        />
      </div>

      <div>
        <label className="form-label">Claim Amount</label>
        <div className="form-input-wrap">
          <span className="form-input-prefix">₹</span>
          <input
            className="form-input form-input--prefix"
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 500000"
            value={form.claimAmount}
            onChange={set('claimAmount')}
          />
        </div>
      </div>

      <div>
        <label className="form-label">Notice Date</label>
        <input className="form-input" type="date" value={form.noticeDate} onChange={set('noticeDate')} />
      </div>
    </div>
  )
}

// Search for and attach one or more clients to the case, or jump to adding a new client
function ClientPicker() {
  const { showAddCase, caseClients, removeCaseClient } = useApp()

  // True while the user is adding another client to a case that already has one
  const [addingClient, setAddingClient] = useState(false)
  // Whether the client search window is open
  const [searchOpen, setSearchOpen] = useState(false)

  // Reset when the modal opens or closes
  useEffect(() => { setAddingClient(false); setSearchOpen(false) }, [showAddCase])

  // Show the search box when no client is attached yet or when adding another
  const showSearch = caseClients.length === 0 || addingClient

  // Hide the search box again
  function cancelAddClient() {
    setAddingClient(false)
  }

  return (
    <div className="case-parties__client">
      {caseClients.length > 0 && (
        <div className="client-selected-list">
          {caseClients.map((cl, i) => (
            <div key={cl.id} className="client-selected">
              <div className="client-selected__avatar">
                <Icon name="user" />
              </div>
              <div className="client-selected__info">
                <p className="client-selected__name">
                  {cl.name}
                  {i === 0 && caseClients.length > 1 && (
                    <span className="client-selected__tag">Primary</span>
                  )}
                </p>
                <p className="client-selected__email">{cl.email}</p>
              </div>
              <button type="button" className="btn-outline" onClick={() => removeCaseClient(cl.id)}>
                {caseClients.length === 1 ? 'Change' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}

      {showSearch ? (
        <>
          <button
            type="button"
            className="form-input opposing-field"
            onClick={() => setSearchOpen(true)}
          >
            <span className="opposing-field__placeholder">
              {caseClients.length === 0 ? 'Click to search client…' : 'Click to search another client…'}
            </span>
          </button>
          {caseClients.length > 0 && (
            <button type="button" className="btn-outline u-mt-6" onClick={cancelAddClient}>Cancel</button>
          )}
        </>
      ) : (
        <button type="button" className="btn-outline client-add-more" onClick={() => { setAddingClient(true); setSearchOpen(true) }}>
          + Add another client
        </button>
      )}

      {searchOpen && <ClientSearchPrompt onClose={() => setSearchOpen(false)} />}
    </div>
  )
}

// Lets long labels like Complainant/Petitioner/Plaintiff wrap after a slash instead of in the middle of a word
const breakSlashes = text => String(text).replace(/\//g, '/\u200b')

// Which side our client is on, the opposing party details, and the case title built from them
function PartiesSection() {
  const { newCaseForm, setNewCaseForm, caseClients, changeClientSide } = useApp()

  // Side our client is on (complainant or accused)
  const side = newCaseForm.clientSide
  const [complainantSide, accusedSide] = PARTY_SIDES

  // Case title composed from the side, client names and opposing party
  const title = composeCaseTitle({
    clientSide: side,
    clientNames: caseClients.map(c => c.name),
    opposingParty: newCaseForm.opposingParty,
  })

  // Whether the opposing party details popup is open
  const [detailsOpen, setDetailsOpen] = useState(false)

  // Opposing party details shown on the button; father's name and phone go in the second line
  const opposingName = (newCaseForm.opposingParty || '').trim()
  const opposingFather = (newCaseForm.opposingFatherName || '').trim()
  // Second line under the opposing party name
  const opposingSub = [
    opposingFather && `Father: ${opposingFather}`,
    (newCaseForm.opposingPhone || '').trim(),
  ].filter(Boolean).join(' · ')

  // Button that opens the opposing party popup (typing is done there, not inline)
  const manualInput = (
    <button
      type="button"
      className={`form-input opposing-field${opposingName ? ' opposing-field--filled' : ''}`}
      onClick={() => setDetailsOpen(true)}
    >
      {opposingName ? (
        <>
          <span className="opposing-field__name">{opposingName}</span>
          <span className="opposing-field__sub">{opposingSub || 'Click to add father name, address and phone'}</span>
        </>
      ) : (
        <span className="opposing-field__placeholder">Click to add name, father name, address and phone</span>
      )}
      <span className="opposing-field__edit" aria-hidden="true"><Icon name="edit" /></span>
    </button>
  )

  return (
    <div className="client-section case-parties form-grid-full">
      <p className="case-parties__title">
        {breakSlashes(complainantSide.label)} v. {breakSlashes(accusedSide.label)} *
      </p>

      <div className="case-parties__side">
        <span className="case-parties__side-label">Our client is the</span>
        <div className="fee-type-toggle case-parties__toggle">
          {PARTY_SIDES.map(p => (
            <button
              key={p.value}
              type="button"
              className={`fee-type-btn${side === p.value ? ' fee-type-btn--active' : ''}`}
              onClick={() => changeClientSide(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="case-parties__party">
        <label className="form-label">
          {breakSlashes(complainantSide.label)}<Req />
          <span className="case-parties__hint">
            {side === SIDE_COMPLAINANT ? ' — our client' : ' — opposite party, click to fill'}
          </span>
        </label>
        {side === SIDE_COMPLAINANT ? <ClientPicker /> : manualInput}
      </div>

      <div className="case-parties__vs" aria-hidden="true">v.</div>

      <div className="case-parties__party">
        <label className="form-label">
          {breakSlashes(accusedSide.label)}<Req />
          <span className="case-parties__hint">
            {side === SIDE_ACCUSED ? ' — our client' : ' — opposite party, click to fill'}
          </span>
        </label>
        {side === SIDE_ACCUSED ? <ClientPicker /> : manualInput}
      </div>

      <p className="case-parties__preview">
        Case title: <strong>{title}</strong>
      </p>

      {detailsOpen && (
        <OpposingPartyModal
          partyLabel={side === SIDE_COMPLAINANT ? accusedSide.label : complainantSide.label}
          initial={{
            name:       newCaseForm.opposingParty,
            fatherName: newCaseForm.opposingFatherName,
            address:    newCaseForm.opposingAddress,
            phone:      newCaseForm.opposingPhone,
          }}
          onClose={() => setDetailsOpen(false)}
          onSave={d => {
            setNewCaseForm(f => ({
              ...f,
              opposingParty:      d.name,
              opposingFatherName: d.fatherName,
              opposingAddress:    d.address,
              opposingPhone:      d.phone,
            }))
            setDetailsOpen(false)
          }}
        />
      )}
    </div>
  )
}

// Case file number; auto-numbered for normal clients, typed by hand for corporate panel clients
function FileNumberField({ form, setForm }) {
  const { caseClients } = useApp()
  // Whether the file numbers popup is open
  const [windowOpen, setWindowOpen] = useState(false)

  // True when a corporate panel client is attached
  const panel = hasCorporatePanelClient(caseClients)
  // Where the current file number came from ("auto" or "legacy")
  const origin = form.fileNoOrigin

  // An existing file number that stays as it is
  const kept = !panel && (origin === 'auto' || (origin === 'legacy' && !!form.fileNo.trim()))
  // True when the next free number should be fetched and used
  const numbered = !panel && !kept

  // Fetch the next free file number once, unless the form already has one
  useEffect(() => {
    if (!numbered) return undefined

    let alive = true
    api.cases.fileNumbers()
      .then(res => {
        if (alive) setForm(f => (f.fileSeq ? f : { ...f, fileSeq: res.nextNumber }))
      })
      .catch(() => { })

    return () => { alive = false }
  }, [numbered, setForm])

  // Panel clients type the file number manually
  if (panel) {
    return (
      <div>
        <label className="form-label">
          File Number
          <span className="case-parties__hint"> — Corporate Panel, type manually</span>
        </label>
        <input
          className="form-input"
          placeholder="e.g. FILE/2024/045"
          value={form.fileNo}
          onChange={e => setForm(f => ({ ...f, fileNo: e.target.value }))}
        />
      </div>
    )
  }

  // Number displayed in the field
  const shownNumber = origin === 'legacy' && kept ? form.fileNo : (form.fileSeq ?? '')

  return (
    <div>
      <label className="form-label">
        File Number
        <span className="case-parties__hint">
          {kept ? ' — fixed' : ' — automatic'}
        </span>
      </label>

      <div className="file-no-row">
        <input
          className="form-input"
          readOnly
          value={shownNumber}
          placeholder="Assigned when the case is saved"
        />
        <button type="button" className="btn-outline" onClick={() => setWindowOpen(true)}>
          File numbers
        </button>
      </div>

      {windowOpen && (
        <FileNumbersModal
          selected={numbered ? form.fileSeq : undefined}
          onClose={() => setWindowOpen(false)}
          onPick={numbered
            ? number => { setForm(f => ({ ...f, fileSeq: number })); setWindowOpen(false) }
            : undefined}
        />
      )}
    </div>
  )
}

// Popup with the full form to add a new case
export default function AddCaseModal() {
  const { courtNames, highCourts, rows: courtRows } = useCourts()
  const {
    showAddCase, setShowAddCase,
    newCaseForm, setNewCaseForm,
    remapClientSubTypes,
    handleSaveCase,
    editingCaseId, resetCaseModal,
    isAssociate, caseClients, caseClientSubTypes,
  } = useApp()

  // The user's preferred courts (Profile > Court preference), the one with the most cases first
  const preferred = useDefaultCourt()
  // A new case starts on the preferred court, unless a court is already filled in (or an existing case is being edited)
  const prefilled = useRef(false)
  useEffect(() => {
    if (!showAddCase) { prefilled.current = false; return }
    if (prefilled.current || editingCaseId || !preferred.ready || !preferred.court) return
    prefilled.current = true
    setNewCaseForm(f => (f.court ? f : { ...f, court: preferred.court, district: preferred.district }))
  }, [showAddCase, editingCaseId, preferred.ready, preferred.court, preferred.district, setNewCaseForm])

  // Court numbers and their judges for the chosen court and district
  const [courtNumbers, setCourtNumbers] = useState([])
  // Court and district chosen on the form, used to look up court numbers
  const { court: formCourt, district: formDistrict } = newCaseForm

  // Reload court numbers when the court or district changes; clear them when either is empty
  useEffect(() => {
    if (!showAddCase || !formCourt || !formDistrict) {
      setCourtNumbers([])
      return undefined
    }

    let alive = true
    api.judgesList.courtNumbers({ court: formCourt, district: formDistrict })
      .then(rows => { if (alive) setCourtNumbers(Array.isArray(rows) ? rows : []) })
      .catch(() => { if (alive) setCourtNumbers([]) })

    return () => { alive = false }
  }, [showAddCase, formCourt, formDistrict])

  // Court numbers listed in the court table for the chosen court and district. A number the case already
  // holds stays in the list until it is changed, so an old case can still be opened
  const caseCourtNos = useMemo(() => {
    const list = getCourtNos(formCourt, formDistrict)
    const current = (newCaseForm.courtNo || '').trim()
    return current && !list.includes(current) ? [...list, current] : list
  }, [courtRows, formCourt, formDistrict, newCaseForm.courtNo])

  // Judge names for the chosen court number, without duplicates
  const judges = useMemo(
    () => [...new Set(judgesForCourtNo(courtNumbers, newCaseForm.courtNo).map(j => j.judgeName))],
    [courtNumbers, newCaseForm.courtNo]
  )

  // Popup shown before a new case form: 0 = fresh/old question, 1 = the form itself
  const [stage, setStage] = useState(0)

  // Start from the first question every time the modal is closed
  useEffect(() => { if (!showAddCase) setStage(0) }, [showAddCase])

  // How the form looked when it was opened, to know whether anything was typed since
  const caseSignature = JSON.stringify({
    form: newCaseForm, clients: caseClients.map(c => c.id), subTypes: caseClientSubTypes,
  })
  const caseBaseline = useRef(null)
  useEffect(() => { caseBaseline.current = showAddCase ? caseSignature : null }, [showAddCase, editingCaseId, stage]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clicking outside never closes the form; the cross asks to save or discard unsaved details
  const { requestClose, dialog, overlayHandlers } = useUnsavedGuard({
    dirty: showAddCase && caseBaseline.current !== null && caseSignature !== caseBaseline.current,
    onSave: handleSaveCase,
    onDiscard: closeModal,
  })

  // Nothing to show while the modal is closed
  if (!showAddCase) return null

  // Adding a new case: ask whether it is fresh or old before the form opens
  if (!editingCaseId && stage === 0) {
    return (
      <CaseAgePrompt
        onClose={closeModal}
        onChoose={caseAge => { setNewCaseForm(f => ({ ...f, caseAge })); setStage(1) }}
      />
    )
  }

  // True when editing an existing case instead of adding one
  const isEditing = !!editingCaseId
  // Relief options depend on the case nature
  const reliefs = reliefOptions(newCaseForm.caseNature)
  // Case type options depend on the nature and relief
  const caseTypes = caseTypeOptions(newCaseForm.caseNature, newCaseForm.reliefSought)

  // Changing the nature clears the fields that depend on it and remaps client sub types
  function changeNature(caseNature) {
    if (caseNature === newCaseForm.caseNature) return

    setNewCaseForm(f => ({ ...f, caseNature, reliefSought: '', caseType: '', firNo: '', firSection: '', policeStation: '' }))

    remapClientSubTypes(newCaseForm.clientSide, caseNature)
  }

  // Changing the relief picks the case type if there is only one, and clears police challan fields if they no longer apply
  function changeRelief(reliefSought) {
    setNewCaseForm(f => {
      const types = caseTypeOptions(f.caseNature, reliefSought)

      return {
        ...f,
        reliefSought,
        caseType: types.length === 1 ? types[0] : '',
        ...(isPoliceChallan(reliefSought) ? {} : { firNo: '', firSection: '', policeStation: '' }),
      }
    })
  }

  // Changing the court resets the district: the preferred one for that court when the user chose one, else the first
  function changeCourt(court) {
    setNewCaseForm(f => ({ ...f, court, district: preferred.districtOf(court) || getDistricts(court)[0] || '', courtNo: '' }))
  }

  // Close and reset the form
  function closeModal() {
    setShowAddCase(false)
    resetCaseModal()
  }

  return (
    <>
    <ModalPortal>
      <div className="overlay" {...overlayHandlers}>
        <div className="modal modal--case" onClick={e => e.stopPropagation()}>

          <div className="modal__header">
            <h2 className="modal__title">{isEditing ? 'Edit Case' : 'Add New Case'}</h2>
            <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={requestClose}><Icon name="close" /></button>
          </div>

          {!isEditing && (
            <div className="case-age u-mb-16">
              <label className="form-label">Is this case new or already running in court?</label>
              <div className="u-flex-8">
                {[['FRESH', 'Fresh case'], ['OLD', 'Old case']].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={newCaseForm.caseAge === value ? 'btn-gold btn-outline--sm' : 'btn-outline btn-outline--sm'}
                    onClick={() => setNewCaseForm(f => ({ ...f, caseAge: value }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {newCaseForm.caseAge === 'OLD' && (
                <p className="case-parties__hint u-mt-6">
                  Enter the CNR number. The next hearing date, every earlier hearing date and the orders
                  are taken from eCourts when you add the case.
                </p>
              )}
            </div>
          )}

          {isEditing && (
            <div className="case-modal-status">
              <CaseStatusSelect
                id="case-modal-status"
                status={newCaseForm.status}
                onChange={next => setNewCaseForm(f => ({ ...f, status: next }))}
              />
              {newCaseForm.status === WITHDRAWN_STATUS && (
                <p className="case-parties__hint u-mt-6">
                  Withdrawn: the hearing date is taken off the calendar (kept in the hearing history)
                  and the file number is released when you save.
                </p>
              )}
            </div>
          )}

          <div className="form-grid-2 form-grid-2--case">
            <div>
              <label className="form-label">Case Nature</label>
              <Dropdown className="form-input" touchSearch={false} value={newCaseForm.caseNature} onChange={e => changeNature(e.target.value)}>
                <option value="">Select Case Nature</option>
                {CASE_NATURES.map(n => <option key={n} value={n}>{n}</option>)}
              </Dropdown>
            </div>
            <div>
              <label className="form-label">Relief Sought</label>
              <Dropdown
                className="form-input"
                value={newCaseForm.reliefSought}
                disabled={!newCaseForm.caseNature}
                onChange={e => changeRelief(e.target.value)}
              >
                <option value="">
                  {newCaseForm.caseNature ? 'Select Relief Sought' : 'Select case nature first'}
                </option>
                {reliefs.map(r => <option key={r} value={r}>{r}</option>)}
              </Dropdown>
            </div>
            <div className="form-grid-full">
              <label className="form-label">Case Type</label>
              <Dropdown
                className="form-input"
                value={newCaseForm.caseType}
                disabled={caseTypes.length === 0}
                onChange={e => setNewCaseForm(f => ({ ...f, caseType: e.target.value }))}
              >
                <option value="">
                  {!newCaseForm.reliefSought
                    ? 'Select relief sought first'
                    : caseTypes.length === 0
                      ? 'Not applicable for this relief'
                      : 'Select Case Type'}
                </option>
                {caseTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </Dropdown>
            </div>
            {isPoliceChallan(newCaseForm.reliefSought) && (
              <ChallanDetails form={newCaseForm} setForm={setNewCaseForm} />
            )}
            {isNiAct138Complaint(newCaseForm.caseType) && (
              <ChequeDetails form={newCaseForm} setForm={setNewCaseForm} />
            )}
            <div>
              <label className="form-label">Court<Req /></label>
              <Dropdown className="form-input" value={newCaseForm.court} onChange={e => changeCourt(e.target.value)}>
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
              <label className="form-label">
                District{hasNamedDistricts(newCaseForm.court) && <Req />}
              </label>
              <Dropdown
                className="form-input"
                value={newCaseForm.district}
                disabled={!hasNamedDistricts(newCaseForm.court)}
                onChange={e => setNewCaseForm(f => ({ ...f, district: e.target.value, courtNo: '' }))}
              >
                {!hasNamedDistricts(newCaseForm.court) && (
                  <option value={newCaseForm.district || ''}>
                    {!newCaseForm.court
                      ? 'Select a court first'
                      : isHighCourt(newCaseForm.court)
                        ? 'Not applicable'
                        : 'No district — filed at ' + newCaseForm.court}
                  </option>
                )}
                {hasNamedDistricts(newCaseForm.court) &&
                  getDistricts(newCaseForm.court).map(d => <option key={d} value={d}>{d}</option>)}
              </Dropdown>
            </div>
            <div>
              <label className="form-label">Court No.</label>
              {/* Court numbers come from the court table for the chosen court and district */}
              <Dropdown
                className="form-input"
                value={newCaseForm.courtNo}
                disabled={!newCaseForm.court}
                onChange={e => setNewCaseForm(f => ({ ...f, courtNo: e.target.value }))}
              >
                <option value="">{newCaseForm.court ? 'Select Court No.' : 'Select a court first'}</option>
                {caseCourtNos.map(n => <option key={n} value={n}>{n}</option>)}
              </Dropdown>
              {newCaseForm.courtNo.trim() && formCourt && (
                judges.length > 0
                  ? <p className="case-judge-hint">Judge: <strong>{judges.join(' / ')}</strong></p>
                  : <p className="case-judge-hint case-judge-hint--none">No judge listed for this court no.</p>
              )}
            </div>
            <div>
              <label className="form-label">Case Number<Req /></label>
              <input className="form-input" placeholder="e.g. W.P.(C) 1234/2024"
                value={newCaseForm.caseNo} onChange={e => setNewCaseForm(f => ({ ...f, caseNo: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">CNR Number<Req /></label>
              <input className="form-input" placeholder="e.g. DLHC010012342024"
                value={newCaseForm.cnrNo} onChange={e => setNewCaseForm(f => ({ ...f, cnrNo: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Filing Date</label>
              <input className="form-input" type="date"
                value={newCaseForm.filingDate} onChange={e => setNewCaseForm(f => ({ ...f, filingDate: e.target.value }))} />
            </div>

            <PartiesSection />

            <FileNumberField form={newCaseForm} setForm={setNewCaseForm} />
            {/* Asked only when a case is added; afterwards it changes through the Next Hearing Update button.
                For an old case the next date comes from eCourts */}
            {!isEditing && newCaseForm.caseAge !== 'OLD' && (
              <div>
                <label className="form-label">Next Hearing</label>
                <HearingDateInput
                  value={newCaseForm.nextHearing}
                  onChange={v => setNewCaseForm(f => ({ ...f, nextHearing: v }))} />
              </div>
            )}
            <div className="form-grid-full">
              <label className="form-label">Description</label>
              <textarea className="form-input" rows={3} placeholder="Brief description of the case…"
                value={newCaseForm.description} onChange={e => setNewCaseForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>

          {!isAssociate && (
            <CaseFeeSection
              corporatePanel={hasCorporatePanelClient(caseClients)}
              hasClient={caseClients.length > 0}
              hideHearingFees={!isEditing}
            />
          )}

          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={closeModal}>Cancel</button>
            <button type="button" className="btn-gold" onClick={handleSaveCase}>
              {isEditing ? 'Save Changes' : 'Add Case'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
    {dialog}
    </>
  )
}