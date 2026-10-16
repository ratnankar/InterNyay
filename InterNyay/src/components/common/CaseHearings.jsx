import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import { formatDisplayDate } from '../../utils/dateUtils'
import HearingDateInput from './HearingDateInput'
import SeeMoreList from './SeeMoreList'

import Icon from './Icon'
import { getErrorMessage } from '../../utils/errorMessages'
import { isClosedCase } from '../../constants/data'
import { confirmDialog } from '../../utils/confirmDialog'
import useSessionState from '../../hooks/useSessionState'
// Hearing history of a case with its documents, and the button to set the next hearing
export default function CaseHearings({ caseItem, dashboard = false }) {
  const {
    addToast,
    hearingsVersion,
    bumpHearings,
    syncCaseNextHearing,
    handleViewDocument,
    openNextHearing,
  } = useApp()

  // Hearing history for this case, loaded from the API
  const [hearings, setHearings] = useState([])
  // Loading and error state for the history fetch
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // On the dashboard the list starts collapsed; on the case page it starts open
  const [expanded, setExpanded] = useSessionState(`hearings_open_${dashboard ? 'dash' : 'case'}_${caseItem?.id}`, !dashboard)

  // Id of the hearing row being edited, plus its draft date and note
  const [editingId, setEditingId] = useState(null)
  const [draftDate, setDraftDate] = useState('')
  const [draftNote, setDraftNote] = useState('')
  // Row currently saving, uploading or deleting, so its buttons can be disabled
  const [busyId, setBusyId] = useState(null)

  // Hidden file input used to attach an order PDF to a hearing
  const fileRef = useRef(null)
  // Remembers which hearing the chosen order file belongs to
  const uploadForRef = useRef(null)

  // A decided or withdrawn case has no next hearing, so it cannot be moved to one
  const closed = isClosedCase(caseItem)
  // Orders are fetched, uploaded or shown only on the case page, never on the dashboard
  const canManageOrders = !dashboard

  // Short alias for the case id used by the fetch and the handlers
  const caseId = caseItem?.id

  // Fetch the hearing history for this case
  const load = useCallback(() => {
    if (!caseId) return

    setLoading(true)
    api.cases.hearings(caseId)
      .then(rows => {
        setHearings(Array.isArray(rows) ? rows : [])
        setError('')
      })
      .catch(e => setError(getErrorMessage(e, 'Could not load the hearing history')))
      .finally(() => setLoading(false))
  }, [caseId])

  // Reload whenever the case changes or a hearing is added or edited elsewhere (hearingsVersion bumps)
  useEffect(() => { load() }, [load, hearingsVersion])

  // Save the edited date and note; a date is required
  async function saveEntry(h) {
    if (!draftDate) {
      addToast('A hearing entry needs a date', 'error')
      return
    }

    setBusyId(h.id)
    try {
      await api.hearings.update(h.id, {
        date: draftDate,
        notes: draftNote,
      })
      setEditingId(null)
      bumpHearings()
      addToast(draftDate !== h.date ? 'Hearing date updated' : 'Hearing note saved')
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not save the hearing'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  // Open a row for editing and copy its current values into the drafts
  function startEdit(h) {
    setEditingId(h.id)
    setDraftDate(h.date || '')
    setDraftNote(h.notes || '')
  }

  // Remember which hearing is being uploaded for, then open the file picker
  function pickOrderFile(hearingId) {
    uploadForRef.current = hearingId
    if (fileRef.current) {
      fileRef.current.value = ''
      fileRef.current.click()
    }
  }

  // Upload the chosen order PDF to that hearing
  async function onOrderChosen(e) {
    const file = e.target.files?.[0]
    const hearingId = uploadForRef.current
    if (!file || !hearingId) return

    setBusyId(hearingId)
    try {
      await api.hearings.uploadOrder(hearingId, file)
      bumpHearings(caseId)
      addToast('Order uploaded')
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not upload the order'), 'error')
    } finally {
      setBusyId(null)
      uploadForRef.current = null
    }
  }

  // Get the order from eCourts: the first time it is fetched and stored, after that the stored copy is used
  async function fetchOrder(h) {
    setBusyId(h.id)
    try {
      const res = await api.hearings.fetchOrder(h.id)
      if (res?.status === 'FETCHED' || res?.status === 'STORED') {
        bumpHearings(caseId)
        addToast('Order ready')
      } else {
        addToast(res?.message || 'The order is not available', 'error')
      }
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not get the order from eCourts'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  // Detach the order PDF from a hearing after a confirm
  async function removeOrder(h) {
    if (!await confirmDialog(`Remove the order attached to ${formatDisplayDate(h.date)}?`)) return

    setBusyId(h.id)
    try {
      await api.hearings.removeOrder(h.id)
      bumpHearings(caseId)
      addToast('Order removed')
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not remove the order'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  // Delete the whole hearing entry (its order PDF goes with it) after a confirm
  async function removeHearing(h) {
    if (!await confirmDialog(`Delete the entry for ${formatDisplayDate(h.date)}? Its order PDF is deleted too.`)) return

    setBusyId(h.id)
    try {
      const res = await api.hearings.remove(h.id)
      // The case's next hearing may have moved on or gone blank, so Next Hearing and Edit Case follow it
      if (res && res.nextHearing !== undefined) syncCaseNextHearing(caseId, res.nextHearing)
      bumpHearings(caseId)
      addToast('Hearing entry deleted')
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not delete the entry'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="hearing-history" onClick={e => e.stopPropagation()}>

      <div className="hearing-history__header">
        {dashboard ? (
          <button
            type="button"
            className="hearing-history__toggle"
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
          >
            <span className={`hearing-history__caret${expanded ? ' hearing-history__caret--open' : ''}`}>▸</span>
            Hearing History{!loading && hearings.length > 0 ? ` (${hearings.length})` : ''}
          </button>
        ) : (
          <p className="case-detail__docs-label">Hearing History</p>
        )}

        {/* No next hearing to set once the case is decided or withdrawn */}
        {!closed && (
          <div className="hearing-history__next">
            <span className="hearing-history__next-label">Next Hearing</span>
            <strong className="hearing-history__next-date">
              {caseItem?.nextHearing ? formatDisplayDate(caseItem.nextHearing) : '—'}
            </strong>
            <button type="button"
              className="btn-outline btn-outline--sm"
              onClick={() => openNextHearing(caseItem)}
            >
              <Icon name="edit" /> Update
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <>
          {loading && <p className="hearing-history__empty">Loading hearings…</p>}

          {!loading && error && (
            <p className="hearing-history__empty hearing-history__empty--error">{error}</p>
          )}

          {!loading && !error && hearings.length === 0 && (
            <p className="hearing-history__empty">
              {closed
                ? 'No hearing dates recorded for this case.'
                : <>No hearing dates recorded yet. Use <strong>Update</strong> above to note what happened
              on a date and move the case to its next one.</>}
            </p>
          )}

          {!loading && !error && (
          <SeeMoreList items={hearings} step={10} resetKey={caseItem.id}>
          {shownHearings => shownHearings.map(h => {
          const editing = editingId === h.id
          const busy = busyId === h.id
          const orderDue = !!h.orderDue

          return (
            <div key={h.id} className="hearing-entry">

              <div className="hearing-entry__date">
                <span className="hearing-entry__date-text">{formatDisplayDate(h.date)}</span>
                {/* Read-only: shows old outcomes such as Withdrawn, but can no longer be filled in */}
                {h.outcome && !editing && (
                  <span className="hearing-entry__outcome">{h.outcome}</span>
                )}
              </div>

              <div className="hearing-entry__body">

                {editing ? (
                  <>
                    <div className="hearing-entry__edit-row">
                      <label className="form-label">Hearing date</label>
                      <HearingDateInput
                        value={draftDate}
                        onChange={setDraftDate}
                        clearable={false}
                      />
                    </div>
                    <textarea
                      className="form-input hearing-entry__note-input"
                      rows={3}
                      placeholder="Note for this hearing date…"
                      value={draftNote}
                      onChange={e => setDraftNote(e.target.value)}
                    />
                    <div className="hearing-entry__edit-actions">
                      <button type="button"
                        className="btn-outline btn-outline--sm"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                      <button type="button"
                        className="btn-gold btn-outline--sm"
                        disabled={busy}
                        onClick={() => saveEntry(h)}
                      >
                        {busy ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className={`hearing-entry__note${h.notes ? '' : ' hearing-entry__note--empty'}`}>
                      {h.notes || 'No note for this date'}
                    </p>
                  </>
                )}

                {dashboard ? null : h.orderDocId ? (
                  <div className="hearing-entry__order">
                    <span className="hearing-entry__order-icon"><Icon name="file" /></span>
                    <span className="hearing-entry__order-name">
                      {h.date ? `Order - ${formatDisplayDate(h.date)}` : 'Order'}
                    </span>
                    <button type="button"
                      className="btn-outline btn-outline--sm"
                      title="Open in this tab"
                      onClick={() => handleViewDocument({ id: h.orderDocId, name: h.orderDocName })}
                    >
                      <Icon name="eye" /> Open
                    </button>
                    {canManageOrders && (
                      <>
                        <button type="button"
                          className="btn-outline btn-outline--sm"
                          disabled={busy}
                          onClick={() => pickOrderFile(h.id)}
                        >
                          <Icon name="upload" /> Replace
                        </button>
                        <button type="button"
                          className="btn-icon btn-icon--danger"
                          title="Remove the order"
                          disabled={busy}
                          onClick={() => removeOrder(h)}
                        >
                          <Icon name="trash" />
                        </button>
                      </>
                    )}
                  </div>
                ) : !orderDue ? null : h.noOrderOnRecord ? (
                  <div className="hearing-entry__order-actions">
                    <span className="hearing-entry__order-note">No order for this date</span>
                  </div>
                ) : (
                  <div className="hearing-entry__order-actions">
                    {h.ordersNotDeclared ? (
                      <span className="hearing-entry__order-note" title={h.ordersNotDeclaredReason || undefined}>
                        {h.ordersNotDeclaredReason || 'Orders are not declared'}
                      </span>
                    ) : h.orderOnEcourts && (
                      <button type="button"
                        className="btn-outline btn-outline--sm hearing-entry__attach"
                        disabled={busy || !caseItem?.cnrNo}
                        title={caseItem?.cnrNo ? 'Get this hearing\'s order from eCourts' : 'Add the CNR number to this case to fetch its orders'}
                        onClick={() => fetchOrder(h)}
                      >
                        <Icon name="file" /> {busy ? 'Please wait…' : 'Get order from eCourts'}
                      </button>
                    )}
                    {canManageOrders && (
                      <button type="button"
                        className="btn-outline btn-outline--sm hearing-entry__attach"
                        disabled={busy}
                        onClick={() => pickOrderFile(h.id)}
                      >
                        + Attach Order PDF
                      </button>
                    )}
                  </div>
                )}
              </div>

              {!editing && !dashboard && (
                <div className="hearing-entry__actions">
                  <button type="button"
                    className="btn-outline btn-outline--sm"
                    title="Edit this hearing's date and note"
                    onClick={() => startEdit(h)}
                  >
                    <Icon name="edit" /> Edit
                  </button>
                  <button type="button"
                    className="btn-icon btn-icon--danger"
                    title="Delete this hearing entry"
                    disabled={busy}
                    onClick={() => removeHearing(h)}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              )}
            </div>
          )
          })}
          </SeeMoreList>
          )}
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,application/pdf,image/*"
        className="u-hidden"
        onChange={onOrderChosen}
      />
    </div>
  )
}
