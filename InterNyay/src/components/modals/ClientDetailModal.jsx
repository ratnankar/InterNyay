import { starLabel } from '../common/Req'
import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import useOverlayClose from '../../hooks/useOverlayClose'
import useUnsavedGuard from '../../hooks/useUnsavedGuard'
import { CLIENT_TYPES, CLIENT_LABELS, STATUS_COLORS } from '../../constants/data'
import { formatDisplayDate } from '../../utils/dateUtils'
import useImageCrop from '../../hooks/useImageCrop'
import { caseHasClient, caseClientSubType } from '../../utils/caseClients'
import { useCourts, caseCourtLabel } from '../../constants/courts'
import { documentTitle, documentTypeLabel, isEvidenceDocument, evidenceTitle } from '../../utils/documentUtils'
import Dropdown from '../common/Dropdown'
import AvatarUpload from '../common/AvatarUpload'
import ImageViewer from '../common/ImageViewer'
import SeeMoreList from '../common/SeeMoreList'

import Icon from '../common/Icon'
import DocInfoButton from '../common/DocInfoButton'
import { confirmDialog } from '../../utils/confirmDialog'
import ModalPortal from '../../components/common/ModalPortal'
// Edit form inputs as [label, field name, input type, placeholder]
const FIELDS = [
  ['Full Name *',      'name',            'text', "Client's full legal name"],
  ['Email',            'email',           'email', 'client@email.com'],
  ['WhatsApp Phone',   'whatsappPhone',   'tel',  '+91 XXXXX XXXXX'],
  ['Additional Phone', 'additionalPhone', 'tel',  '+91 XXXXX XXXXX'],
  ['Address',          'address',         'text', 'Full address'],
]

