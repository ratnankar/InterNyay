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
  titleOurNames,
  titleOpposingNames,
  isNiAct138Complaint,
  isPoliceChallan,
  reliefOptions,
  sideSubType,
} from '../../constants/caseCatalog'
import { judgesForRoom } from '../../utils/courtMatch'
import { hasCorporatePanelClient } from '../../utils/caseClients'
import { partySubText, toFormParty } from '../../utils/caseParties'
import { cnrCaseTitle, cnrDetailToForm } from '../../utils/cnrPrefill'
import { useCourts, useDefaultCourt, getDistricts, getCourtNosByBuilding, caseRoom, buildingWithFloor, hasNamedDistricts, isHighCourt, isJuvenileBoard } from '../../constants/courts'
import { CHEQUE_BOUNCE_REASONS, WITHDRAWN_STATUS } from '../../constants/data'
import CaseFeeSection from './CaseFeeSection'
import FileNumbersModal from './FileNumbersModal'
import PartyDetailsModal from './PartyDetailsModal'
import { AddPartyTypePrompt, CaseAddModePrompt, ClientSearchPrompt } from './NewCasePrompts'
import useUnsavedGuard from '../../hooks/useUnsavedGuard'
import HearingDateInput from '../common/HearingDateInput'
import PoliceStationInput from '../common/PoliceStationInput'
import SuggestInput from '../common/SuggestInput'
import Dropdown from '../common/Dropdown'
import CaseStatusSelect from '../common/CaseStatusSelect'
import Req from '../common/Req'

import Icon from '../common/Icon'
import ModalPortal from '../../components/common/ModalPortal'
import ClearableDateInput from '../common/ClearableDateInput'
// A court no. in the dropdown is identified by building, floor and number, because the same number can be used in several buildings
const KEY_SEP = '\u0001'
const roomKey = (building, floor, courtNo) => [building || '', floor || '', courtNo || ''].join(KEY_SEP)

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
          // Section and Acts & Sections hold the same text in a police challan case: changing one changes the other
          onChange={e => setForm(f => ({ ...f, firSection: e.target.value, actsSections: e.target.value }))}
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
        <ClearableDateInput className="form-input"  value={form.chequeDate} onChange={set('chequeDate')} />
      </div>

      <div>
        <label className="form-label">Memo Date</label>
        <ClearableDateInput className="form-input"  value={form.memoDate} onChange={set('memoDate')} />
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
        <ClearableDateInput className="form-input"  value={form.noticeDate} onChange={set('noticeDate')} />
      </div>
    </div>
  )
}

