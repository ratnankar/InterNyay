import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import useOverlayClose from '../../hooks/useOverlayClose'
import Icon from '../common/Icon'
import ModalPortal from '../common/ModalPortal'
import { documentTypeLabel } from '../../utils/documentUtils'

// Details popup of a document of any kind (case, client, advocate or evidence). Opened from the "i" beside its name it shows
// the original file name, type, size, date and the name; opened from the pencil it is ready for typing a new name.
// Only the name shown changes; the file and its type stay as they are
export default function RenameDocModal() {
  const { renameDocTarget, setRenameDocTarget, handleRenameDocument } = useApp()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // Starts from the current name each time a document is picked
  useEffect(() => {
    setName(renameDocTarget?.name || '')
    setEditing(!!renameDocTarget?._edit)
    setSaving(false)
  }, [renameDocTarget])

  const overlayHandlers = useOverlayClose(close)

  if (!renameDocTarget) return null

  function close() {
    setRenameDocTarget(null)
  }

  const unchanged = name.trim() === String(renameDocTarget.name || '').trim()
  const canSave = !!name.trim() && !unchanged && !saving

  async function save() {
    if (!canSave) return
    setSaving(true)
    const ok = await handleRenameDocument(renameDocTarget, name)
    setSaving(false)
    if (ok) close()
  }

  const details = [
    documentTypeLabel(renameDocTarget),
    renameDocTarget.size,
    renameDocTarget.date && `Uploaded ${String(renameDocTarget.date).slice(0, 10)}`,
  ].filter(Boolean).join(' • ')

  return (
    <ModalPortal>
      <div className="overlay overlay--stacked" {...overlayHandlers}>
        <div className="modal modal--sm" onClick={e => e.stopPropagation()}>

          <div className="modal__header">
            <h2 className="modal__title">{editing ? 'Rename document' : 'Document details'}</h2>
            <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={close}><Icon name="close" /></button>
          </div>

          {renameDocTarget.fileName && (
            <div className="upload-filename u-mt-0"><Icon name="file" /> Original file: <strong>{renameDocTarget.fileName}</strong></div>
          )}
          {details && <p className="doc-row__meta u-mt-8">{details}</p>}

          <div className="form-group u-mt-12">
            <label className="form-label">Name shown in your list{editing ? ' *' : ''}</label>
            {editing ? (
              <input
                className="form-input"
                autoFocus
                value={name}
                maxLength={255}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save() } }}
                onFocus={e => e.target.select()}
              />
            ) : (
              <p className="doc-row__name">{renameDocTarget.name || renameDocTarget.fileName}</p>
            )}
          </div>

          <div className="form-actions">
            {editing ? (
              <>
                <button type="button" className="btn-outline" onClick={close}>Cancel</button>
                <button type="button" className="btn-gold" onClick={save} disabled={!canSave}>{saving ? 'Saving…' : 'Save name'}</button>
              </>
            ) : (
              <>
                <button type="button" className="btn-outline" onClick={close}>Close</button>
                <button type="button" className="btn-gold" onClick={() => setEditing(true)}><Icon name="edit" /> Rename</button>
              </>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
