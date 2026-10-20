import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import useOverlayClose from '../../hooks/useOverlayClose'

import Icon from '../common/Icon'
import ModalPortal from '../../components/common/ModalPortal'
import UploadNameField from '../common/UploadNameField'
// Popup to upload one of the advocate's own documents
export default function UploadAdvocateDocModal() {
  // Upload state and handler come from AppContext
  const {
    uploadDocAdvocate, setUploadDocAdvocate,
    advocateDocName, setAdvocateDocName,
    advocateFileRef, handleUploadAdvocateDoc,
  } = useApp()

  // Real name of the file that was chosen (the document name below can be changed)
  const [pickedFile, setPickedFile] = useState('')
  useEffect(() => { if (!uploadDocAdvocate) setPickedFile('') }, [uploadDocAdvocate])

  // Closes the modal when the backdrop is clicked
  const overlayHandlers = useOverlayClose(close)

  // Nothing to show unless the upload was opened
  if (!uploadDocAdvocate) return null

  // Close and clear the document name
  function close() {
    setUploadDocAdvocate(false)
    setAdvocateDocName('')
  }

  // Upload needs a document name
  const canUpload = !!pickedFile && !!advocateDocName.trim()

  return (
    <ModalPortal>
      <div className="overlay" {...overlayHandlers}>
        <div className="modal modal--sm" onClick={e => e.stopPropagation()}>

          <div className="modal__header">
            <h2 className="modal__title">Upload Advocate Document</h2>
            <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={close}><Icon name="close" /></button>
          </div>

          <p className="fee-hearing-empty u-mb-12">
            Your own document — not linked to any case or client.
          </p>

          <div
            className="upload-dropzone u-mt-16"
            onClick={() => advocateFileRef.current?.click()}
          >
            <div className="upload-dropzone__icon"><Icon name="folder" /></div>
            <p className="upload-dropzone__label">Click to select file</p>
            <p className="upload-dropzone__hint">Any document file (max 50MB)</p>
            <input
              ref={advocateFileRef}
              type="file"
              className="u-hidden"
              onChange={e => {
                const file = e.target.files[0]
                if (!file) return
                setPickedFile(file.name)
                setAdvocateDocName(file.name)
              }}
            />
          </div>

          <UploadNameField fileName={pickedFile} />

          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={close}>Cancel</button>
            <button type="button" className="btn-gold" onClick={handleUploadAdvocateDoc} disabled={!canUpload}>Upload</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