// Search for and attach one or more clients to the case, or jump to adding a new client.
// People on our side who are not saved as clients can be added too, and marked as a client later
function ClientPicker({ ourLabel, allowNonClient }) {
  const { showAddCase, caseClients, removeCaseClient, setPrimaryCaseClient, newCaseForm, setNewCaseForm, startMarkAsClient } = useApp()

  // Whether the client search window is open
  const [searchOpen, setSearchOpen] = useState(false)
  // Non-client popup: null when closed, 'new' when adding, or the key of the person being edited
  const [nonClientPopup, setNonClientPopup] = useState(null)
  // Whether the window asking what to add (client or non-client) is open
  const [chooserOpen, setChooserOpen] = useState(false)

  // Reset when the modal opens or closes
  useEffect(() => { setSearchOpen(false); setNonClientPopup(null); setChooserOpen(false) }, [showAddCase])

  // People on our side who are not saved as clients
  const nonClients = newCaseForm.nonClients
  // Non-client whose name leads the title, and how many people are on our side
  const leadKey = nonClients.some(n => n.key === newCaseForm.titleLead) ? newCaseForm.titleLead : null
  const ourCount = caseClients.length + nonClients.length

  // Add a new non-client, or save the changes to one. A new one gets the role that fits our side of the case
  function saveNonClient(d) {
    setNewCaseForm(f => ({
      ...f,
      nonClients: nonClientPopup === 'new'
        ? [...f.nonClients, { ...toFormParty(d), subType: sideSubType(f.clientSide, f.caseNature) }]
        : f.nonClients.map(n => (n.key === nonClientPopup ? { ...n, ...d } : n)),
    }))
    setNonClientPopup(null)
  }

  // Take a non-client off the case
  function removeNonClient(key) {
    setNewCaseForm(f => ({
      ...f,
      nonClients: f.nonClients.filter(n => n.key !== key),
      titleLead: f.titleLead === key ? null : f.titleLead,
    }))
  }

  return (
    <div className="case-parties__client">
      {(caseClients.length > 0 || nonClients.length > 0) && (
        <div className="client-selected-list">
          {caseClients.map((cl, i) => (
            <div key={cl.id} className="client-selected">
              <div className="client-selected__avatar">
                <Icon name="user" />
              </div>
              <div className="client-selected__info">
                <p className="client-selected__name">
                  {cl.name}
                  {i === 0 && !leadKey && ourCount > 1 && (
                    <span className="client-selected__tag">Shown in title</span>
                  )}
                </p>
                <p className="client-selected__email">{cl.email}</p>
              </div>
              <div className="client-selected__actions">
                {(i > 0 || leadKey) && (
                  <button type="button" className="btn-outline" onClick={() => setPrimaryCaseClient(cl.id)}>
                    Show in title
                  </button>
                )}
                <button type="button" className="btn-outline" onClick={() => removeCaseClient(cl.id)}>
                  Remove
                </button>
              </div>
            </div>
          ))}

          {nonClients.map(n => (
            <div key={n.key} className="client-selected client-selected--nonclient">
              <div className="client-selected__avatar">
                <Icon name="user" />
              </div>
              <div className="client-selected__info">
                <p className="client-selected__name">
                  {n.name}
                  <span className="client-selected__tag client-selected__tag--muted">Not a client</span>
                  {leadKey === n.key && <span className="client-selected__tag">Shown in title</span>}
                </p>
                <p className="client-selected__email">{partySubText(n) || 'Not saved in your clients'}</p>
              </div>
              <div className="client-selected__actions">
                {caseClients.length > 0 && leadKey !== n.key && (
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setNewCaseForm(f => ({ ...f, titleLead: n.key }))}
                  >
                    Show in title
                  </button>
                )}
                <button type="button" className="btn-outline" onClick={() => startMarkAsClient(n)}>Mark as client</button>
                <button type="button" className="btn-outline" onClick={() => setNonClientPopup(n.key)}>Edit</button>
                <button type="button" className="btn-outline" onClick={() => removeNonClient(n.key)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* The search bar shows only until the first client is added; more clients come through the Add button */}
      {caseClients.length === 0 && (
        <button
          type="button"
          className="form-input opposing-field client-search-field"
          onClick={() => setSearchOpen(true)}
        >
          <span className="opposing-field__placeholder">Click to search client…</span>
        </button>
      )}

      {/* One Add option; it asks whether to add a client or a non-client. It stays available while the search bar is showing */}
      {/* Non-clients can be added on either side: whichever side our client is on */}
      {(allowNonClient || caseClients.length > 0) && (
        <div className="client-add-row">
          <button
            type="button"
            className="btn-outline"
            onClick={() => (allowNonClient ? setChooserOpen(true) : setSearchOpen(true))}
          >
            {allowNonClient ? '+ Add' : '+ Add another client'}
          </button>
        </div>
      )}

      {chooserOpen && (
        <AddPartyTypePrompt
          ourLabel={ourLabel}
          hasClient={caseClients.length > 0}
          onClose={() => setChooserOpen(false)}
          onClient={() => { setChooserOpen(false); setSearchOpen(true) }}
          onNonClient={() => { setChooserOpen(false); setNonClientPopup('new') }}
        />
      )}

      {searchOpen && <ClientSearchPrompt onClose={() => setSearchOpen(false)} />}

      {nonClientPopup && (
        <PartyDetailsModal
          title="Non-client Details"
          partyLabel={ourLabel}
          note="Not saved in your clients. You can mark them as a client later."
          initial={nonClients.find(n => n.key === nonClientPopup)}
          onClose={() => setNonClientPopup(null)}
          onSave={saveNonClient}
        />
      )}
    </div>
  )
}

// The opposite parties of the case: one or more, each added and edited in a popup
function OpponentList({ partyLabel }) {
  const { newCaseForm, setNewCaseForm } = useApp()

  const opponents = newCaseForm.opponents
  // The opposite party whose name leads the title: the one picked, otherwise the first
  const leadKey = opponents.some(o => o.key === newCaseForm.opponentLead) ? newCaseForm.opponentLead : opponents[0]?.key
  // Popup: null when closed, 'new' when adding, or the key of the opponent being edited
  const [popup, setPopup] = useState(null)

  // Add a new opponent, or save the changes to one
  function save(d) {
    setNewCaseForm(f => ({
      ...f,
      opponents: popup === 'new'
        ? [...f.opponents, toFormParty(d)]
        : f.opponents.map(o => (o.key === popup ? { ...o, ...d } : o)),
    }))
    setPopup(null)
  }

  // Take an opponent off the case
  function remove(key) {
    setNewCaseForm(f => ({
      ...f,
      opponents: f.opponents.filter(o => o.key !== key),
      opponentLead: f.opponentLead === key ? null : f.opponentLead,
    }))
  }

  return (
    <div className="case-parties__opponents">
      {opponents.length > 0 && (
        <div className="client-selected-list">
          {opponents.map(o => (
            <div key={o.key} className="client-selected">
              <div className="client-selected__avatar">
                <Icon name="user" />
              </div>
              <div className="client-selected__info">
                <p className="client-selected__name">
                  {o.name}
                  {leadKey === o.key && opponents.length > 1 && (
                    <span className="client-selected__tag">Shown in title</span>
                  )}
                </p>
                <p className="client-selected__email">{partySubText(o) || 'No other details'}</p>
              </div>
              <div className="client-selected__actions">
                {opponents.length > 1 && leadKey !== o.key && (
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setNewCaseForm(f => ({ ...f, opponentLead: o.key }))}
                  >
                    Show in title
                  </button>
                )}
                <button type="button" className="btn-outline" onClick={() => setPopup(o.key)}>Edit</button>
                <button type="button" className="btn-outline" onClick={() => remove(o.key)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {opponents.length === 0 ? (
        <button type="button" className="form-input opposing-field" onClick={() => setPopup('new')}>
          <span className="opposing-field__placeholder">Click to add name, father name, address and phone</span>
          <span className="opposing-field__edit" aria-hidden="true"><Icon name="edit" /></span>
        </button>
      ) : (
        <button type="button" className="btn-outline client-add-more" onClick={() => setPopup('new')}>
          + Add another opponent
        </button>
      )}

      {popup && (
        <PartyDetailsModal
          title="Opposite Party Details"
          partyLabel={partyLabel}
          initial={opponents.find(o => o.key === popup)}
          onClose={() => setPopup(null)}
          onSave={save}
        />
      )}
    </div>
  )
}

// Lets long labels like Complainant/Petitioner/Plaintiff wrap after a slash instead of in the middle of a word
const breakSlashes = text => String(text).replace(/\//g, '/\u200b')

// Which side our client is on, the opposite parties, and the case title built from them
function PartiesSection() {
  const { newCaseForm, setNewCaseForm, caseClients, changeClientSide, editingCaseId, cases } = useApp()

  // Side our client is on (complainant or accused)
  const side = newCaseForm.clientSide
  const [complainantSide, accusedSide] = PARTY_SIDES

  // A case added by CNR: the title starts as the one eCourts has; client is optional; the opposite parties are filled
  // from eCourts and can be edited like in a case added by hand
  const byCnr = newCaseForm.addMode === 'CNR'
  // Client and opposite parties are optional for a case added by CNR and for a case saved without a client
  const optional = (!editingCaseId && byCnr) || (!!editingCaseId && cases.find(c => c.id === editingCaseId)?.clientId == null)
  const courtTitle = byCnr ? cnrCaseTitle(newCaseForm.cnrDetail) : ''

  // Case title: eCourts' title when added by CNR, otherwise composed from the side, our side's names
  // (clients and non-clients) and the opposite parties
  const autoTitle = courtTitle || composeCaseTitle({
    clientSide: side,
    ourNames: titleOurNames(caseClients, newCaseForm.nonClients, newCaseForm.titleLead),
    opposingNames: titleOpposingNames(newCaseForm.opponents, newCaseForm.opponentLead),
    withState: isPoliceChallan(newCaseForm.reliefSought),
  })

  // The title shown in the box: the typed one once edited, otherwise the live composed one
  const edited = !!newCaseForm.titleEdited
  const title = edited ? newCaseForm.title : autoTitle

  // Label of the side the opposite parties are on, and of our side
  const theirLabel = side === SIDE_COMPLAINANT ? accusedSide.label : complainantSide.label
  const ourLabel = side === SIDE_COMPLAINANT ? complainantSide.label : accusedSide.label

  return (
    <div className="client-section case-parties form-grid-full">
      <p className="case-parties__title">
        {breakSlashes(complainantSide.label)} v. {breakSlashes(accusedSide.label)}{!optional && ' *'}
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
          {breakSlashes(complainantSide.label)}{!optional && <Req />}
          <span className="case-parties__hint">
            {side === SIDE_COMPLAINANT
              ? (optional ? ' — our client, optional' : ' — our client')
              : (optional ? ' — opposite parties, optional' : ' — opposite parties, add one or more')}
          </span>
        </label>
        {side === SIDE_COMPLAINANT
          ? <ClientPicker ourLabel={ourLabel} allowNonClient />
          : <OpponentList partyLabel={theirLabel} />}
      </div>

      <div className="case-parties__vs" aria-hidden="true">v.</div>

      <div className="case-parties__party">
        <label className="form-label">
          {breakSlashes(accusedSide.label)}{!optional && <Req />}
          <span className="case-parties__hint">
            {side === SIDE_ACCUSED
              ? (optional ? ' — our client, optional' : ' — our client')
              : (optional ? ' — opposite parties, optional' : ' — opposite parties, add one or more')}
          </span>
        </label>
        {side === SIDE_ACCUSED
          ? <ClientPicker ourLabel={ourLabel} allowNonClient />
          : <OpponentList partyLabel={theirLabel} />}
      </div>

      <div className="case-parties__preview">
        <label className="form-label" htmlFor="case-title-input">
          Case title
          <span className="case-parties__hint">
            {edited
              ? ' — edited by you'
              : (courtTitle ? ' — taken from eCourts, you can edit it' : ' — made from the names above, you can edit it')}
          </span>
        </label>
        <div className="case-title-row">
          <input
            id="case-title-input"
            className="form-input"
            type="text"
            maxLength={500}
            value={title}
            placeholder="Case title"
            onChange={e => setNewCaseForm(f => ({ ...f, title: e.target.value, titleEdited: true }))}
            onBlur={() => { if (edited && !title.trim()) setNewCaseForm(f => ({ ...f, title: '', titleEdited: false })) }}
          />
          {edited && (
            <button
              type="button"
              className="btn-outline"
              onClick={() => setNewCaseForm(f => ({ ...f, title: '', titleEdited: false }))}
            >
              {courtTitle ? 'Use eCourts title' : 'Use auto title'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Case file number. Corporate panel clients type it by hand. For everyone else a new case starts with the next free
// number; any number or text can be typed instead, and the file number of a saved case can be changed the same way
function FileNumberField({ form, setForm }) {
  const { caseClients } = useApp()
  // Whether the file numbers popup is open
  const [windowOpen, setWindowOpen] = useState(false)

  // True when a corporate panel client is attached
  const panel = hasCorporatePanelClient(caseClients)
  // Where the current file number came from ("auto", "legacy", "panel", or "new" when the case has none yet)
  const origin = form.fileNoOrigin

  // A file number the saved case already has (it can still be changed)
  const kept = !panel && (origin === 'auto' || origin === 'legacy')
  // True when the next free number should be suggested and used
  const numbered = !panel && !kept
  // The number can be typed only while the case has none of its own (a case that just left corporate panel is given a new one)
  const editable = kept || (numbered && origin === 'new')
  // True once the advocate has typed their own number
  const typed = editable && !!form.fileNoManual

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
          maxLength={255}
          value={form.fileNo}
          onChange={e => setForm(f => ({ ...f, fileNo: e.target.value }))}
        />
      </div>
    )
  }

  // Number displayed in the field: what was typed, else the number the case holds or the suggested one
  const shownNumber = typed || kept ? form.fileNo : (form.fileSeq ?? '')

  // The number marked as chosen in the file numbers popup
  const typedNumber = /^[1-9]\d{0,8}$/.test((form.fileNo || '').trim()) ? Number((form.fileNo || '').trim()) : undefined
  const selected = typed || kept ? typedNumber : form.fileSeq

  return (
    <div>
      <label className="form-label">
        File Number
        <span className="case-parties__hint">
          {typed ? ' — changed by you' : kept ? ' — type to change' : editable ? ' — suggested, type to change' : ' — automatic'}
        </span>
      </label>

      <div className="file-no-row">
        <input
          className="form-input"
          readOnly={!editable}
          maxLength={255}
          value={shownNumber}
          placeholder={editable ? 'e.g. 25 or FILE/2024/045' : 'Assigned when the case is saved'}
          onChange={editable ? e => setForm(f => ({ ...f, fileNo: e.target.value, fileNoManual: true })) : undefined}
          // Leaving the field empty goes back to the suggested number, or to the number the saved case had
          onBlur={editable ? () => setForm(f => (f.fileNoManual && !(f.fileNo || '').trim()
            ? { ...f, fileNo: kept ? (f.fileNoOriginal || '') : '', fileNoManual: false } : f)) : undefined}
        />
        <button type="button" className="btn-outline" onClick={() => setWindowOpen(true)}>
          File numbers
        </button>
      </div>

      {windowOpen && (
        <FileNumbersModal
          selected={numbered || kept ? selected : undefined}
          onClose={() => setWindowOpen(false)}
          onPick={kept
            ? number => { setForm(f => ({ ...f, fileNo: String(number), fileNoManual: true })); setWindowOpen(false) }
            : numbered
              ? number => { setForm(f => ({ ...f, fileSeq: number, fileNo: '', fileNoManual: false })); setWindowOpen(false) }
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
    showAddCase, setShowAddCase, scanCnr, setScanCnr,
    newCaseForm, setNewCaseForm,
    remapClientSubTypes,
    handleSaveCase,
    editingCaseId, resetCaseModal,
    isAssociate, caseClients, caseClientSubTypes,
    addToast, currentUser, cases,
  } = useApp()

  // The user's preferred courts (Profile > Court preference), the one with the most cases first
  const preferred = useDefaultCourt()
  // A new case starts on the preferred court, unless a court is already filled in (or an existing case is being edited)
  const prefilled = useRef(false)
  const autoFilled = useRef(false)
  useEffect(() => {
    if (!showAddCase) { prefilled.current = false; return }
    if (prefilled.current || editingCaseId || !preferred.ready || !preferred.court) return
    prefilled.current = true
    if (newCaseForm.court) return
    autoFilled.current = true
    setNewCaseForm(f => (f.court ? f : { ...f, court: preferred.court, district: preferred.district }))
  }, [showAddCase, editingCaseId, preferred.ready, preferred.court, preferred.district, setNewCaseForm])

  // Court numbers and their judges for the chosen court and district
  const [courtNumbers, setCourtNumbers] = useState([])
  // True while those are being loaded
  const [judgesLoading, setJudgesLoading] = useState(false)
  // The case itself keeps no judge, it is read from the court no. whenever it is shown, so a change of judge in
  // that court room is followed automatically

  // Court and district chosen on the form, used to look up court numbers
  const { court: formCourt, district: formDistrict } = newCaseForm

  // Reload court numbers when the court or district changes; clear them when either is empty
  useEffect(() => {
    if (!showAddCase || !formCourt || !formDistrict) {
      setCourtNumbers([])
      setJudgesLoading(false)
      return undefined
    }

    let alive = true
    setJudgesLoading(true)
    api.judgesList.courtNumbers({ court: formCourt, district: formDistrict })
      .then(rows => { if (alive) setCourtNumbers(Array.isArray(rows) ? rows : []) })
      .catch(() => { if (alive) setCourtNumbers([]) })
      .finally(() => { if (alive) setJudgesLoading(false) })

    return () => { alive = false }
  }, [showAddCase, formCourt, formDistrict])

  // The same court numbers grouped by building. A room the case already holds (an old case, or one the table no longer
  // lists) stays in the list, under its own building, so the case can still be opened. An old case saved before
  // buildings were kept gets its building from the table when the number is in only one building
  const caseCourtNoGroups = useMemo(() => {
    const groups = getCourtNosByBuilding(formCourt, formDistrict).map(g => ({ ...g, rooms: [...g.rooms] }))
    const no = (newCaseForm.courtNo || '').trim()
    if (!no) return groups
    const room = caseRoom({ court: formCourt, district: formDistrict, courtNo: no, building: newCaseForm.building, floor: newCaseForm.floor })
    const listed = groups.some(g => g.building === room.building && g.rooms.some(r => r.courtNo === no && r.floor === room.floor))
    if (listed) return groups
    let g = groups.find(x => x.building === room.building)
    if (!g) { g = { building: room.building, rooms: [], courtNos: [] }; groups.push(g) }
    g.rooms.push({ courtNo: no, floor: room.floor })
    return groups
  }, [courtRows, formCourt, formDistrict, newCaseForm.courtNo, newCaseForm.building, newCaseForm.floor])

  // Old case with a court no. but no building or floor yet: fill them in once the table is known
  useEffect(() => {
    const no = (newCaseForm.courtNo || '').trim()
    if (!no || !formCourt || (newCaseForm.building && newCaseForm.floor)) return
    const room = caseRoom({ court: formCourt, district: formDistrict, courtNo: no, building: newCaseForm.building, floor: newCaseForm.floor })
    if (room.building && (room.building !== newCaseForm.building || room.floor !== newCaseForm.floor)) {
      autoFilled.current = true
      setNewCaseForm(f => ({ ...f, building: room.building, floor: room.floor }))
    }
  }, [courtRows, formCourt, formDistrict, newCaseForm.courtNo, newCaseForm.building, newCaseForm.floor])

  // Text shown for a court room in the Court No. / Judge field: "Court No." and the number, then the judge(s) sitting in that room
  function roomLabel(g, r) {
    const names = [...new Set(
      judgesForRoom(courtNumbers, { courtNo: r.courtNo, building: g.building, floor: r.floor })
        .map(j => (j.judgeName || '').trim())
        .filter(Boolean)
    )]
    return names.length ? `Court No. ${r.courtNo} — ${names.join(' / ')}` : `Court No. ${r.courtNo}`
  }

  // Popup shown before a new case form: 0 = fresh/old question, 1 = the form itself
  const [stage, setStage] = useState(0)

  // Start from the first question every time the modal is closed
  useEffect(() => { if (!showAddCase) { setStage(0); setScanCnr('') } }, [showAddCase]) // eslint-disable-line react-hooks/exhaustive-deps

  // How the form looked when it was opened, to know whether anything was typed since
  const { fileSeq: _fileSeq, ...formWithoutAutoNumber } = newCaseForm
  const caseSignature = JSON.stringify({
    form: formWithoutAutoNumber, clients: caseClients.map(c => c.id), subTypes: caseClientSubTypes,
  })
  const caseBaseline = useRef(null)
  useEffect(() => { caseBaseline.current = showAddCase ? caseSignature : null }, [showAddCase, editingCaseId, stage]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!autoFilled.current) return
    autoFilled.current = false
    if (showAddCase) caseBaseline.current = caseSignature
  }, [caseSignature]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clicking outside never closes the form; the cross asks to save or discard unsaved details
  const { requestClose, dialog, overlayHandlers } = useUnsavedGuard({
    dirty: showAddCase && caseBaseline.current !== null && caseSignature !== caseBaseline.current,
    onSave: handleSaveCase,
    onDiscard: closeModal,
  })

  // Add by CNR: the case was read from eCourts (the advocate typed the CAPTCHA in the prompt) and its details fill the form.
  // The token ties the form to that lookup, so its hearing history and orders are saved with the case
  function onCnrFetched(detail, token) {
    setNewCaseForm(f => ({ ...f, ...cnrDetailToForm(detail, { advocateName: currentUser?.name }), addMode: 'CNR', lookupToken: token }))
    setStage(1)
  }

  // eCourts could not give the case: the form opens empty (with the CNR typed so far) to be filled by hand
  function onCnrFailed(cnr, message) {
    addToast(`${message || 'Could not fetch the case from eCourts'}. Fill in the case details manually.`, 'error')
    setNewCaseForm(f => ({ ...f, cnrNo: cnr, addMode: 'MANUAL', cnrDetail: null, lookupToken: '' }))
    setStage(1)
  }

  // A CNR the advocate already has a case for is not fetched again
  const hasCnr = cnr => (cases || []).some(c => String(c.cnrNo || '').toUpperCase().replace(/[\s-]/g, '') === cnr)

  // Nothing to show while the modal is closed
  if (!showAddCase) return null

  // Adding a new case: ask how it is added (by CNR or manually) before the form opens
  if (!editingCaseId && stage === 0) {
    return (
      <CaseAddModePrompt
        onClose={closeModal}
        onManual={() => { setNewCaseForm(f => ({ ...f, addMode: 'MANUAL' })); setStage(1) }}
        onFetched={onCnrFetched}
        onFailed={onCnrFailed}
        hasCnr={hasCnr}
        initialCnr={scanCnr}
      />
    )
  }

  // True when editing an existing case instead of adding one
  const isEditing = !!editingCaseId
  // A Juvenile Justice Board has no CNR number: the field is not asked and nothing is fetched from eCourts
  const juvenileBoard = isJuvenileBoard(newCaseForm.court)
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
        ...(isPoliceChallan(reliefSought)
          // Section and Acts & Sections are the same text: whichever is empty takes the other's
          ? (f.firSection ? (f.actsSections ? {} : { actsSections: f.firSection }) : { firSection: (f.actsSections || '').slice(0, 255) })
          : { firNo: '', firSection: '', policeStation: '' }),
      }
    })
  }

  // Changing the court resets the district: the preferred one for that court when the user chose one, else the first
  function changeCourt(court) {
    setNewCaseForm(f => ({ ...f, court, district: preferred.districtOf(court) || getDistricts(court)[0] || '', courtNo: '', building: '', floor: '' }))
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
              {newCaseForm.addMode === 'CNR' && newCaseForm.cnrDetail ? (
                <>
                  <p className="case-parties__hint">
                    Details taken from eCourts for CNR {newCaseForm.cnrNo}. Check them; adding a client is optional.
                    {' '}{newCaseForm.cnrDetail.hearingCount} hearing {newCaseForm.cnrDetail.hearingCount === 1 ? 'date' : 'dates'} and{' '}
                    {newCaseForm.cnrDetail.orderCount} {newCaseForm.cnrDetail.orderCount === 1 ? 'order' : 'orders'} are
                    added when you save the case; the order PDFs are downloaded in the background.
                  </p>
                  {(newCaseForm.cnrDetail.petitioners.length > 0 || newCaseForm.cnrDetail.respondents.length > 0) && (
                    <p className="case-parties__hint u-mt-6">
                      Petitioner: {newCaseForm.cnrDetail.petitioners.join(', ') || '—'}
                      {newCaseForm.cnrDetail.petitionerAdvocates.length > 0 && ` (Advocate: ${newCaseForm.cnrDetail.petitionerAdvocates.join(', ')})`}
                      {' · '}
                      Respondent: {newCaseForm.cnrDetail.respondents.join(', ') || '—'}
                      {newCaseForm.cnrDetail.respondentAdvocates.length > 0 && ` (Advocate: ${newCaseForm.cnrDetail.respondentAdvocates.join(', ')})`}
                    </p>
                  )}
                  {newCaseForm.cnrDetail.status !== 'Pending' && (
                    <p className="case-parties__hint u-mt-6">
                      eCourts shows this case as {newCaseForm.cnrDetail.status}; it is added with that status.
                    </p>
                  )}
                </>
              ) : (
                <p className="case-parties__hint">
                  Fill in the case details. The hearing dates and orders of a case added by hand are not brought in;
                  add the case by CNR to get them from eCourts.
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
                onChange={e => setNewCaseForm(f => ({ ...f, district: e.target.value, courtNo: '', building: '', floor: '' }))}
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
              <label className="form-label">Court No. / Judge</label>
              {/* Court rooms come from the court table for the chosen court and district; each shows the judge sitting there */}
              <Dropdown
                className="form-input"
                value={roomKey(newCaseForm.building, newCaseForm.floor, newCaseForm.courtNo)}
                disabled={!newCaseForm.court}
                onChange={e => {
                  const [building = '', floor = '', courtNo = ''] = e.target.value.split(KEY_SEP)
                  setNewCaseForm(f => ({ ...f, courtNo, building, floor }))
                }}
              >
                <option value={roomKey('', '', '')}>{newCaseForm.court ? (judgesLoading ? 'Loading court nos. and judges…' : 'Select Court No. / Judge') : 'Select a court first'}</option>
                {caseCourtNoGroups.flatMap(g => {
                  const opt = r => (
                    <option key={roomKey(g.building, r.floor, r.courtNo)} value={roomKey(g.building, r.floor, r.courtNo)}>
                      {roomLabel(g, r)}
                    </option>
                  )
                  // No building: plain options, no floor. With a building: one group per floor, "Building (Floor)"
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
            <div>
              <label className="form-label">Case Number{!juvenileBoard && <Req />}</label>
              <input className="form-input" placeholder="e.g. W.P.(C) 1234/2024"
                value={newCaseForm.caseNo} onChange={e => setNewCaseForm(f => ({ ...f, caseNo: e.target.value }))} />
            </div>
            {juvenileBoard ? (
              <div>
                <label className="form-label">CNR Number</label>
                <p className="case-parties__hint">
                  Not needed for a Juvenile Justice Board. The cause list number and orders are not fetched from eCourts for this case.
                </p>
              </div>
            ) : (
              <div>
                <label className="form-label">CNR Number<Req /></label>
                <input className="form-input" placeholder="e.g. DLHC010012342024"
                  readOnly={!isEditing && newCaseForm.addMode === 'CNR'}
                  value={newCaseForm.cnrNo} onChange={e => setNewCaseForm(f => ({ ...f, cnrNo: e.target.value }))} />
              </div>
            )}
            <div>
              <label className="form-label">Filing Date</label>
              <ClearableDateInput className="form-input" 
                value={newCaseForm.filingDate} onChange={e => setNewCaseForm(f => ({ ...f, filingDate: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Registration Date</label>
              <ClearableDateInput className="form-input"
                value={newCaseForm.registrationDate} onChange={e => setNewCaseForm(f => ({ ...f, registrationDate: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">First Hearing Date</label>
              <ClearableDateInput className="form-input"
                value={newCaseForm.firstHearingDate} onChange={e => setNewCaseForm(f => ({ ...f, firstHearingDate: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Case Stage</label>
              <input className="form-input" placeholder="e.g. Arguments" maxLength={255}
                value={newCaseForm.caseStage} onChange={e => setNewCaseForm(f => ({ ...f, caseStage: e.target.value }))} />
            </div>
            <div className="form-grid-full">
              <label className="form-label">Acts &amp; Sections</label>
              {/* In a police challan case this is the same text as the Section above (changing one changes the other), so it is limited to the Section's length */}
              <input className="form-input" placeholder="e.g. Negotiable Instruments Act - Section 138"
                maxLength={isPoliceChallan(newCaseForm.reliefSought) ? 255 : 1000}
                value={newCaseForm.actsSections}
                onChange={e => setNewCaseForm(f => ({
                  ...f,
                  actsSections: e.target.value,
                  ...(isPoliceChallan(f.reliefSought) ? { firSection: e.target.value.slice(0, 255) } : {}),
                }))} />
            </div>
            {(newCaseForm.decisionDate || newCaseForm.disposalNature) && (
              <>
                <div>
                  <label className="form-label">Decision Date</label>
                  <ClearableDateInput className="form-input"
                    value={newCaseForm.decisionDate} onChange={e => setNewCaseForm(f => ({ ...f, decisionDate: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Nature of Disposal</label>
                  <input className="form-input" placeholder="As eCourts gives it" maxLength={255}
                    value={newCaseForm.disposalNature} onChange={e => setNewCaseForm(f => ({ ...f, disposalNature: e.target.value }))} />
                </div>
              </>
            )}

            <PartiesSection />

            <FileNumberField form={newCaseForm} setForm={setNewCaseForm} />
            {/* Asked only when a case is added; afterwards it changes through the Next Hearing Update button.
                When added by CNR the next date is the one eCourts gives */}
            {!isEditing && (
              <div>
                <label className="form-label">Next Hearing</label>
                <HearingDateInput
                  value={newCaseForm.nextHearing}
                  onChange={v => setNewCaseForm(f => ({ ...f, nextHearing: v }))} />
              </div>
            )}
            <div className="form-grid-full">
              <label className="form-label">Description</label>
              <textarea className="form-input" rows={3} style={{ resize: 'none' }} placeholder="Brief description of the case…"
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