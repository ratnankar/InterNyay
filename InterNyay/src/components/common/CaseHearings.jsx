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
import { getErrorMessage } from '../../utils/errorMessages'
import { isClosedCase } from '../../constants/data'
import { confirmDialog } from '../../utils/confirmDialog'
import useSessionState from '../../hooks/useSessionState'
import { beginOrderTask, endOrderTask, usePendingOrders } from '../../utils/pendingOrders'

export default function CaseHearings({ caseItem, dashboard = false, onCaseRefreshed }) {
  const {
    addToast,
    hearingsVersion,
    bumpHearings,
    syncCaseNextHearing,
    handleViewDocument,
    openNextHearing,
    miscHearingCounts,
  } = useApp()

  const [hearings, setHearings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [miscApps, setMiscApps] = useState([])

  const [expanded, setExpanded] = useSessionState(
    `hearings_open_${dashboard ? 'dash' : 'case'}_${caseItem?.id}`,
    !dashboard
  )

  const [editingId, setEditingId] = useState(null)
  const [draftDate, setDraftDate] = useState('')
  const [draftNote, setDraftNote] = useState('')
  // 'refresh' is used by the eCourts refresh button (row ids are numbers, so no clash)
  const [busyId, setBusyId] = useState(null)
  const pendingOrders = usePendingOrders()

  const fileRef = useRef(null)
  const uploadForRef = useRef(null)

  const historyCount = hearings.length + (miscHearingCounts.get(caseItem?.id) || 0)

  const closed = isClosedCase(caseItem)
  const canManageOrders = !dashboard

  const caseId = caseItem?.id

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

  useEffect(() => { load() }, [load, hearingsVersion])
  useEffect(() => onLiveRefresh(() => load(true)), [load])

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

  const replaceMiscApp = updated =>
    setMiscApps(prev => prev.map(a => (a.id === updated.id ? updated : a)))

  // ===== NEW: read the case again from eCourts right now =====
  async function refreshFromEcourts() {
    if (!caseId) return
    setBusyId('refresh')
    try {
      const res = await api.cases.refreshHearing(caseId)

      // Sync only what really changed: the sync also clears the cause list number, which belongs to the old date
      const dateChanged = res && res.nextHearing !== undefined
        && (res.nextHearing || null) !== (caseItem?.nextHearing || null)
      const statusChanged = res && res.status && res.status !== caseItem?.status
      if (dateChanged || statusChanged) {
        syncCaseNextHearing(
          caseId,
          res.nextHearing,
          statusChanged ? { status: res.status, decisionDate: res.decisionDate || null } : {}
        )
        onCaseRefreshed?.(caseId, res)
      }

      // Reload the hearing list so any auto-recorded hearing shows up
      bumpHearings(caseId)
      addToast(res?.message || 'Refreshed from eCourts')
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not refresh from eCourts'), 'error')
    } finally {
      setBusyId(null)
    }
  }

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

  function startEdit(h) {
    setEditingId(h.id)
    setDraftDate(h.date || '')
    setDraftNote(splitHearingNotes(h.notes).note)
  }

  function pickOrderFile(hearingId) {
    uploadForRef.current = hearingId
    if (fileRef.current) {
      fileRef.current.value = ''
      fileRef.current.click()
    }
  }

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

  // The "Get order" button: orders are only downloaded when asked for, never when a case is added, refreshed or auto updated
  async function getOrder(h) {
    if (!beginOrderTask(h.id)) return
    try {
      await api.hearings.fetchOrder(h.id)
      bumpHearings(caseId)
      addToast('Order downloaded')
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not download the order from eCourts'), 'error')
    } finally {
      endOrderTask(h.id)
    }
  }

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

  async function removeHearing(h) {
    if (!await confirmDialog(`Delete the entry for ${formatDisplayDate(h.date)}? Its order PDF is deleted too.`)) return
    setBusyId(h.id)
    try {
      const res = await api.hearings.remove(h.id)
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

        <div className="hearing-history__next">
          {!closed && (
            <>
              <span className="hearing-history__next-label">Next Hearing</span>
              <strong className="hearing-history__next-date">
                {caseItem?.nextHearing ? formatDisplayDate(caseItem.nextHearing) : '—'}
              </strong>
            </>
          )}

          {/* Refresh from eCourts: shown for every case, also a closed one (it then only fills in missing hearing dates and orders) */}
          <button type="button"
            className={`btn-outline btn-outline--sm${dashboard ? ' hearing-history__refresh-btn' : ''}`}
            title="Read the case from eCourts now: next hearing date, missing past hearing dates and their orders"
            disabled={busyId === 'refresh'}
            onClick={refreshFromEcourts}
            {...(dashboard ? { 'aria-label': busyId === 'refresh' ? 'Refreshing…' : 'Refresh' } : {})}
          >
            {dashboard
              // Dashboard: the refresh symbol alone (it spins while the case is being read from eCourts)
              ? <Icon name="refresh" className={`hearing-history__refresh-icon${busyId === 'refresh' ? ' hearing-history__refresh-icon--spin' : ''}`} />
              : (busyId === 'refresh' ? 'Refreshing…' : 'Refresh')}
          </button>

          {!closed && (
            <button type="button"
              className="btn-outline btn-outline--sm"
              onClick={() => openNextHearing(caseItem)}
            >
              <Icon name="edit" /> Update
            </button>
          )}
        </div>
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

                {h.orderDocId ? (
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
                ) : h.orderOnEcourts && !h.ordersNotDeclared ? (
                  // Only dates on which eCourts lists an order get the button
                  <div className="hearing-entry__order-actions">
                    <button type="button"
                      className="btn-outline btn-outline--sm"
                      title="Download the order of this date from eCourts"
                      disabled={busy}
                      onClick={() => getOrder(h)}
                    >
                      <Icon name="download" /> {pendingOrders.has(h.id) ? 'Getting order…' : 'Get order'}
                    </button>
                  </div>
                ) : !orderDue ? null : h.noOrderOnRecord ? (
                  <div className="hearing-entry__order-actions">
                    <span className="hearing-entry__order-note">No order for this date</span>
                  </div>
                ) : h.ordersNotDeclared ? (
                  // No manual "Attach Order PDF" button: orders come from eCourts. Only the note shows when they are not declared
                  <div className="hearing-entry__order-actions">
                    <span className="hearing-entry__order-note" title={h.ordersNotDeclaredReason || undefined}>
                      {h.ordersNotDeclaredReason || 'Orders are not declared'}
                    </span>
                  </div>
                ) : null}
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