import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import { onLiveRefresh } from '../../utils/liveRefresh'
import { formatDisplayDate } from '../../utils/dateUtils'
import HearingDateInput from './HearingDateInput'
import SeeMoreList from './SeeMoreList'
import { isMiscOnlyHearing, joinHearingNotes, splitHearingNotes } from '../misc/miscUtils'
import MiscHearingsSection from '../misc/MiscHearingsSection'

import Icon from './Icon'
import SyncNextHearingButton from './SyncNextHearingButton'
import { getErrorMessage } from '../../utils/errorMessages'
import { isClosedCase } from '../../constants/data'
import { confirmDialog } from '../../utils/confirmDialog'
import useSessionState from '../../hooks/useSessionState'
import { beginOrderTask, endOrderTask, usePendingOrders } from '../../utils/pendingOrders'
// Hearing history of a case with its documents, and the button to set the next hearing
export default function CaseHearings({ caseItem, dashboard = false }) {
  const {
    addToast,
    hearingsVersion,
    bumpHearings,
    syncCaseNextHearing,
    handleViewDocument,
    openNextHearing,
    miscHearingCounts,
  } = useApp()

  // Hearing history for this case, loaded from the API
  const [hearings, setHearings] = useState([])
  // Loading and error state for the history fetch
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Misc. applications filed in this case, each with its own hearing dates (the case page only)
  const [miscApps, setMiscApps] = useState([])

  // On the dashboard the list starts collapsed; on the case page it starts open
  const [expanded, setExpanded] = useSessionState(`hearings_open_${dashboard ? 'dash' : 'case'}_${caseItem?.id}`, !dashboard)

  // Id of the hearing row being edited, plus its draft date and note
  const [editingId, setEditingId] = useState(null)
  const [draftDate, setDraftDate] = useState('')
  const [draftNote, setDraftNote] = useState('')
  // Row currently saving, uploading or deleting, so its buttons can be disabled
  const [busyId, setBusyId] = useState(null)
  const pendingOrders = usePendingOrders()

  // Hidden file input used to attach an order PDF to a hearing
  const fileRef = useRef(null)
  // Remembers which hearing the chosen order file belongs to
  const uploadForRef = useRef(null)

  // The case's own hearings plus the hearing dates of its misc. applications
  const historyCount = hearings.length + (miscHearingCounts.get(caseItem?.id) || 0)

  // A decided or withdrawn case has no next hearing, so it cannot be moved to one
  const closed = isClosedCase(caseItem)
  // Orders are fetched, uploaded or shown only on the case page, never on the dashboard
  const canManageOrders = !dashboard

  // Short alias for the case id used by the fetch and the handlers
  const caseId = caseItem?.id

  // Fetch the hearing history for this case
  // silent: a background reload, no spinner and no error flash
  const load = useCallback((silent = false) => {
    if (!caseId) return

    if (!silent) setLoading(true)
    api.cases.hearings(caseId)
      .then(rows => {
        setHearings(Array.isArray(rows) ? rows.filter(h => !isMiscOnlyHearing(h)) : [])
        setError('')
      })
      .catch(e => { if (!silent) setError(getErrorMessage(e, 'Could not load the hearing history')) })
      .finally(() => { if (!silent) setLoading(false) })
  }, [caseId])

  // Orders read from eCourts when the case was added are still downloading: look again every few seconds until they are in
  const downloading = hearings.some(h => h.orderDownloading)
  useEffect(() => {
    if (!downloading) return undefined
    const timer = setInterval(() => load(true), 4000)
    return () => clearInterval(timer)
  }, [downloading, load])

  // Reload whenever the case changes or a hearing is added or edited elsewhere (hearingsVersion bumps)
  useEffect(() => { load() }, [load, hearingsVersion])
  // And quietly when the tab is back in view, for hearings changed on another device
  useEffect(() => onLiveRefresh(() => load(true)), [load])

  // The case's pending applications, so their hearing dates can be updated here, apart from the case's own next hearing
  useEffect(() => {
    if (!caseId || dashboard) return undefined
    let cancelled = false
    const loadApps = quiet => api.miscApplications.list({ caseId, page: 0, size: 100 })
      .then(res => { if (!cancelled) setMiscApps(res?.content || []) })
      .catch(() => { if (!cancelled && !quiet) setMiscApps([]) })
    loadApps(false)
    const stopLive = onLiveRefresh(() => { loadApps(true) })
    return () => { cancelled = true; stopLive() }
  }, [caseId, dashboard, hearingsVersion])

  // An application changed from here: keep its row current
  const replaceMiscApp = updated => setMiscApps(prev => prev.map(a => (a.id === updated.id ? updated : a)))

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
        notes: joinHearingNotes(draftNote, splitHearingNotes(h.notes).applications),
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
    setDraftNote(splitHearingNotes(h.notes).note)
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
    if (!beginOrderTask(hearingId)) return

    try {
      await api.hearings.uploadOrder(hearingId, file)
      bumpHearings(caseId)
      addToast('Order uploaded')
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not upload the order'), 'error')
    } finally {
      endOrderTask(hearingId)
      uploadForRef.current = null
    }
  }

  // Get the order from eCourts: the first time it is fetched and stored, after that the stored copy is used
  async function fetchOrder(h) {
    if (!beginOrderTask(h.id)) return

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
      endOrderTask(h.id)
    }
  }

  // Detach the order PDF from a hearing after a confirm
  async function removeOrder(h) {
    if (!await confirmDialog(`Remove the order attached to ${formatDisplayDate(h.date)}?`)) return
    if (!beginOrderTask(h.id)) return

    try {
      await api.hearings.removeOrder(h.id)
      bumpHearings(caseId)
      addToast('Order removed')
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not remove the order'), 'error')
    } finally {
      endOrderTask(h.id)
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

      {/* The applications filed in this case, each with its own hearings, apart from the case's own */}
      {!dashboard && <MiscHearingsSection caseId={caseId} apps={miscApps} onChange={replaceMiscApp} />}

      <div className="hearing-history__header">
        {dashboard ? (
          <button
            type="button"
            className="hearing-history__toggle"
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
          >
            <span className={`hearing-history__caret${expanded ? ' hearing-history__caret--open' : ''}`}>▸</span>
            Hearing History{!loading && historyCount > 0 ? ` (${historyCount})` : ''}
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
            {/* Refresh from eCourts, shown while the date is over; Update stays for changing it by hand */}
            <SyncNextHearingButton caseItem={caseItem} />
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
          const busy = busyId === h.id || pendingOrders.has(h.id)
          const orderDue = !!h.orderDue
          const { note } = splitHearingNotes(h.notes)

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
                        caseId={caseId}
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
                        {busyId === h.id ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className={`hearing-entry__note${note ? '' : ' hearing-entry__note--empty'}`}>
                      {note || 'No note for this date'}
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
                    ) : h.orderDownloading ? (
                      <span className="hearing-entry__order-note">Downloading order…</span>
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
