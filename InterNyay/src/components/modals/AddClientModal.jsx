import { useEffect, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import useUnsavedGuard from '../../hooks/useUnsavedGuard'
import useImageCrop from '../../hooks/useImageCrop'
import Dropdown from '../common/Dropdown'
import { starLabel } from '../common/Req'

import Icon from '../common/Icon'
// Client form inputs as [label, field name, input type, placeholder]
const FIELDS = [
  ['Full Name *', 'name', 'text', "Client's full legal name"],
  ['Email', 'email', 'email', 'client@email.com'],
  ['WhatsApp Phone', 'whatsappPhone', 'tel', '+91 XXXXX XXXXX'],
  ['Additional Phone', 'additionalPhone', 'tel', '+91 XXXXX XXXXX'],
  ['Address', 'address', 'text', 'Full address'],
]

// Popup with the form to add a new client
export default function AddClientModal() {
  // Form state and the save handler live in AppContext
  const {
    showAddClient,
    setShowAddClient,
    newClientForm,
    setNewClientForm,
    handleAddClient,
    addToast,
  } = useApp()

  // How the form looked when it was opened, to know whether anything was typed since
  const clientSignature = JSON.stringify(newClientForm)
  const clientBaseline = useRef(null)
  useEffect(() => { clientBaseline.current = showAddClient ? clientSignature : null }, [showAddClient]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clicking outside never closes the form; the cross asks to save or discard unsaved details
  const { requestClose, dialog, overlayHandlers } = useUnsavedGuard({
    dirty: !!showAddClient && clientBaseline.current !== null && clientSignature !== clientBaseline.current,
    onSave: () => handleAddClient(showAddClient === 'fromCase'),
    onDiscard: () => setShowAddClient(false),
  })

  // Lets the user crop the chosen photo before it is saved
  const { pick, cropper } = useImageCrop({
    shape: 'circle',
    title: 'Adjust client photo',
    onError: msg => addToast(msg, 'error'),
  })

  if (!showAddClient) return null

  // True when the modal was opened from inside the Add Case form
  const fromCase = showAddClient === 'fromCase'
  // Opened from another popup (Add Case, or the Misc. Application form), so it must sit on top of it
  const stacked = fromCase || showAddClient === 'fromMisc'

  // Take the chosen photo, reset the input so the same file can be picked again, and store the cropped result on the form
  function onPhotoSelected(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    pick(file, dataUrl => setNewClientForm(f => ({ ...f, profilePicture: dataUrl })))
  }

  return (
    <>
    <div className={`overlay${stacked ? ' overlay--stacked' : ''}`} {...overlayHandlers}>
      <div className="modal modal--md" onClick={e => e.stopPropagation()}>
        {cropper}

        <div className="modal__header">
          <h2 className="modal__title">Register New Client</h2>
          <button type="button"
            aria-label="Close"
            title="Close"
            className="btn-icon"
            onClick={requestClose}
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="client-form">

          <div className="add-client-photo">
            <label className="profile-card__avatar avatar-upload" title="Upload a photo (optional)">
              {newClientForm.profilePicture
                ? <img src={newClientForm.profilePicture} alt="Client" />
                : <Icon name="user" />}
              <span className="avatar-upload__badge"><Icon name="camera" /></span>
              <input
                type="file"
                accept="image/*"
                className="avatar-upload__input"
                onChange={onPhotoSelected}
              />
            </label>
            <div>
              <p className="form-label u-mb-2">Photo (optional)</p>
              {newClientForm.profilePicture ? (
                <button
                  type="button"
                  className="avatar-upload__remove"
                  onClick={() => setNewClientForm(f => ({ ...f, profilePicture: '' }))}
                >
                  Remove photo
                </button>
              ) : (
                <p className="doc-group__meta">No photo selected</p>
              )}
            </div>
          </div>

          {FIELDS.map(([label, key, type, ph]) => (
            <div key={key}>
              <label className="form-label">{starLabel(label)}</label>
              <input
                className="form-input"
                type={type}
                placeholder={ph}
                value={newClientForm[key] || ''}
                onChange={e =>
                  setNewClientForm(f => ({
                    ...f,
                    [key]: e.target.value
                  }))
                }
                {...(type === 'tel' ? {
                  inputMode: 'tel',
                  maxLength: 16,
                  pattern: '^(\\+91[\\s-]?|0)?[6-9]\\d{9}$',
                  title: 'Enter a valid 10-digit Indian mobile number (optionally with +91)',
                } : {})}
              />
            </div>
          ))}

          <div>
            <label className="form-label">Client Type</label>
            <Dropdown
              className="form-input"
              value={newClientForm.type || 'INDIVIDUAL'}
              onChange={e =>
                setNewClientForm(f => ({
                  ...f,
                  type: e.target.value
                }))
              }
            >
              <option value="INDIVIDUAL">Individual</option>
              <option value="COMPANY">Company</option>
              <option value="BANK">Bank</option>
              <option value="FINANCIAL INSTITUTE">Financial Institute</option>
              <option value="SOCIETY/NGO">Society/NGO</option>
              <option value="FOREIGN CLIENT">Foreign Client</option>
              <option value="HOSPITAL/MEDICAL INSTITUTE">
                Hospital/Medical Institute
              </option>
              <option value="ASSOCIATION">Association</option>
              <option value="OTHER">Other</option>
            </Dropdown>
          </div>

          <div>
            <label className="form-label">Label</label>
            <Dropdown
              className="form-input"
              value={newClientForm.customLabel || ''}
              onChange={e =>
                setNewClientForm(f => ({
                  ...f,
                  customLabel: e.target.value
                }))
              }
            >
              <option value="">Select Label</option>
              <option value="Legal Aid">Legal Aid</option>
              <option value="Pro Bono">Pro Bono</option>
              <option value="Corporate Panel">Corporate Panel</option>
              <option value="Private">Private</option>
            </Dropdown>
          </div>

        </div>

        <div className="form-actions">
          <button type="button"
            className="btn-outline"
            onClick={() => setShowAddClient(false)}
          >
            Cancel
          </button>

          <button type="button"
            className="btn-gold"
            onClick={() => handleAddClient(fromCase)}
          >
            Register Client
          </button>
        </div>

      </div>
    </div>
    {dialog}
    </>
  )
}