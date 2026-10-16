import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import { useCourts, getCourtNames, courtDistrictLabel } from '../../constants/courts'
import { formatDisplayDate } from '../../utils/dateUtils'
import useOverlayClose from '../../hooks/useOverlayClose'
import CourtFields, { firstDistrict } from './CourtFields'
import Dropdown from '../common/Dropdown'
import ArchiveTree from '../common/ArchiveTree'
import SeeMoreList from '../common/SeeMoreList'
import { getErrorMessage } from '../../utils/errorMessages'
import { confirmDialog } from '../../utils/confirmDialog'
import ModalPortal from '../../components/common/ModalPortal'
import useSessionState from '../../hooks/useSessionState'

const leaveStartDate = r => r.leaveFrom

// Display label for each leave status
const STATUS_LABEL = { CURRENT: 'On leave now', UPCOMING: 'Upcoming', PAST: 'Ended' }

// Blank form for a manually added leave
const emptyForm = () => ({
  court: getCourtNames()[0] || '',
  district: firstDistrict(getCourtNames()[0]),
  name: '',
  leaveFrom: '',
  leaveTo: '',
  reason: '',
})

// Turns null or undefined into an empty string
const orEmpty = v => (v == null ? '' : String(v))
// Formats a date for display, or a dash when missing
const fmt = d => (d ? formatDisplayDate(String(d).slice(0, 10)) : '—')

