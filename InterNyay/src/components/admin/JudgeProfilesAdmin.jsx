import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import useImageCrop from '../../hooks/useImageCrop'
import useOverlayClose from '../../hooks/useOverlayClose'
import useSeeMore from '../../hooks/useSeeMore'
import SeeMore from '../common/SeeMore'
import JudgeCard from '../common/JudgeCard'
import Dropdown from '../common/Dropdown'
import Icon from '../common/Icon'
import useUnsavedGuard from '../../hooks/useUnsavedGuard'
import ModalPortal from '../common/ModalPortal'
import { confirmDialog } from '../../utils/confirmDialog'
import { getErrorMessage } from '../../utils/errorMessages'
import useSessionState from '../../hooks/useSessionState'
import SearchInput from '../common/SearchInput'

// Admin screen for the judges themselves: name and photo only.
// Where a judge sits (court, building, court no., contacts ...) is managed in the Listing section
export default function JudgeProfilesAdmin() {
  const { addToast } = useApp()

  const [judges,  setJudges]  = useState([])
  const [loading, setLoading] = useState(false)
  const [search,  setSearch]  = useState('')
  // all / free (not holding a court) / multi (more than one court)
  const [view,    setView]    = useSessionState('admin_judge_profiles_view', 'all')
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
      if (!q) return true
      return [j.name, ...j.courts].some(v => v.toLowerCase().includes(q))
    })
  }, [judges, search, view])

  const rowsStep = 18
  const { visible: visibleRows, remaining, showMore } = useSeeMore(visible, `${search}|${view}`, rowsStep)

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
          <div className="judge-grid admin-judge-grid">
            {visibleRows.map(j => (
              <JudgeCard
                key={j.id}
                judge={{ name: j.name, photo: j.photo }}
                tags={j.courtCount === 0
                  ? <span className="qa-tag qa-tag--released">Not holding a court</span>
                  : j.courtCount > 1 && <span className="qa-tag qa-tag--multi">Holds {j.courtCount} courts</span>}
                note={j.courtCount > 0 && <>Sits in: {j.courts.join('; ')}</>}
                actions={
                  <>
                    <button type="button" className="btn-outline btn-outline--sm" onClick={() => startEdit(j)}>Edit</button>
                    <button type="button" className="btn-outline btn-outline--sm btn-outline--danger" onClick={() => remove(j)}>Remove</button>
                  </>
                }
              />
            ))}
            <SeeMore remaining={remaining} onClick={showMore} step={rowsStep} />
          </div>
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
