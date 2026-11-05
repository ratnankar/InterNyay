import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import { loadCourts } from '../../constants/courts'
import useOverlayClose from '../../hooks/useOverlayClose'
import Icon from '../common/Icon'
import ModalPortal from '../common/ModalPortal'
import { getErrorMessage } from '../../utils/errorMessages'

const LEVEL_TEXT = {
  court:    { title: 'Rename court',    label: 'Court name',    max: 100 },
  district: { title: 'Rename district', label: 'District name', max: 100 },
  building: { title: 'Rename building', label: 'Building',      max: 50 },
  floor:    { title: 'Rename floor',    label: 'Floor',         max: 50 },
}

// Renames a court, district, building or floor of the court table. Everything that uses the name changes with it:
// cases, judges and their court history, the rosters, judges on leave, district PDFs and the police directory.
// target = { level, court, district, building, floor }: which one (the place it sits in and its current name)
export default function CourtRenameModal({ target, onClose, onRenamed }) {
  const { addToast } = useApp()
  const text = LEVEL_TEXT[target.level]
  const current = target[target.level] || ''
  const [name, setName] = useState(current)
  const [saving, setSaving] = useState(false)
  const overlayHandlers = useOverlayClose(onClose)

  const trimmed = name.trim()
  const canSave = !!trimmed && trimmed !== current && !saving

  async function save() {
    if (!canSave) return
    setSaving(true)
    try {
      await api.courts.rename({
        level: target.level,
        court: target.court,
        district: target.district || '',
        building: target.building || '',
        floor: target.floor || '',
        newName: trimmed,
      })
      await loadCourts(true)
      onRenamed?.(trimmed)
      addToast(`Renamed to ${trimmed}`)
      onClose()
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not rename'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalPortal>
      <div className="overlay overlay--stacked" {...overlayHandlers}>
        <div className="modal modal--sm" onClick={e => e.stopPropagation()}>
          <div className="modal__header">
            <h2 className="modal__title">{text.title}</h2>
            <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={onClose} disabled={saving}><Icon name="close" /></button>
          </div>

          <div className="form-group">
            <label className="form-label">{text.label} *</label>
            <input
              className="form-input"
              autoFocus
              value={name}
              maxLength={text.max}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save() } }}
              onFocus={e => e.target.select()}
            />
          </div>

          <p className="admin__hint">
            The new name replaces the old one everywhere it is used: cases, judges and their court history, the rosters,
            judges on leave, district PDFs and the police directory.
          </p>
          {(target.level === 'court' || target.level === 'district') && (
            <p className="admin__hint">
              The court websites that are read automatically (cause lists, judges on leave) are matched by the original court and
              district names, so renaming one of those can stop its automatic updates.
            </p>
          )}

          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="button" className="btn-gold" onClick={save} disabled={!canSave}>{saving ? 'Saving…' : 'Rename'}</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
