import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import useImageCrop from '../../hooks/useImageCrop'
import useOverlayClose from '../../hooks/useOverlayClose'
import ModalPortal from '../common/ModalPortal'
import Dropdown from '../common/Dropdown'
import Icon from '../common/Icon'
import useUnsavedGuard from '../../hooks/useUnsavedGuard'
import JudgeProfilePicker, { Thumb } from './JudgeProfilePicker'
import { courtDistrictLabel } from '../../constants/courts'
import { getErrorMessage } from '../../utils/errorMessages'

// "Saket Court · Building A · Court No. 12" for a listing
const seatText = (l) => [courtDistrictLabel(l.court, l.district), l.building ? `Building ${l.building}` : '', l.courtRoomNo ? `Court No. ${l.courtRoomNo}` : '']
  .filter(Boolean).join(' · ')

// Dialog to change the judge of a listing. The listing stays as it is (court, building, court no., contacts, jurisdiction),
// only its judge changes. The judge who sat there stays in the history up to the day before, the new one starts on the date chosen.
// The judge can be picked from the Judges list or added as a new judge. The court can also be marked vacant (no judge from a date,
// for example between two transfers); a vacant court is given a judge from this same dialog
export default function ChangeJudgeModal({ listing, judges, listings, onClose, onDone }) {
  const { addToast } = useApp()
  // True when the court has no judge right now: the dialog then assigns one
  const wasVacant = !!listing.vacant
  const overlayHandlers = useOverlayClose(onClose, { backdrop: false })

  // 'existing' = pick from the Judges list, 'new' = type a new judge, 'vacant' = the court has no judge from the date
  const [mode, setMode] = useState('existing')
  const [picked, setPicked] = useState(null)
  const [newName, setNewName] = useState('')
  const [newPhoto, setNewPhoto] = useState('')
  const [from, setFrom] = useState('')
  // What happens to the court the incoming judge is leaving: KEEP_BOTH, SWAP or REPLACE
  const [plan, setPlan] = useState('KEEP_BOTH')
  const [leavingId, setLeavingId] = useState('')
  const [replacementId, setReplacementId] = useState('')
  const [saving, setSaving] = useState(false)

  const { pick: pickPhoto, cropper } = useImageCrop({
    shape: 'portrait',
    title: 'Adjust judge photo',
    onError: msg => addToast(msg, 'error'),
  })

  // Courts the incoming judge holds now (other than this one)
  const leaving = useMemo(
    () => mode === 'existing' && picked ? listings.filter(l => l.judgeId === picked.id && l.id !== listing.id) : [],
    [mode, picked, listings, listing.id])

  // Courts the judge being replaced still holds besides this one
  const outgoingElsewhere = wasVacant ? [] : listings.filter(l => l.judgeId === listing.judgeId && l.id !== listing.id)

  const incomingName = mode === 'vacant' ? 'Vacant' : mode === 'existing' ? picked?.name : newName.trim()
  const leavingListing = leaving.find(l => String(l.id) === String(leavingId)) || (leaving.length === 1 ? leaving[0] : null)

  function choose(judge) {
    setPicked(judge)
    setPlan('KEEP_BOTH')
    setLeavingId('')
    setReplacementId('')
  }

  // Closing with unsaved changes asks Save / Discard / Cancel
  const { requestClose, dialog } = useUnsavedGuard({
    dirty: !!picked || !!newName.trim() || !!newPhoto || !!from || mode === 'vacant',
    onSave: () => save(),
    onDiscard: onClose,
  })

  async function save() {
    if (!incomingName) {
      addToast(mode === 'existing' ? 'Choose a judge' : 'Enter the judge name', 'error')
      return
    }

    const body = mode === 'vacant' ? { vacant: true }
      : mode === 'existing' ? { judgeId: picked.id } : { name: newName.trim(), photo: newPhoto }
    if (from) body.effectiveFrom = from

    if (leaving.length > 0 && plan !== 'KEEP_BOTH') {
      if (!leavingListing) { addToast('Choose the court the judge is leaving', 'error'); return }
      if (plan === 'REPLACE' && !replacementId) { addToast('Choose the judge who takes that court', 'error'); return }
      body.leavingPlan = plan
      body.fromListingId = leavingListing.id
      if (plan === 'REPLACE') body.replacementJudgeId = Number(replacementId)
    }

    setSaving(true)
    try {
      await api.judgesList.changeJudge(listing.id, body)
      addToast(mode === 'vacant' ? 'Court marked vacant' : wasVacant ? 'Judge assigned' : 'Judge changed')
      onDone()
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not change the judge'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalPortal>
      {cropper}
      <div className="overlay" {...overlayHandlers}>
        <div className="modal modal--wide" onClick={e => e.stopPropagation()}>
          <h3 className="section-title">{wasVacant ? 'Assign a judge' : 'Change judge'}</h3>

          <div className="change-judge__current">
            <Thumb src={wasVacant ? '' : listing.photo} name={wasVacant ? 'Vacant' : listing.name} />
            <div className="change-judge__who">
              <strong>{wasVacant ? 'Court vacant (no judge)' : listing.name}</strong>
              <span className="change-judge__sub">{seatText(listing)}</span>
            </div>
          </div>

          <div className="change-judge__tabs">
            <button type="button" className={mode === 'existing' ? 'btn-gold' : 'btn-outline'} onClick={() => setMode('existing')}>Choose an existing judge</button>
            <button type="button" className={mode === 'new' ? 'btn-gold' : 'btn-outline'} onClick={() => setMode('new')}>Add a new judge</button>
            {!wasVacant && (
              <button type="button" className={mode === 'vacant' ? 'btn-gold' : 'btn-outline'} onClick={() => setMode('vacant')}>Court vacant (no judge)</button>
            )}
          </div>

          {mode === 'vacant' ? (
            <p className="admin__hint">
              Use this when {listing.name} has left this court and the next judge has not joined yet. The court stays in the list
              marked <strong>Vacant</strong>, and the gap shows in its history. When a judge joins, use <strong>Assign judge</strong> on this court.
            </p>
          ) : mode === 'existing' ? (
            <JudgeProfilePicker judges={judges} value={picked} onChange={choose} excludeIds={[listing.judgeId]} />
          ) : (
            <div className="judge-new judge-new--form">
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input className="form-input" value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Photo</label>
                <div className="admin__photo">
                  {newPhoto
                    ? <img className="admin__photo-preview" src={newPhoto} alt="Judge" />
                    : <span className="admin__photo-preview admin__photo-preview--empty"><Icon name="scale" /></span>}
                  <div className="admin__photo-actions">
                    <input className="form-input" type="file" accept="image/*"
                      onChange={e => { pickPhoto(e.target.files?.[0], setNewPhoto); e.target.value = '' }} />
                    {newPhoto && <button type="button" className="btn-outline btn-outline--sm" onClick={() => setNewPhoto('')}>Remove photo</button>}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="form-group u-mt-12">
            <label className="form-label">{mode === 'vacant' ? 'Court is vacant from' : 'Starts in this court on'}</label>
            <input className="form-input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
            <p className="admin__hint">
              {wasVacant
                ? 'Leave empty to start today. The court stays marked vacant in its history up to the day before.'
                : `Leave empty to start today. ${listing.name} stays in this court's history up to the day before.`}
            </p>
          </div>

          {/* The incoming judge already sits in another court: say what happens to that court */}
          {leaving.length > 0 && (
            <div className="form-group">
              <label className="form-label">{picked.name} already sits in {leaving.length === 1 ? 'another court' : 'other courts'}. What happens there?</label>

              <label className="admin__check">
                <input type="radio" name="plan" checked={plan === 'KEEP_BOTH'} onChange={() => setPlan('KEEP_BOTH')} />
                Nothing changes there, {picked.name} holds both courts
              </label>
              <label className="admin__check">
                <input type="radio" name="plan" checked={plan === 'SWAP'} onChange={() => setPlan('SWAP')} />
                {listing.name} takes that court (swap)
              </label>
              <label className="admin__check">
                <input type="radio" name="plan" checked={plan === 'REPLACE'} onChange={() => setPlan('REPLACE')} />
                Another judge takes that court
              </label>

              {plan !== 'KEEP_BOTH' && leaving.length > 1 && (
                <Dropdown className="form-input" value={leavingId} onChange={e => setLeavingId(e.target.value)}>
                  <option value="">Which court is {picked.name} leaving?</option>
                  {leaving.map(l => <option key={l.id} value={l.id}>{seatText(l)}</option>)}
                </Dropdown>
              )}

              {plan === 'REPLACE' && (
                <Dropdown className="form-input" value={replacementId} onChange={e => setReplacementId(e.target.value)}>
                  <option value="">Judge who takes {leavingListing ? seatText(leavingListing) : 'that court'}</option>
                  {judges.filter(j => j.id !== picked.id).map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                </Dropdown>
              )}
            </div>
          )}

          {incomingName && (
            <div className="change-judge__result">
              <p>Only the judge changes. Court, building, court no., designation and contacts stay as they are, and the history is kept.</p>
              {mode === 'vacant'
                ? <p>This court will show as <strong>Vacant</strong> until a judge is assigned to it.</p>
                : <p><strong>{incomingName}</strong> will be the judge of this listing.</p>}
              {leaving.length > 0 && plan === 'KEEP_BOTH' && <p>{incomingName} will hold {leaving.length + 1} courts.</p>}
              {leaving.length > 0 && plan === 'SWAP' && leavingListing && <p><strong>{listing.name}</strong> takes {seatText(leavingListing)}.</p>}
              {leaving.length > 0 && plan === 'REPLACE' && leavingListing && <p>{seatText(leavingListing)} gets the judge you choose.</p>}
              {!wasVacant && plan !== 'SWAP' && (outgoingElsewhere.length > 0
                ? <p><strong>{listing.name}</strong> still holds {outgoingElsewhere.length === 1 ? 'another court' : `${outgoingElsewhere.length} other courts`}.</p>
                : <p><strong>{listing.name}</strong> stays in the Judges list as not holding a court.</p>)}
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={requestClose}>Cancel</button>
            <button type="button" className="btn-gold" onClick={save} disabled={saving || !incomingName}>{saving ? 'Saving…' : mode === 'vacant' ? 'Mark court vacant' : wasVacant ? 'Assign judge' : 'Change judge'}</button>
          </div>
        </div>
      </div>
      {dialog}
    </ModalPortal>
  )
}
