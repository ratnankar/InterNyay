import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { DOCUMENT_TYPES } from '../../constants/data'
import useOverlayClose from '../../hooks/useOverlayClose'
import Dropdown from '../common/Dropdown'

import Icon from '../common/Icon'
import ModalPortal from '../../components/common/ModalPortal'
import UploadNameField from '../common/UploadNameField'
// Popup to upload a document to a case
export default function UploadDocModal() {
  // Upload state and handler come from AppContext
  const {
    uploadDocCaseId, setUploadDocCaseId,
    docName, setDocName,
    docType, setDocType,
    fileRef, handleUploadDoc,
  } = useApp()

  // Real name of the file that was chosen (the document name below can be changed)
  const [pickedFile, setPickedFile] = useState('')
  useEffect(() => { if (!uploadDocCaseId) setPickedFile('') }, [uploadDocCaseId])

  // Closes the modal when the backdrop is clicked
  const overlayHandlers = useOverlayClose(close)

  // Nothing to show unless an upload was opened for a case
  if (!uploadDocCaseId) return null

  // Close and clear the form
  function close() {
    setUploadDocCaseId(null)
    setDocName('')
    setDocType('')
  }

  // Needs a file, a name and a type
  const canUpload =
    !!pickedFile &&
    !!docName.trim() &&
    !!docType

  return (
    <ModalPortal>
      <div className="overlay" {...overlayHandlers}>
        <div className="modal modal--sm" onClick={e => e.stopPropagation()}>

          <div className="modal__header">
            <h2 className="modal__title">Upload Document</h2>
            <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={close}><Icon name="close" /></button>
          </div>

          <div>
            <label className="form-label">Document Type *</label>
            <Dropdown
              className="form-input"
              value={docType}
              onChange={e => setDocType(e.target.value)}
            >
              <option value="">Select document type</option>
              {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Dropdown>
          </div>

          <div
            className="upload-dropzone u-mt-16"
            onClick={() => fileRef.current?.click()}
          >
            <div className="upload-dropzone__icon"><Icon name="folder" /></div>
            <p className="upload-dropzone__label">Click to select file</p>
            <p className="upload-dropzone__hint">PDF, DOCX, JPG, PNG (max 50MB)</p>
            <input
              ref={fileRef}
              type="file"
              className="u-hidden"
              onChange={e => {
                const file = e.target.files[0]
                if (!file) return
                setPickedFile(file.name)
                setDocName(file.name)
              }}
            />
          </div>

          <UploadNameField fileName={pickedFile} />

          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={close}>Cancel</button>
            <button type="button" className="btn-gold" onClick={handleUploadDoc} disabled={!canUpload}>Upload</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
