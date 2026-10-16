import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { CLIENT_DOCUMENT_TYPES } from '../../constants/data'
import useOverlayClose from '../../hooks/useOverlayClose'
import Dropdown from '../common/Dropdown'

import Icon from '../common/Icon'
import ModalPortal from '../../components/common/ModalPortal'
import UploadNameField from '../common/UploadNameField'
// Option that lets the user type their own document type
const MISC_TYPE = 'Other (Type Manually)'

// Popup to upload a document for a client
export default function UploadClientDocModal() {
  // Upload state and handler come from AppContext
  const {
    uploadDocClientId, setUploadDocClientId,
    clientDocName, setClientDocName,
    clientDocType, setClientDocType,
    clientDocTypeCustom, setClientDocTypeCustom,
    clientFileRef, handleUploadClientDoc,
  } = useApp()

  // Real name of the file that was chosen (the document name below can be changed)
  const [pickedFile, setPickedFile] = useState('')
  useEffect(() => { if (!uploadDocClientId) setPickedFile('') }, [uploadDocClientId])

  // Closes the modal when the backdrop is clicked
  const overlayHandlers = useOverlayClose(close)

  // Nothing to show unless an upload was opened for a client
  if (!uploadDocClientId) return null

  // Close and clear the form
  function close() {
    setUploadDocClientId(null)
    setClientDocName('')
    setClientDocType('')
    setClientDocTypeCustom('')
  }

  // Needs a name and type, and a typed type when "Other" is chosen
  const canUpload =
    !!pickedFile &&
    !!clientDocName.trim() &&
    !!clientDocType &&
    (clientDocType !== MISC_TYPE || !!clientDocTypeCustom.trim())

  return (
    <ModalPortal>
      <div className="overlay overlay--stacked" {...overlayHandlers}>
        <div className="modal modal--sm" onClick={e => e.stopPropagation()}>

          <div className="modal__header">
            <h2 className="modal__title">Upload Client Document</h2>
            <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={close}><Icon name="close" /></button>
          </div>

          <p className="fee-hearing-empty u-mb-12">
            General-purpose document for this client — not linked to a specific case.
          </p>

          <div>
            <label className="form-label">Document Type *</label>
            <Dropdown
              className="form-input"
              value={clientDocType}
              onChange={e => setClientDocType(e.target.value)}
            >
              <option value="">Select document type</option>
              {CLIENT_DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Dropdown>
          </div>

          {clientDocType === MISC_TYPE && (
            <div className="u-mt-12">
              <label className="form-label">Specify Type *</label>
              <input
                className="form-input"
                placeholder="Type the document name…"
                value={clientDocTypeCustom}
                onChange={e => setClientDocTypeCustom(e.target.value)}
              />
            </div>
          )}

          <div
            className="upload-dropzone u-mt-16"
            onClick={() => clientFileRef.current?.click()}
          >
            <div className="upload-dropzone__icon"><Icon name="folder" /></div>
            <p className="upload-dropzone__label">Click to select file</p>
            <p className="upload-dropzone__hint">PDF, DOCX, JPG, PNG (max 50MB)</p>
            <input
              ref={clientFileRef}
              type="file"
              className="u-hidden"
              onChange={e => {
                const file = e.target.files[0]
                if (!file) return
                setPickedFile(file.name)
                setClientDocName(file.name)
              }}
            />
          </div>

          <UploadNameField fileName={pickedFile} name={clientDocName} onChange={setClientDocName} />

          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={close}>Cancel</button>
            <button type="button" className="btn-gold" onClick={handleUploadClientDoc} disabled={!canUpload}>Upload</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