// Admin screen for judges on leave: leave collected from court websites plus entries added by hand
export default function JudgeLeaveAdmin() {
  const { courtNames } = useCourts()
  const { addToast } = useApp()

  // Leave entries, loading flag, court filter and search text
  const [rows,      setRows]      = useState([])
  const [loading,   setLoading]   = useState(false)
  // 'current' shows leave now and upcoming, 'archive' shows ended leave by year and month
  const [view,      setView]      = useSessionState('admin_judge_leave_view', 'current')
  const [court,     setCourt]     = useState('')
  const [search,    setSearch]    = useState('')
  // Entry being edited (null when closed), its validation errors and the saving flag
  const [editing,   setEditing]   = useState(null)
  const [errors,    setErrors]    = useState({})
  const [saving,    setSaving]    = useState(false)
  // Whether a refresh from the court websites is running, and its last results
  const [refreshing, setRefreshing] = useState(false)
  const [refreshed,  setRefreshed]  = useState(null)

  // Closes the editor, also when the backdrop is clicked
  const closeEditor = useCallback(() => setEditing(null), [])
  const overlay = useOverlayClose(closeEditor, { backdrop: false })

  // Fetches every leave entry for the selected court; the view splits them into current and ended
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.admin.judgesOnLeave.list({ status: 'ALL', court })
      setRows(Array.isArray(res) ? res : [])
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not load judges on leave'), 'error')
    } finally {
      setLoading(false)
    }
  }, [court, addToast])

  useEffect(() => { load() }, [load])

  // Rows matching the search in judge, reason, court or district
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r =>
      [r.name, r.reason, r.court, r.district]
        .some(v => orEmpty(v).toLowerCase().includes(q)))
  }, [rows, search])

  // Leave happening now first, then upcoming leave soonest first
  const current = useMemo(() => visible
    .filter(r => r.status === 'CURRENT' || r.status === 'UPCOMING')
    .sort((a, b) => (a.status === b.status
      ? String(a.leaveFrom).localeCompare(String(b.leaveFrom))
      : a.status === 'CURRENT' ? -1 : 1)), [visible])

  // Ended leave, grouped by year and month in the Archive
  const archived = useMemo(() => visible.filter(r => r.status === 'PAST'), [visible])

  // Entries in the open view
  const shown = view === 'current' ? current : archived

  // Opens the editor for a new leave or a manually added one
  function startEdit(row) {
    setErrors({})

    if (!row) {
      setEditing({ id: null, form: emptyForm() })
      return
    }

    setEditing({
      id: row.id,
      form: {
        court: row.court,
        district: row.district,
        name: orEmpty(row.name),
        leaveFrom: orEmpty(row.leaveFrom).slice(0, 10),
        leaveTo: orEmpty(row.leaveTo).slice(0, 10),
        reason: orEmpty(row.reason),
      },
    })
  }

  // Updates one form field and clears its error
  const setField = (key, value) => {
    setEditing(s => ({ ...s, form: { ...s.form, [key]: value } }))
    setErrors(e => ({ ...e, [key]: undefined }))
  }

  // Validates the name and dates, then creates or updates the leave
  async function save() {
    const f = editing.form
    const errs = {}

    if (!f.name.trim())  errs.name = 'Judge name is required'
    if (!f.leaveFrom)    errs.leaveFrom = 'Start date is required'
    if (!f.leaveTo)      errs.leaveTo = 'End date is required'
    if (f.leaveFrom && f.leaveTo && f.leaveTo < f.leaveFrom) errs.leaveTo = 'End date cannot be before the start date'

    if (Object.keys(errs).length) { setErrors(errs); return }

    const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]))

    setSaving(true)
    try {
      if (editing.id) await api.admin.judgesOnLeave.update(editing.id, body)
      else            await api.admin.judgesOnLeave.create(body)

      addToast(editing.id ? 'Saved' : 'Leave added')
      setEditing(null)
      load()
    } catch (e) {
      addToast(getErrorMessage(e, 'Save failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  // Deletes a leave entry after confirmation
  async function remove(row) {
    if (!await confirmDialog(`Delete the leave entry for ${row.name}?`)) return
    try {
      await api.admin.judgesOnLeave.remove(row.id)
      addToast('Deleted')
      load()
    } catch (e) {
      addToast(getErrorMessage(e, 'Delete failed'), 'error')
    }
  }

  // Hides a leave entry from users or makes it visible again
  async function toggleHidden(row) {
    try {
      const updated = await api.admin.judgesOnLeave.setHidden(row.id, !row.hidden)
      setRows(rs => rs.map(r => (r.id === row.id ? updated : r)))
      addToast(updated.hidden ? 'Hidden from users' : 'Visible to users again')
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not update'), 'error')
    }
  }

  // Reads every district's Judges on Leave page right away and reloads the list
  async function refreshNow() {
    setRefreshing(true)
    try {
      const results = await api.admin.judgesOnLeave.refresh()
      setRefreshed(Array.isArray(results) ? results : [])
      addToast('Court websites checked')
      load()
    } catch (e) {
      addToast(getErrorMessage(e, 'Refresh failed'), 'error')
    } finally {
      setRefreshing(false)
    }
  }

  // Districts that had an error or skipped rows during the last refresh
  const refreshedIssues = (refreshed || []).filter(r => r.error || r.skipped > 0)

  // Table of leave entries, with Edit/Delete for manual ones and Hide/Show for collected ones
  const renderTable = items => (
    <SeeMoreList items={items} step={25} resetKey={`${search}|${court}`}>
    {shown => (
    <div className="admin__table-wrap">
      <table className="admin__table">
        <thead>
          <tr>
            <th>Judge</th><th>Court · District</th><th>Leave</th><th>Reason</th>
            <th>Status</th><th>Source</th><th />
          </tr>
        </thead>
        <tbody>
          {shown.map(r => {
            const manual = r.source === 'MANUAL'
            return (
              <tr key={r.id} className={r.hidden ? 'admin__row--muted' : undefined}>
                <td>{r.name}</td>
                <td>{courtDistrictLabel(r.court, r.district)}</td>
                <td>{fmt(r.leaveFrom)} – {fmt(r.leaveTo)}</td>
                <td>{r.reason || '—'}</td>
                <td>
                  <span className={`admin__pill${r.status === 'CURRENT' ? ' admin__pill--gold' : ''}`}>
                    {STATUS_LABEL[r.status] || r.status}
                  </span>
                </td>
                <td>
                  <span className="admin__pill">{manual ? 'Manual' : 'Auto'}</span>
                  {r.hidden && <span className="admin__pill admin__pill--inline">Hidden</span>}
                </td>
                <td className="admin__actions">
                  {manual ? (
                    <>
                      <button type="button" className="btn-outline btn-outline--sm" onClick={() => startEdit(r)}>Edit</button>
                      <button type="button" className="btn-outline btn-outline--sm btn-outline--danger" onClick={() => remove(r)}>Delete</button>
                    </>
                  ) : (
                    <button type="button" className="btn-outline btn-outline--sm" onClick={() => toggleHidden(r)}>
                      {r.hidden ? 'Show' : 'Hide'}
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
    )}
    </SeeMoreList>
  )

  return (
    <>
      <p className="admin__hint u-mb-12">
        Leave is collected automatically from each district's “Judges on Leave” page every day at
        6:00 AM and whenever the server starts. Add leave by hand for anything the websites miss;
        rows collected automatically can be hidden.
      </p>

      {/* Court filter, search, add and refresh buttons, and entry count */}
      <div className="admin__toolbar">
        <input className="form-input" placeholder="Search judge, reason…"
               value={search} onChange={e => setSearch(e.target.value)} />

        <Dropdown className="form-input" wrapperClassName="u-maxw-180" value={court}
                onChange={e => setCourt(e.target.value)} aria-label="Filter by court">
          <option value="">All courts</option>
          {courtNames.map(c => <option key={c} value={c}>{c}</option>)}
        </Dropdown>

        <button type="button" className="btn-gold" onClick={() => startEdit(null)}>+ Add leave</button>
        <button type="button" className="btn-outline" onClick={refreshNow} disabled={refreshing}
                title="Read every district's Judges on Leave page right now">
          {refreshing ? 'Checking websites…' : 'Refresh from court websites'}
        </button>

        <span className="admin__count">
          {loading ? 'Loading…' : `${shown.length} entr${shown.length === 1 ? 'y' : 'ies'}`}
        </span>
      </div>

      {/* Summary of the last refresh from the court websites */}
      {refreshed && (
        <p className="admin__hint u-mb-12">
          Checked {refreshed.length} district page{refreshed.length === 1 ? '' : 's'} —{' '}
          {refreshed.reduce((n, r) => n + (r.saved || 0), 0)} leave entries read
          {refreshedIssues.length > 0 && (
            <>
              . Needs attention:{' '}
              {refreshedIssues.map(r =>
                `${r.court} / ${r.district} (${r.error ? 'could not be read' : `${r.skipped} row${r.skipped === 1 ? '' : 's'} skipped`})`
              ).join('; ')}
            </>
          )}
          .
        </p>
      )}

      {/* Switch between current and upcoming leave and the archive of ended leave */}
      <div className="qa-filter-row u-mb-12" role="tablist" aria-label="Leave view" >
        <button
          type="button"
          role="tab"
          aria-selected={view === 'current'}
          className={`qa-filter-btn${view === 'current' ? ' active' : ''}`}
          onClick={() => setView('current')}
        >
          Current &amp; Upcoming ({current.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'archive'}
          className={`qa-filter-btn${view === 'archive' ? ' active' : ''}`}
          onClick={() => setView('archive')}
        >
          Archive ({archived.length})
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="admin__table-wrap">
          <p className="admin__empty">
            {loading ? 'Loading…' : view === 'current' ? 'No current or upcoming leave' : 'No ended leave in the archive'}
          </p>
        </div>
      ) : view === 'current' ? (
        renderTable(current)
      ) : (
        <ArchiveTree
          items={archived}
          getDate={leaveStartDate}
          forceOpen={!!search.trim()}
          renderItems={renderTable}
        />
      )}

      {/* Add / edit dialog */}
      {editing && (
        <ModalPortal>
          <div className="overlay" {...overlay}>
            <div className="modal modal--md" onClick={e => e.stopPropagation()}>
              <h3 className="section-title">
                {editing.id ? 'Edit leave' : 'Add leave'}
              </h3>

              <div className="admin__form">
                <CourtFields
                  court={editing.form.court}
                  district={editing.form.district}
                  onChange={fields => setEditing(s => ({ ...s, form: { ...s.form, ...fields } }))}
                />

                <div className="form-group admin__form-group--full">
                  <label className="form-label">Judge name *</label>
                  <input className={`form-input${errors.name ? ' form-input--error' : ''}`}
                         value={editing.form.name} onChange={e => setField('name', e.target.value)} />
                  {errors.name && <p className="admin__hint admin__hint--error">{errors.name}</p>}
                </div>

                <div className="form-group">
                  <label className="form-label">On leave from *</label>
                  <input type="date" className={`form-input${errors.leaveFrom ? ' form-input--error' : ''}`}
                         value={editing.form.leaveFrom} onChange={e => setField('leaveFrom', e.target.value)} />
                  {errors.leaveFrom && <p className="admin__hint admin__hint--error">{errors.leaveFrom}</p>}
                </div>

                <div className="form-group">
                  <label className="form-label">On leave till *</label>
                  <input type="date" className={`form-input${errors.leaveTo ? ' form-input--error' : ''}`}
                         value={editing.form.leaveTo} onChange={e => setField('leaveTo', e.target.value)} />
                  {errors.leaveTo && <p className="admin__hint admin__hint--error">{errors.leaveTo}</p>}
                </div>

                <div className="form-group admin__form-group--full">
                  <label className="form-label">Nature of leave</label>
                  <input className="form-input" placeholder="e.g. Casual Leave"
                         value={editing.form.reason} onChange={e => setField('reason', e.target.value)} />
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-outline" onClick={closeEditor}>Cancel</button>
                <button type="button" className="btn-gold" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  )
}
