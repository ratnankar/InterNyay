import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import useImageCrop from '../../hooks/useImageCrop'
import useOverlayClose from '../../hooks/useOverlayClose'
import JudgeCard from '../common/JudgeCard'
import Dropdown from '../common/Dropdown'
import Icon from '../common/Icon'
import useUnsavedGuard from '../../hooks/useUnsavedGuard'
import ModalPortal from '../common/ModalPortal'
import { confirmDialog } from '../../utils/confirmDialog'
import { getErrorMessage } from '../../utils/errorMessages'
import useSessionState from '../../hooks/useSessionState'
import SearchInput from '../common/SearchInput'
import PlaceGroupedGrid, { sortByPlace } from './PlaceGroupedGrid'

// Admin screen for the judges themselves: name and photo only.
// Where a judge sits (court, building, court no., contacts ...) is managed in the Listing section
export default function JudgeProfilesAdmin() {
  const { addToast } = useApp()

  const [judges,  setJudges]  = useState([])
  const [loading, setLoading] = useState(false)
  const [search,  setSearch]  = useState('')
  // all / free (not holding a court) / multi (more than one court)
  const [view,    setView]    = useSessionState('admin_judge_profiles_view', 'all')
  // Only the judges who hold a seat in this court ('' = all courts)
  const [courtFilter, setCourtFilter] = useState('')
  // Judge being added or edited (null when closed)
  const [editing, setEditing] = useState(null)
  const [error,   setError]   = useState('')
  const [saving,  setSaving]  = useState(false)

  const closeEditor = useCallback(() => setEditing(null), [])
  const overlayHandlers = useOverlayClose(closeEditor, { backdrop: false })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.judgeProfiles.list()
      setJudges(Array.isArray(res) ? res : [])
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not load judges'), 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return judges.filter(j => {
      if (view === 'free' && j.courtCount !== 0) return false
      if (view === 'multi' && j.courtCount < 2) return false
      if (courtFilter && !(j.courtNames || []).includes(courtFilter)) return false
      if (!q) return true
      return [j.name, ...j.courts].some(v => v.toLowerCase().includes(q))
    })
  }, [judges, search, view, courtFilter])

  // The courts that have a judge, for the court filter
  const courtOptions = useMemo(
    () => [...new Set(judges.flatMap(j => j.courtNames || []))].sort((a, b) => a.localeCompare(b)),
    [judges],
  )

  // One entry per court a judge holds (a judge in two courts shows under both), sorted court, building, court no.
  // A judge with no court goes last. With a court picked only the seats in that court are shown
  const entries = useMemo(() => {
    const list = []
    visible.forEach(j => {
      const seats = (j.seats || []).filter(s => !courtFilter || s.court === courtFilter)
      if (seats.length === 0) list.push({ judge: j, key: `${j.id}-none`, court: '', district: '', building: '', floor: '', courtRoomNo: '' })
      else seats.forEach(s => list.push({ judge: j, key: `${j.id}-${s.id}`, court: s.court || '', district: s.district || '', building: s.building || '', floor: s.floor || '', courtRoomNo: s.courtRoomNo || '' }))
    })
    const placed = sortByPlace(list.filter(e => e.court))
    const free = list.filter(e => !e.court).sort((a, b) => a.judge.name.localeCompare(b.judge.name))
    return [...placed, ...free]
  }, [visible, courtFilter])

  const rowsStep = 18

  const { pick: pickJudgePhoto, cropper } = useImageCrop({
    shape: 'portrait',
    title: 'Adjust judge photo',
    onError: msg => addToast(msg, 'error'),
  })

  function startEdit(row) {
    setError('')
    setEditing({
      id: row?.id ?? null,
      isNew: !row,
      name: row?.name || '',
      photo: row?.photo || '',
      photoChanged: false,
      origName: row?.name || '',
    })
  }

  // Closing with unsaved changes asks Save / Discard / Cancel
  const { requestClose, dialog } = useUnsavedGuard({
    dirty: !!editing && (editing.name !== editing.origName || editing.photoChanged),
    onSave: () => save(),
    onDiscard: closeEditor,
  })

  async function save() {
    if (!editing) return
    if (!editing.name.trim()) { setError('Name is required'); return }

    const body = new FormData()
    body.append('name', editing.name.trim())
    if (editing.photoChanged) body.append('photo', editing.photo)

    setSaving(true)
    try {
      if (editing.isNew) await api.judgeProfiles.create(body)
      else               await api.judgeProfiles.update(editing.id, body)
      addToast('Saved')
      setEditing(null)
      load()
    } catch (e) {
      addToast(getErrorMessage(e, 'Save failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function remove(judge) {
    const message = judge.courtCount > 0
      ? `"${judge.name}" still holds ${judge.courtCount === 1 ? 'a court' : `${judge.courtCount} courts`}. Change the judge of ${judge.courtCount === 1 ? 'that court' : 'those courts'} from the Listing section first.`
      : `Remove "${judge.name}" from the Judges list? Their court history is kept.`
    if (judge.courtCount > 0) { addToast(message, 'error'); return }
    if (!await confirmDialog(message)) return
    try {
      await api.judgeProfiles.remove(judge.id)
      addToast('Removed')
      load()
    } catch (e) {
      addToast(getErrorMessage(e, 'Remove failed'), 'error')
    }
  }

  return (
    <>
      {cropper}

      <div className="admin__toolbar">
        <SearchInput placeholder="Search judges…" value={search} onChange={setSearch} />
        <Dropdown className="form-input" wrapperClassName="u-maxw-200" value={courtFilter} onChange={e => setCourtFilter(e.target.value)}>
          <option value="">All courts</option>
          {courtOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </Dropdown>
        <Dropdown className="form-input" wrapperClassName="u-maxw-240" value={view} onChange={e => setView(e.target.value)}>
          <option value="all">All judges</option>
          <option value="free">Not holding a court</option>
          <option value="multi">Holding more than one court</option>
        </Dropdown>
        <button type="button" className="btn-gold" onClick={() => startEdit(null)}>+ Add judge</button>
        <span className="admin__count">{loading ? 'Loading…' : `${visible.length} judge${visible.length === 1 ? '' : 's'}`}</span>
      </div>

      {visible.length === 0 && !loading
        ? <p className="admin__empty">{view === 'all' ? 'No judges added yet' : 'No judge matches this view'}</p>
        : (
          <PlaceGroupedGrid
            byCourt={!courtFilter}
            storageKey="judges"
            emptyLabel="Not holding a court"
            step={rowsStep}
            resetKey={`${search}|${view}|${courtFilter}`}
            entries={entries.map(e => {
              const j = e.judge
              return {
                ...e,
                node: (
                  <JudgeCard
                    judge={{ name: j.name, photo: j.photo, courtRoomNo: e.courtRoomNo }}
                    tags={j.courtCount === 0
                      ? <span className="qa-tag qa-tag--released">Not holding a court</span>
                      : j.courtCount > 1 && <span className="qa-tag qa-tag--multi">Holds {j.courtCount} courts</span>}
                    note={j.courtCount > 1 && <>Sits in: {j.courts.join('; ')}</>}
                    actions={
                      <>
                        <button type="button" className="btn-outline btn-outline--sm" onClick={() => startEdit(j)}>Edit</button>
                        <button type="button" className="btn-outline btn-outline--sm btn-outline--danger" onClick={() => remove(j)}>Remove</button>
                      </>
                    }
                  />
                ),
              }
            })}
          />
        )}

      {editing && (
        <ModalPortal>
          <div className="overlay" {...overlayHandlers}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <h3 className="section-title">{editing.isNew ? 'Add judge' : 'Edit judge'}</h3>

              <div className="admin__form">
                <div className="form-group admin__form-group--full">
                  <label className="form-label">Name *</label>
                  <input
                    className={`form-input${error ? ' form-input--error' : ''}`}
                    value={editing.name}
                    onChange={e => { setEditing(s => ({ ...s, name: e.target.value })); setError('') }}
                  />
                  {error && <p className="admin__hint admin__hint--error">{error}</p>}
                </div>

                <div className="form-group admin__form-group--full">
                  <label className="form-label">Photo</label>
                  <div className="admin__photo">
                    {editing.photo
                      ? <img className="admin__photo-preview" src={editing.photo} alt="Judge" />
                      : <span className="admin__photo-preview admin__photo-preview--empty"><Icon name="scale" /></span>}
                    <div className="admin__photo-actions">
                      <input
                        className="form-input"
                        type="file"
                        accept="image/*"
                        onChange={e => {
                          pickJudgePhoto(e.target.files?.[0], dataUrl => setEditing(s => ({ ...s, photo: dataUrl, photoChanged: true })))
                          e.target.value = ''
                        }}
                      />
                      {editing.photo && (
                        <button type="button" className="btn-outline btn-outline--sm"
                          onClick={() => setEditing(s => ({ ...s, photo: '', photoChanged: true }))}>
                          Remove photo
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="admin__hint">
                    A judge is only a name and a photo. The court, court number, contacts and jurisdiction are set on the judge's listing in the Listing section.
                  </p>
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-outline" onClick={requestClose}>Cancel</button>
                <button type="button" className="btn-gold" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
      {dialog}
    </>
  )
}
