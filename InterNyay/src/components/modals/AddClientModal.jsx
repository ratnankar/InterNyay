import { Fragment, useEffect, useMemo, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import useUnsavedGuard from '../../hooks/useUnsavedGuard'
import useImageCrop from '../../hooks/useImageCrop'
import Dropdown from '../common/Dropdown'
import { starLabel } from '../common/Req'
import { findClientMatches, relationText, RELATION_TYPES } from '../../utils/clientMatch'
import { caseClientIds } from '../../utils/caseClients'

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
    markTarget,
    addToast,
    clients,
    caseClients,
    cases,
    attachExistingClient,
  } = useApp()

  // Saved clients that look like the one being registered (same name, other name or phone)
  const matches = useMemo(
    () => (showAddClient ? findClientMatches(clients, newClientForm) : []),
    [showAddClient, clients, newClientForm.name, newClientForm.relationName, newClientForm.otherNames,
      newClientForm.whatsappPhone, newClientForm.additionalPhone]
  )
  // Clients already on the case being worked on, so they are shown as added
  const onCaseIds = useMemo(() => {
    if (showAddClient === 'fromCase') return new Set((caseClients || []).map(c => Number(c.id)))
    if (showAddClient === 'markNonClient' && markTarget?.caseId != null) {
      const c = (cases || []).find(x => x.id === markTarget.caseId)
      return new Set(c ? caseClientIds(c) : [])
    }
    if (showAddClient === 'markNonClient') return new Set((caseClients || []).map(c => Number(c.id)))
    return new Set()
  }, [showAddClient, caseClients, cases, markTarget])
  const hasExact = matches.some(m => m.exact)

  // How the form looked when it was opened, to know whether anything was typed since
  const clientSignature = JSON.stringify(newClientForm)
  const clientBaseline = useRef(null)
  useEffect(() => { clientBaseline.current = showAddClient ? clientSignature : null }, [showAddClient])

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
  // True when a non-client party of a case is being marked as a client (their details are filled in already)
  const marking = showAddClient === 'markNonClient'
  // Opened from another popup (Add Case, or the Misc. Application form), so it must sit on top of it.
  // Marking a non-client of the open case form is also on top of it; on a saved case's page it is not
  const stacked = fromCase || showAddClient === 'fromMisc' || (marking && markTarget?.caseId == null)

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
          <h2 className="modal__title">{marking ? 'Mark as Client' : 'Register New Client'}</h2>
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

          {marking && (
            <p className="case-parties__hint">
              The details given for {markTarget?.nonClient?.name || 'this person'} are filled in below.
              Registering saves them in your clients and puts them on the case as a client.
            </p>
          )}

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
            <Fragment key={key}>
            <div>
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

            {key === 'name' && (
              <>
                <div>
                  <label className="form-label">Son of / Daughter of / Wife of</label>
                  <div className="client-relation">
                    <Dropdown
                      className="form-input client-relation__type"
                      value={newClientForm.relationType || 'S/o'}
                      onChange={e => setNewClientForm(f => ({ ...f, relationType: e.target.value }))}
                    >
                      {RELATION_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </Dropdown>
                    <input
                      className="form-input"
                      placeholder="Father's / husband's name (optional)"
                      maxLength={255}
                      autoComplete="off"
                      value={newClientForm.relationName || ''}
                      onChange={e => setNewClientForm(f => ({ ...f, relationName: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label">Other names (optional)</label>
                  {(newClientForm.otherNames || []).map((n, i) => (
                    <div className="client-other-name" key={i}>
                      <input
                        className="form-input"
                        placeholder="Another name this person is known by"
                        maxLength={255}
                        autoComplete="off"
                        value={n}
                        onChange={e => setNewClientForm(f => ({
                          ...f,
                          otherNames: (f.otherNames || []).map((x, j) => (j === i ? e.target.value : x)),
                        }))}
                      />
                      <button
                        type="button"
                        className="btn-outline"
                        aria-label="Remove this name"
                        title="Remove this name"
                        onClick={() => setNewClientForm(f => ({
                          ...f,
                          otherNames: (f.otherNames || []).filter((_, j) => j !== i),
                        }))}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn-outline client-add-more"
                    onClick={() => setNewClientForm(f => ({ ...f, otherNames: [...(f.otherNames || []), ''] }))}
                  >
                    + Add another name
                  </button>
                </div>

                {matches.length > 0 && (
                  <div className="client-dup" role="status">
                    <p className="client-dup__title">
                      {hasExact ? 'This client is already added' : 'Similar clients already in your list'}
                    </p>
                    {matches.map(({ client: c, exact }) => {
                      const onCase = onCaseIds.has(Number(c.id))
                      return (
                        <div className="client-dup__row" key={c.id}>
                          <div className="client-dup__info">
                            <p className="client-dup__name">
                              {c.name}{exact && <span className="client-selected__tag">Same client</span>}
                            </p>
                            <p className="client-dup__meta">
                              {[relationText(c), c.whatsappPhone, c.email].filter(Boolean).join(' · ') || 'No other details'}
                            </p>
                          </div>
                          {showAddClient === 'fromCase' || showAddClient === 'markNonClient' ? (
                            <button
                              type="button"
                              className="btn-outline"
                              disabled={onCase}
                              onClick={() => attachExistingClient(c)}
                            >
                              {onCase ? 'Already on this case' : 'Use this client'}
                            </button>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
            </Fragment>
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
            disabled={hasExact}
            title={hasExact ? 'This client is already in your list' : undefined}
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