// Popup with a client's details, cases and documents, where the client can be edited or deleted
export default function ClientDetailModal() {
  useCourts()
  // Selected client, cases and all the client actions come from AppContext
  const {
    selectedClient, setSelectedClient,
    cases, handleUpdateClient, handleDeleteClient,
    openEditCase, setTransactionCaseId, isAssociate, openCase,
    setFilterStatus,
    setUploadDocClientId, handleDeleteClientDocument,
    handleViewDocument, addToast,
    setShowUploadEvidence, setEvidenceCategory, setEvidenceTargetId,
    clientEditRequest, setClientEditRequest,
  } = useApp()

  // Whether the modal is in edit mode
  const [isEditing, setIsEditing] = useState(false)
  // True while the client's photo is open full size
  const [viewPhoto, setViewPhoto] = useState(false)
  // Draft values while editing (null when not editing)
  const [form, setForm] = useState(null)
  // Which collapsible sections (documents, evidence) are expanded
  const [openSections, setOpenSections] = useState({ documents: false, evidence: false })

  // Expand or collapse a section without triggering the parent click
  function toggleSection(e, section) {
    e.stopPropagation()
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  // Draft as it was when editing started, to know whether anything was changed
  const [formBaseline, setFormBaseline] = useState(null)

  // While the edit form is open, clicking outside does nothing and the cross asks to save or discard
  const { requestClose, dialog } = useUnsavedGuard({
    dirty: isEditing && !!form && formBaseline !== null && JSON.stringify(form) !== formBaseline,
    onSave: async () => { saveEdit(); close() },
    onDiscard: close,
  })

  // In view mode a click outside closes the window; in edit mode it never does
  const overlayHandlers = useOverlayClose(close, { backdrop: !isEditing })

  // Lets the user crop a new profile photo before saving
  const { pick, cropper } = useImageCrop({
    shape: 'circle',
    title: 'Adjust client photo',
    onError: msg => addToast(msg, 'error'),
  })

  // Opened from a reminder that needs a WhatsApp number: go straight to the edit form
  useEffect(() => {
    if (selectedClient && clientEditRequest != null && String(clientEditRequest) === String(selectedClient.id)) {
      startEdit()
      setClientEditRequest(null)
    }
  }, [selectedClient, clientEditRequest]) // eslint-disable-line react-hooks/exhaustive-deps

  // Nothing to show when no client is selected
  if (!selectedClient) return null

  // Short alias for the selected client
  const cl = selectedClient
  // Cases linked to this client
  const clientCases = cases.filter(c => caseHasClient(c, cl.id))

  // Copy the client's current values into the draft and switch to edit mode
  function startEdit() {
    const draft = {
      name: cl.name || '',
      email: cl.email || '',
      whatsappPhone: cl.whatsappPhone || cl.phone || '',
      additionalPhone: cl.additionalPhone || '',
      address: cl.address || '',
      type: cl.type || 'INDIVIDUAL',
      // The Blacklisted label has been removed, so it is dropped when the client is edited
      customLabel: cl.customLabel === 'Blacklisted' ? '' : (cl.customLabel || ''),
    }
    setForm(draft)
    setFormBaseline(JSON.stringify(draft))
    setIsEditing(true)
  }

  // Discard the draft
  function cancelEdit() {
    setIsEditing(false)
    setForm(null)
  }

  // Save the draft and leave edit mode
  function saveEdit() {
    handleUpdateClient(cl.id, form)
    setIsEditing(false)
    setForm(null)
  }

  // Close this modal and open the case on the Cases page
  function openCaseDetails(c) {
    close()
    setFilterStatus('All')
    openCase(c)
  }

  // Close the modal and reset edit and section state
  function close() {
    setSelectedClient(null)
    setIsEditing(false)
    setForm(null)
    setOpenSections({ documents: false, evidence: false })
  }

  // Ask for confirmation (mentioning linked cases if any) before deleting the client
  async function confirmDelete() {
    const linkedCount = clientCases.length
    const msg = linkedCount > 0
      ? `Delete "${cl.name}"? This client has ${linkedCount} linked case${linkedCount !== 1 ? 's' : ''}. This cannot be undone.`
      : `Delete "${cl.name}"? This cannot be undone.`

    if (await confirmDialog(msg)) {
      handleDeleteClient(cl.id)
    }
  }

  // Contact details to show, skipping any that are empty
  const infoItems = [
    ['Email',            cl.email],
    ['WhatsApp Phone',   cl.whatsappPhone || cl.phone],
    ['Additional Phone', cl.additionalPhone],
    ['Address',          cl.address],
  ].filter(([, value]) => value)

  // Crop the chosen photo and save it as the client's profile picture
  function onPhotoSelected(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    pick(file, dataUrl => handleUpdateClient(cl.id, { profilePicture: dataUrl }))
  }

  return (
    <>
    <ModalPortal>
      <div className="overlay" {...overlayHandlers}>
        <div className="modal modal--lg modal--client" onClick={e => e.stopPropagation()}>
          {cropper}
          {/* Full-size view of the client's photo */}
          {viewPhoto && cl.profilePicture && (
            <ImageViewer
              src={cl.profilePicture}
              alt={cl.name}
              caption={cl.name}
              onClose={() => setViewPhoto(false)}
            />
          )}

          <div className="modal__header">
            <h2 className="modal__title">{isEditing ? 'Edit Client' : 'Client Details'}</h2>
            <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={requestClose}><Icon name="close" /></button>
          </div>

          {!isEditing ? (
            <>
              <div className="client-detail__header">
                <AvatarUpload
                  className="client-card__avatar client-card__avatar--lg"
                  photo={cl.profilePicture}
                  alt={cl.name}
                  uploadTitle="Upload a photo (optional)"
                  onFile={onPhotoSelected}
                  onView={() => setViewPhoto(true)}
                />
                <div>
                  <p className="client-detail__name">{cl.name}</p>
                  <span className={`badge badge--${cl.type === 'COMPANY' || cl.type === 'INDIVIDUAL' ? (cl.type === 'INDIVIDUAL' ? 'individual' : 'corporate') : 'corporate'}`}>
                    {cl.type}
                  </span>
                  {cl.customLabel && <span className="badge badge--case-type">{cl.customLabel}</span>}
                  {cl.profilePicture && (
                    <button
                      type="button"
                      className="avatar-upload__remove"
                      onClick={() => handleUpdateClient(cl.id, { profilePicture: '' })}
                    >
                      Remove photo
                    </button>
                  )}
                </div>
                <button type="button" className="btn-outline u-ml-auto" onClick={startEdit}>
                  <Icon name="edit" /> Edit
                </button>
                <button type="button" className="btn-outline btn-outline--danger" onClick={confirmDelete}>
                  <Icon name="trash" /> Delete
                </button>
              </div>

              {infoItems.length > 0 && (
                <div className="profile-view-grid client-detail__info-grid">
                  {infoItems.map(([label, value]) => (
                    <div key={label} className="profile-view-item">
                      <p className="profile-view-item__label">{label}</p>
                      <p className="profile-view-item__value">{value}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="client-form">
                {FIELDS.map(([label, key, type, ph]) => (
                  <div key={key}>
                    <label className="form-label">{starLabel(label)}</label>
                    <input
                      className="form-input"
                      type={type}
                      placeholder={ph}
                      value={form[key] || ''}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
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
                    value={form.type || 'INDIVIDUAL'}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  >
                    {CLIENT_TYPES.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </Dropdown>
                </div>

                <div>
                  <label className="form-label">Label</label>
                  <Dropdown
                    className="form-input"
                    value={form.customLabel || ''}
                    onChange={e => setForm(f => ({ ...f, customLabel: e.target.value }))}
                  >
                    <option value="">Select Label</option>
                    {CLIENT_LABELS.map(l => <option key={l}>{l}</option>)}
                  </Dropdown>
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-outline" onClick={cancelEdit}>Cancel</button>
                <button type="button" className="btn-gold" onClick={saveEdit}>Save Changes</button>
              </div>
            </>
          )}

          {!isEditing && (
            <div className="client-detail__cases">
              <p className="case-detail__docs-label u-mt-24">
                Cases ({clientCases.length})
              </p>

              {clientCases.length === 0 && (
                <p className="fee-hearing-empty">No cases linked to this client yet.</p>
              )}

              <SeeMoreList items={clientCases} step={10} resetKey={cl.id}>
              {shownCases => shownCases.map(c => {
                return (
                  <div
                    key={c.id}
                    className="client-case-row u-pointer"
                  
                    role="button"
                    tabIndex={0}
                    title="Open case details"
                    onClick={() => openCaseDetails(c)}
                    onKeyDown={e => {
                      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault()
                        openCaseDetails(c)
                      }
                    }}
                  >
                    <div className="client-case-row__info">
                      <p className="client-case-row__title">{c.title}</p>
                      <p className="case-card__info">
                        Case No: {c.caseNo} • {caseCourtLabel(c)}
                      </p>
                      <div className="case-card__meta-row u-mt-4">
                        <span
                          className="badge"
                          style={{
                            background: (STATUS_COLORS[c.status] || '#999') + '18',
                            color: STATUS_COLORS[c.status] || '#999'
                          }}
                        >
                          {c.status}
                        </span>
                        {caseClientSubType(c, cl.id) && (
                          <span className="badge badge--case-type">{caseClientSubType(c, cl.id)}</span>
                        )}
                        <span className="case-card__info">
                          Next Hearing: {c.nextHearing ? formatDisplayDate(c.nextHearing) : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="client-case-row__actions" onClick={e => e.stopPropagation()}>
                      <button type="button"
                        className="btn-outline btn-outline--sm"
                        onClick={() => {
                          close()
                          openEditCase(c)
                        }}
                      >
                        <Icon name="edit" /> Edit
                      </button>
                      {!isAssociate && (
                        <button type="button"
                          className="btn-outline btn-outline--sm"
                          onClick={() => setTransactionCaseId(c.id)}
                        >
                          <Icon name="money" /> Transactions
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
              </SeeMoreList>
            </div>
          )}

          {!isEditing && (() => {
            const generalDocs = (cl.documents || []).filter(d => !isEvidenceDocument(d))
            const evidence = (cl.documents || []).filter(isEvidenceDocument)

            return (
            <div className="client-detail__cases">
              <div className={`exp-card${openSections.documents ? ' exp-card--open' : ''}`}>
                <button type="button" className="exp-card__head" onClick={e => toggleSection(e, 'documents')}>
                  <div className="exp-card__avatar"><Icon name="file" /></div>
                  <div className="exp-card__titles">
                    <p className="exp-card__primary">Documents</p>
                    <p className="exp-card__secondary">
                      {generalDocs.length} file{generalDocs.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <span className="exp-card__arrow">{openSections.documents ? '▲' : '▼'}</span>
                </button>

                {openSections.documents && (
                  <div className="exp-card__body">
                    <div className="case-detail__docs-label-row">
                      <p className="case-detail__docs-label u-mt-0">
                        Documents ({generalDocs.length})
                      </p>
                      <button type="button"
                        className="btn-outline btn-outline--sm"
                        onClick={e => {
                          e.stopPropagation()
                          setUploadDocClientId(cl.id)
                        }}
                      >
                        + Upload Document
                      </button>
                    </div>

                    {generalDocs.length === 0 ? (
                      <p className="fee-hearing-empty">No general documents uploaded for this client yet.</p>
                    ) : (
                      <SeeMoreList items={generalDocs} step={10} resetKey={cl.id}>
                      {shownDocs => shownDocs.map(document => (
                        <div
                          key={document.id}
                          className="case-detail__doc-row case-detail__doc-row--clickable"
                          title="Open document"
                          onClick={e => {
                            e.stopPropagation()
                            handleViewDocument(document)
                          }}
                        >
                          <span className="case-detail__doc-icon"><Icon name="file" /></span>
                          <div className="case-detail__doc-body">
                            <p className="case-detail__doc-name">{documentTitle(document)}<DocInfoButton doc={document} /></p>
                            <p className="case-detail__doc-meta">
                              {documentTypeLabel(document) && `${documentTypeLabel(document)} • `}
                              {document.size || 'Unknown size'}
                              {' • '}
                              {document.date || ''}
                            </p>
                          </div>
                          <div className="case-detail__doc-actions">
                            <button type="button"
                              className="btn-outline btn-outline--sm"
                              title="Open in this tab"
                              onClick={e => {
                                e.stopPropagation()
                                handleViewDocument(document)
                              }}
                            >
                              <Icon name="eye" /> Open
                            </button>
                            <button type="button"
                              className="btn-icon btn-icon--danger"
                              title="Delete document"
                              onClick={async e => {
                                e.stopPropagation()
                                if (await confirmDialog(`Delete document "${document.name}"?`)) {
                                  handleDeleteClientDocument(cl.id, document.id)
                                }
                              }}
                            >
                              <Icon name="trash" />
                            </button>
                          </div>
                        </div>
                      ))}
                      </SeeMoreList>
                    )}
                  </div>
                )}
              </div>

              <div className={`exp-card${openSections.evidence ? ' exp-card--open' : ''} u-mt-8`} >
                <button type="button" className="exp-card__head" onClick={e => toggleSection(e, 'evidence')}>
                  <div className="exp-card__avatar"><Icon name="film" /></div>
                  <div className="exp-card__titles">
                    <p className="exp-card__primary">Evidence</p>
                    <p className="exp-card__secondary">
                      {evidence.length} item{evidence.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <span className="exp-card__arrow">{openSections.evidence ? '▲' : '▼'}</span>
                </button>

                {openSections.evidence && (
                  <div className="exp-card__body">
                    <div className="case-detail__docs-label-row">
                      <p className="case-detail__docs-label u-mt-0">
                        Evidence ({evidence.length})
                      </p>
                      <button type="button"
                        className="btn-outline btn-outline--sm"
                        onClick={e => {
                          e.stopPropagation()
                          setEvidenceCategory('Client')
                          setEvidenceTargetId(cl.id)
                          setShowUploadEvidence(true)
                        }}
                      >
                        + Upload Evidence
                      </button>
                    </div>

                    {evidence.length === 0 ? (
                      <p className="fee-hearing-empty">No evidence uploaded for this client yet.</p>
                    ) : (
                      <SeeMoreList items={evidence} step={10} resetKey={cl.id}>
                      {shownEvidence => shownEvidence.map(document => (
                        <div
                          key={document.id}
                          className="case-detail__doc-row case-detail__doc-row--clickable"
                          title="Open evidence"
                          onClick={e => {
                            e.stopPropagation()
                            handleViewDocument(document)
                          }}
                        >
                          <span className="case-detail__doc-icon"><Icon name="film" /></span>
                          <div className="case-detail__doc-body">
                            <p className="case-detail__doc-name">{evidenceTitle(document)}<DocInfoButton doc={document} /></p>
                            <p className="case-detail__doc-meta">
                              {document.size || 'Unknown size'}
                              {' • '}
                              {document.date || ''}
                            </p>
                          </div>
                          <div className="case-detail__doc-actions">
                            <button type="button"
                              className="btn-outline btn-outline--sm"
                              title="Open in this tab"
                              onClick={e => {
                                e.stopPropagation()
                                handleViewDocument(document)
                              }}
                            >
                              <Icon name="eye" /> Open
                            </button>
                            <button type="button"
                              className="btn-icon btn-icon--danger"
                              title="Delete evidence"
                              onClick={async e => {
                                e.stopPropagation()
                                if (await confirmDialog(`Delete evidence "${evidenceTitle(document)}"?`)) {
                                  handleDeleteClientDocument(cl.id, document.id)
                                }
                              }}
                            >
                              <Icon name="trash" />
                            </button>
                          </div>
                        </div>
                      ))}
                      </SeeMoreList>
                    )}
                  </div>
                )}
              </div>
            </div>
            )
          })()}
        </div>
      </div>
    </ModalPortal>
    {dialog}
    </>
  )
}
