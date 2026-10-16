import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { EVIDENCE_CATEGORIES, EVIDENCE_ACCEPT } from '../../constants/data'
import useOverlayClose from '../../hooks/useOverlayClose'
import Dropdown from '../common/Dropdown'

import Icon from '../common/Icon'
import ModalPortal from '../../components/common/ModalPortal'
import UploadNameField from '../common/UploadNameField'
// Categories that must be linked to a specific client or case
const NEEDS_TARGET = ['Client', 'Case']

// Popup to upload evidence against a case or a client
export default function UploadEvidenceModal() {
  // Upload state and handler come from AppContext
  const {
    cases = [], clients = [],
    showUploadEvidence, setShowUploadEvidence,
    evidenceCategory, setEvidenceCategory,
    evidenceTargetId, setEvidenceTargetId,
    evidenceName, setEvidenceName,
    evidenceFileRef, handleUploadEvidence,
  } = useApp()

  // Closes the modal when the backdrop is clicked
  const overlayHandlers = useOverlayClose(close)

  // Text typed when searching for the client or case to attach the evidence to
  const [targetSearch, setTargetSearch] = useState('')

  // Real name of the file that was chosen (the evidence name below can be changed)
  const [pickedFile, setPickedFile] = useState('')
  useEffect(() => { if (!showUploadEvidence) setPickedFile('') }, [showUploadEvidence])

  // Up to 8 clients or cases matching the search; cases match on title, number or client name
  const targetMatches = useMemo(() => {
    const q = targetSearch.trim().toLowerCase()
    if (!q) return []

    if (evidenceCategory === 'Client') {
      return clients
        .filter(cl => (cl.name || '').toLowerCase().includes(q))
        .slice(0, 8)
    }

    if (evidenceCategory === 'Case') {
      return cases
        .filter(c => {
          const client = clients.find(cl => Number(cl.id) === Number(c.clientId))
          return (
            (c.title || '').toLowerCase().includes(q) ||
            (c.caseNo || '').toLowerCase().includes(q) ||
            (c.clientName || client?.name || '').toLowerCase().includes(q)
          )
        })
        .slice(0, 8)
    }

    return []
  }, [targetSearch, evidenceCategory, clients, cases])

  // True when the chosen category needs a client or case
  const needsTarget = NEEDS_TARGET.includes(evidenceCategory)

  // Display name of the client or case already chosen
  const targetLabel = useMemo(() => {
    if (!needsTarget || !evidenceTargetId) return ''
    const list = evidenceCategory === 'Client' ? clients : cases
    const match = list.find(o => Number(o.id) === Number(evidenceTargetId))
    if (!match) return ''
    return evidenceCategory === 'Client' ? match.name : (match.title || match.caseNo || `Case #${match.id}`)
  }, [needsTarget, evidenceTargetId, evidenceCategory, clients, cases])

  // Nothing to show unless the upload was opened
  if (!showUploadEvidence) return null

  // Close and clear the form
  function close() {
    setShowUploadEvidence(false)
    setEvidenceCategory('')
    setEvidenceTargetId(null)
    setEvidenceName('')
    setTargetSearch('')
  }

  // Link the evidence to the chosen client or case
  function pickTarget(id) {
    setEvidenceTargetId(id)
    setTargetSearch('')
  }

  // Remove the chosen client or case so another can be searched
  function clearTarget() {
    setEvidenceTargetId(null)
    setTargetSearch('')
  }

  // Needs a name, a category, and a target when the category requires one
  const canUpload =
    !!pickedFile &&
    !!evidenceName.trim() &&
    !!evidenceCategory &&
    (!needsTarget || !!evidenceTargetId)

  return (
    <ModalPortal>
      <div className="overlay" {...overlayHandlers}>
        <div className="modal modal--sm" onClick={e => e.stopPropagation()}>

          <div className="modal__header">
            <h2 className="modal__title">Upload Evidence</h2>
            <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={close}><Icon name="close" /></button>
          </div>

          <p className="fee-hearing-empty u-mb-12">
            Upload any file as evidence. Evidence is filed under a case or client, never under an advocate.
          </p>

          {evidenceCategory ? (
            <>
              <div className="upload-filename u-mt-0">
                <Icon name="target" /> Filing under: <strong>{evidenceCategory}</strong>
                {targetLabel ? (
                  <>
                    {' — '}{targetLabel}
                    {needsTarget && (
                      <button type="button"
                        className="btn-outline btn-outline--sm u-ml-8"
                        onClick={clearTarget}
                      >
                        Change
                      </button>
                    )}
                  </>
                ) : ''}
              </div>

              {needsTarget && !evidenceTargetId && (
                <div className="u-mt-12">
                  <label className="form-label">
                    {evidenceCategory === 'Client' ? 'Client *' : 'Case *'}
                  </label>

                  <div className="doc-search-wrap">
                    <span className="doc-search-icon"><Icon name="search" /></span>
                    <input
                      className="form-input doc-search-input"
                      autoFocus
                      placeholder={
                        evidenceCategory === 'Client'
                          ? 'Type to search a client…'
                          : 'Type to search a case, case number, or client…'
                      }
                      value={targetSearch}
                      onChange={e => setTargetSearch(e.target.value)}
                    />
                    {targetSearch && (
                      <button type="button" className="doc-search-clear" onClick={() => setTargetSearch('')}><Icon name="close" /></button>
                    )}
                  </div>

                  {targetSearch.trim() && (
                    targetMatches.length === 0 ? (
                      <p className="upload-search__empty">
                        No {evidenceCategory === 'Client' ? 'client' : 'case'} matches "{targetSearch}".
                      </p>
                    ) : (
                      <div className="upload-search__results">
                        {targetMatches.map(o => (
                          <button type="button"
                            key={o.id}
                            className="upload-search__row"
                            onClick={() => pickTarget(o.id)}
                          >
                            <span className="upload-search__icon">
                              {evidenceCategory === 'Client' ? <Icon name="user" /> : <Icon name="folder" />}
                            </span>
                            <span className="upload-search__body">
                              <span className="upload-search__name">
                                {evidenceCategory === 'Client' ? o.name : (o.title || o.caseNo || `Case #${o.id}`)}
                              </span>
                              <span className="upload-search__meta">
                                {evidenceCategory === 'Client'
                                  ? 'Client'
                                  : `${o.caseNo ? `${o.caseNo} • ` : ''}${o.clientName || (clients.find(cl => Number(cl.id) === Number(o.clientId))?.name) || 'Case'}`}
                              </span>
                            </span>
                            <span className="upload-search__action">Select</span>
                          </button>
                        ))}
                      </div>
                    )
                  )}
                </div>
              )}
            </>
          ) : (
            <div>
              <label className="form-label">Category *</label>
              <Dropdown
                className="form-input"
                value={evidenceCategory}
                onChange={e => {
                  setEvidenceCategory(e.target.value)
                  setEvidenceTargetId(null)
                }}
              >
                <option value="">Select category</option>
                {EVIDENCE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </Dropdown>
            </div>
          )}

          <div
            className="upload-dropzone u-mt-16"
            onClick={() => evidenceFileRef.current?.click()}
          >
            <div className="upload-dropzone__icon"><Icon name="film" /></div>
            <p className="upload-dropzone__label">Click to select file</p>
            <p className="upload-dropzone__hint">Any file type (max 50MB)</p>
            <input
              ref={evidenceFileRef}
              type="file"
              accept={EVIDENCE_ACCEPT}
              className="u-hidden"
              onChange={e => {
                const file = e.target.files[0]
                if (!file) return
                setPickedFile(file.name)
                setEvidenceName(file.name)
              }}
            />
          </div>

          <UploadNameField fileName={pickedFile} name={evidenceName} onChange={setEvidenceName} label="Evidence name" />

          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={close}>Cancel</button>
            <button type="button" className="btn-gold" onClick={handleUploadEvidence} disabled={!canUpload}>Upload</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
