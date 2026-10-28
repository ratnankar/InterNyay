import { useMemo, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import { MISC_OUTCOMES, MISC_TYPE_MANUAL } from '../../constants/data'
import { confirmDialog } from '../../utils/confirmDialog'
import { getErrorMessage } from '../../utils/errorMessages'
import { formatDate, formatDisplayDate } from '../../utils/dateUtils'
import {
  APPLICATION_CHOICES, docIcon, isDisposed, isValidCnr, resolveApplicationType, splitApplicationType, statusSlug,
} from '../misc/miscUtils'
import { useCourts, getDistricts, hasNamedDistricts, isHighCourt } from '../../constants/courts'
import useOverlayClose from '../../hooks/useOverlayClose'
import Dropdown from '../common/Dropdown'
import Icon from '../common/Icon'
import Req from '../common/Req'
import ModalPortal from '../common/ModalPortal'
import MiscHearingPanel from '../misc/MiscHearingPanel'
import ClearableDateInput from '../common/ClearableDateInput'
import SearchPick from '../misc/SearchPick'

// One document of the application with its Open, Download and Delete buttons
function DocRow({ doc, onView, onDownload, onDelete }) {
  return (
    <div className="doc-row">
      <div className="doc-row__icon"><Icon name={docIcon(doc.fileName || doc.name)} /></div>
      <div className="doc-row__body">
        <p className="doc-row__name">{doc.name}</p>
        <p className="doc-row__meta">
          {doc.size}
          {' • '}
          <span className="u-nowrap">Uploaded {doc.date ? String(doc.date).slice(0, 10) : 'Unknown date'}</span>
        </p>
      </div>
      <div className="doc-row__actions">
        <button type="button" className="btn-outline" onClick={onView} title="Open in this tab"><Icon name="eye" /> Open</button>
        <button type="button" className="btn-outline" onClick={onDownload}><Icon name="download" /> Download</button>
        <button type="button" className="btn-outline btn-outline--danger" onClick={onDelete}><Icon name="trash" /> Delete</button>
      </div>
    </div>
  )
}

// A titled block of documents with an upload button; `children` are the rows
// collapsible: the block starts closed and its title opens it (the upload button stays in view); count is shown in the title
function DocBlock({ title, hint, empty, uploadLabel, onPick, multiple = false, disabled = false, busy, children, hasRows, collapsible = false, count = 0 }) {
  const input = useRef(null)
  const [open, setOpen] = useState(!collapsible)
  return (
    <div className="misc-docblock">
      <div className="misc-docblock__head">
        {collapsible ? (
          <button type="button" className="hearing-history__toggle" aria-expanded={open} onClick={() => setOpen(v => !v)}>
            <span className={`hearing-history__caret${open ? ' hearing-history__caret--open' : ''}`}>▸</span>
            {title}{count > 0 ? ` (${count})` : ''}
          </button>
        ) : (
          <div>
            <p className="misc-docblock__title">{title}</p>
            {hint && <p className="doc-group__meta">{hint}</p>}
          </div>
        )}
        {!disabled && (
          <>
            <input ref={input} type="file" className="u-hidden" multiple={multiple}
              onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) onPick(files) }} />
            <button type="button" className="btn-outline btn-outline--sm" disabled={busy} onClick={() => input.current?.click()}>
              <Icon name="folder" /> {busy ? 'Uploading…' : uploadLabel}
            </button>
          </>
        )}
      </div>
      {open && (hasRows ? children : <p className="doc-group__evidence-empty"><Icon name="inbox" /> {empty}</p>)}
    </div>
  )
}

// Window for one application: its case, details, status, order (only while disposing off and once disposed off) and documents
export default function MiscApplicationDetailModal({ app, onChange, onDeleted, onClose }) {
  const { addToast, bumpHearings, handleViewDocument, handleDownloadDocument, cases, clients, setCases } = useApp()
  const { courtNames, highCourts } = useCourts()
  const overlayHandlers = useOverlayClose(onClose)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState('')
  const [disposing, setDisposing] = useState(false)
  const [disposedOn, setDisposedOn] = useState(formatDate(new Date()))
  // Allowed or Disallowed, chosen when the application is disposed off
  const [outcome, setOutcome] = useState('')
  const [orderFile, setOrderFile] = useState(null)

  const disposed = isDisposed(app)

  // Runs one request: shows what is happening, hands the answer to the page, and reports a failure
  async function run(label, fn, failure) {
    setBusy(label)
    try {
      const updated = await fn()
      onChange(updated)
      return updated
    } catch (e) {
      addToast(getErrorMessage(e, failure), 'error')
      return null
    } finally {
      setBusy('')
    }
  }

  // Cases to move an application to: the open ones first, then the others
  const caseChoices = useMemo(() => {
    const isOpen = c => !['Decided', 'Withdrawn'].includes(c.status)
    return [...cases].sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)))
  }, [cases])

  // An application added with a new case edits that case's details; one filed in an existing case can be moved to another case
  const ownCase = !!app.caseCreatedHere

  function startEdit() {
    const { choice, custom } = splitApplicationType(app.applicationType)
    setDraft({
      applicationChoice: choice,
      applicationCustom: custom,
      filingDate: app.filingDate || '',
      caseId: Number(app.caseId),
      clientId: app.clientId ? Number(app.clientId) : null,
      caseTitle: app.caseTitle || '',
      caseNo: app.caseNo || '',
      cnrNo: app.cnrNo || '',
      court: app.court || '',
      district: app.district || '',
    })
    setEditing(true)
  }

  async function saveEdit() {
    const applicationType = resolveApplicationType(draft.applicationChoice, draft.applicationCustom)
    if (!applicationType) { addToast('Choose or type the application', 'error'); return }

    if (ownCase) {
      if (!draft.clientId) { addToast('Choose the client', 'error'); return }
      if (!draft.caseTitle.trim()) { addToast('Enter the case title', 'error'); return }
      if (draft.cnrNo.trim() && !isValidCnr(draft.cnrNo)) { addToast('The CNR number must be 16 characters', 'error'); return }
      if (!draft.court) { addToast('Choose the court', 'error'); return }
      if (hasNamedDistricts(draft.court) && !draft.district) { addToast('Choose the district', 'error'); return }
    } else if (!draft.caseId) {
      addToast('Choose the case the application is filed in', 'error'); return
    }

    const updated = await run('save', () => api.miscApplications.update(app.id, {
      applicationType,
      filingDate: draft.filingDate || null,
      // The hearing date has its own Update button, so it is sent back as it is
      hearingDate: app.hearingDate || null,
      ...(ownCase
        ? {
            caseTitle: draft.caseTitle.trim(),
            // Empty clears them: the case number and CNR are optional
            caseNo: draft.caseNo.trim(),
            cnrNo: draft.cnrNo.trim(),
            clientId: draft.clientId,
            court: draft.court,
            district: draft.district,
          }
        : { caseId: draft.caseId }),
    }), 'Could not save the changes')

    if (updated) {
      setEditing(false)
      if (ownCase) await refreshCase(updated)
      // Hearing lists show the case, so they are read again when the case changed
      if (Number(updated.caseId) !== Number(app.caseId) || ownCase) bumpHearings(updated.caseId)
      addToast('Application updated')
    }
  }

  // Reads the case again after its details were edited here, so the case list shows the new details
  async function refreshCase(updated) {
    try {
      const res = await api.cases.list({ search: updated.caseNo || updated.caseTitle, size: 10 })
      const found = (Array.isArray(res) ? res : res?.content || []).find(c => Number(c.id) === Number(updated.caseId))
      if (found) {
        setCases(prev => prev.map(c => (Number(c.id) === Number(found.id) ? { ...found, documents: found.documents || c.documents || [] } : c)))
      }
    } catch { /* the case shows its new details the next time the app loads its data */ }
  }

  // Disposes the application off, then stores the order when one was chosen (the order is optional and can come later)
  async function confirmDispose() {
    if (!outcome) { addToast('Choose whether the application was allowed or disallowed', 'error'); return }

    const updated = await run('dispose', () => api.miscApplications.dispose(app.id, disposedOn, outcome), 'Could not mark the application as disposed off')
    if (!updated) return

    setDisposing(false)
    setOutcome('')
    if (orderFile) {
      const withOrder = await run('order', () => api.miscApplications.uploadDoc(app.id, orderFile, 'ORDER'),
        'Marked as disposed off, but the order could not be uploaded. Add it again from here.')
      if (withOrder) addToast(`Application ${outcome.toLowerCase()} and order saved`)
    } else {
      addToast(`Application ${outcome.toLowerCase()}`)
    }
    setOrderFile(null)
  }

  async function reopen() {
    if (!(await confirmDialog({ message: 'Take this application back to pending?', confirmLabel: 'Reopen' }))) return
    const updated = await run('reopen', () => api.miscApplications.reopen(app.id), 'Could not reopen the application')
    if (updated) addToast('Application is pending again')
  }

  async function upload(files, role, successText) {
    let latest = null
    for (const file of files) {
      latest = await run('upload-' + role, () => api.miscApplications.uploadDoc(app.id, file, role), 'Upload failed — document not saved') || latest
    }
    if (latest) addToast(successText)
  }

  async function removeDoc(doc) {
    if (!(await confirmDialog(`Delete document "${doc.name}"?`))) return
    const updated = await run('remove', () => api.miscApplications.removeDoc(app.id, doc.id), 'Could not delete the document')
    if (updated) addToast('Document deleted')
  }

  async function removeApplication() {
    const ok = await confirmDialog(`Delete the application "${app.applicationType}"? Its documents are deleted too. The case stays.`)
    if (!ok) return
    setBusy('delete')
    try {
      await api.miscApplications.remove(app.id)
      // Its hearing dates leave the calendar counts
      bumpHearings(app.caseId)
      onDeleted(app.id)
      addToast('Application deleted')
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not delete the application'), 'error')
      setBusy('')
    }
  }

  const rowProps = doc => ({
    doc,
    onView: () => handleViewDocument(doc),
    onDownload: () => handleDownloadDocument(doc),
    onDelete: () => removeDoc(doc),
  })

  const orderBlock = (
    <DocBlock
      title="Order"
      hint="The court order passed on the application."
      empty="No order uploaded yet."
      uploadLabel={app.orderDocument ? 'Replace order' : 'Upload order'}
      busy={busy === 'upload-ORDER'}
      hasRows={!!app.orderDocument}
      onPick={files => upload(files.slice(0, 1), 'ORDER', 'Order uploaded')}
    >
      {app.orderDocument && <DocRow {...rowProps(app.orderDocument)} />}
    </DocBlock>
  )

  return (
    <ModalPortal>
      <div className="overlay" {...overlayHandlers}>
        <div className="modal misc-modal misc-modal--wide" onClick={e => e.stopPropagation()}>

          <div className="modal__header">
            <h2 className="modal__title">{app.applicationType}</h2>
            <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={onClose}><Icon name="close" /></button>
          </div>

          {/* The case the application is filed in */}
          <div className="misc-casebox">
            <p className="misc-casebox__title">{app.caseTitle}</p>
            <p className="misc-casebox__meta">
              {[app.caseNo, app.clientName, [app.court, app.district].filter(Boolean).join(', ')].filter(Boolean).join(' • ')}
            </p>
            <span className={`misc-status misc-status--${statusSlug(app.status)}`}>{app.status}</span>
            {disposed && app.disposalOutcome && (
              <span className={`misc-status misc-status--${statusSlug(app.disposalOutcome)}`}> {app.disposalOutcome}</span>
            )}
            {disposed && app.disposedOn && <span className="doc-group__meta misc-casebox__date">Disposed off on {formatDisplayDate(app.disposedOn)}</span>}
          </div>

          {/* Details: read-only until Edit is pressed */}
          {!editing && (
            <div className="misc-details">
              <div><p className="misc-details__label">Filing date</p><p>{app.filingDate ? formatDisplayDate(app.filingDate) : '—'}</p></div>
              <div className="misc-details__action">
                <button type="button" className="btn-outline btn-outline--sm" onClick={startEdit}><Icon name="edit" /> Edit details</button>
              </div>
            </div>
          )}

          {editing && draft && (
            <div className="misc-details misc-details--edit">
              <div className="misc-grid__wide">
                <label className="form-label">Application</label>
                <Dropdown className="form-input" value={draft.applicationChoice}
                  onChange={e => setDraft(d => ({ ...d, applicationChoice: e.target.value }))}>
                  {APPLICATION_CHOICES.map(t => <option key={t} value={t}>{t}</option>)}
                </Dropdown>
              </div>
              {draft.applicationChoice === MISC_TYPE_MANUAL && (
                <div className="misc-grid__wide">
                  <label className="form-label">Application name</label>
                  <input className="form-input" maxLength={255} value={draft.applicationCustom}
                    onChange={e => setDraft(d => ({ ...d, applicationCustom: e.target.value }))} />
                </div>
              )}
              <div>
                <label className="form-label">Filing date</label>
                <ClearableDateInput className="form-input"  value={draft.filingDate}
                  onChange={e => setDraft(d => ({ ...d, filingDate: e.target.value }))} />
              </div>

              {/* Filed in an existing case: the case can be changed */}
              {!ownCase && (
                <div className="misc-grid__wide">
                  <SearchPick
                    label="Case"
                    placeholder="Search by case title or number…"
                    items={caseChoices}
                    selectedId={draft.caseId}
                    onSelect={c => setDraft(d => ({ ...d, caseId: Number(c.id) }))}
                    onClear={() => setDraft(d => ({ ...d, caseId: null }))}
                    matches={(c, q) => (c.title || '').toLowerCase().includes(q) || (c.caseNo || '').toLowerCase().includes(q)}
                    renderMain={c => c.title}
                    renderMeta={c => [c.caseNo, c.clientName].filter(Boolean).join(' • ')}
                    emptyText="You have no cases."
                  />
                </div>
              )}

              {/* Added together with a new case: the details of that case can be edited */}
              {ownCase && (
                <>
                  <div className="misc-grid__wide">
                    <SearchPick
                      label="Client"
                      placeholder="Search client by name, email or phone…"
                      items={[...clients].sort((a, b) => Number(b.id) - Number(a.id))}
                      selectedId={draft.clientId}
                      onSelect={c => setDraft(d => ({ ...d, clientId: Number(c.id) }))}
                      onClear={() => setDraft(d => ({ ...d, clientId: null }))}
                      matches={(c, q) => [c.name, c.email, c.whatsappPhone, c.additionalPhone].some(v => String(v || '').toLowerCase().includes(q))}
                      renderMain={c => c.name}
                      renderMeta={c => c.email || c.whatsappPhone || 'No contact details'}
                      emptyText="No clients yet."
                    />
                  </div>
                  <div className="misc-grid__wide">
                    <label className="form-label">Case title<Req /></label>
                    <input className="form-input" maxLength={500} value={draft.caseTitle}
                      onChange={e => setDraft(d => ({ ...d, caseTitle: e.target.value }))} />
                  </div>
                  <div>
                    <label className="form-label">Case number</label>
                    <input className="form-input" maxLength={255} placeholder="e.g. CC 1234/2026" value={draft.caseNo}
                      onChange={e => setDraft(d => ({ ...d, caseNo: e.target.value }))} />
                  </div>
                  <div>
                    <label className="form-label">CNR number</label>
                    <input className="form-input" maxLength={24} placeholder="16-character CNR" value={draft.cnrNo}
                      onChange={e => setDraft(d => ({ ...d, cnrNo: e.target.value }))} />
                  </div>
                  <div>
                    <label className="form-label">Court<Req /></label>
                    <Dropdown className="form-input" value={draft.court}
                      onChange={e => {
                        const court = e.target.value
                        setDraft(d => ({ ...d, court, district: getDistricts(court)[0] || '' }))
                      }}>
                      <option value="">Select Court</option>
                      {courtNames.length > 0 && (
                        <optgroup label="District Courts">
                          {courtNames.map(c => <option key={c} value={c}>{c}</option>)}
                        </optgroup>
                      )}
                      {highCourts.length > 0 && (
                        <optgroup label="High Courts">
                          {highCourts.map(c => <option key={c} value={c}>{c}</option>)}
                        </optgroup>
                      )}
                    </Dropdown>
                  </div>
                  <div>
                    <label className="form-label">District{hasNamedDistricts(draft.court) && <Req />}</label>
                    <Dropdown className="form-input" value={draft.district}
                      disabled={!hasNamedDistricts(draft.court)}
                      onChange={e => setDraft(d => ({ ...d, district: e.target.value }))}>
                      {!hasNamedDistricts(draft.court) && (
                        <option value={draft.district || ''}>
                          {!draft.court ? 'Select a court first' : isHighCourt(draft.court) ? 'Not applicable' : 'No district'}
                        </option>
                      )}
                      {hasNamedDistricts(draft.court) && getDistricts(draft.court).map(d => <option key={d} value={d}>{d}</option>)}
                    </Dropdown>
                  </div>
                </>
              )}
              <div className="misc-grid__wide form-actions">
                <button type="button" className="btn-outline" onClick={() => setEditing(false)} disabled={busy === 'save'}>Cancel</button>
                <button type="button" className="btn-gold" onClick={saveEdit} disabled={busy === 'save'}>{busy === 'save' ? 'Saving…' : 'Save changes'}</button>
              </div>
            </div>
          )}

          {/* Status: pending applications can be disposed off, and the order is added then */}
          <div className="misc-section">
            {!disposed && !disposing && (
              <button type="button" className="btn-gold" onClick={() => setDisposing(true)}>Mark as Disposed Off</button>
            )}

            {!disposed && disposing && (
              <div className="misc-dispose">
                <p className="misc-docblock__title">Dispose off this application</p>
                <div>
                  <label className="form-label">Was the application allowed or disallowed?<Req /></label>
                  <div className="misc-outcome" role="radiogroup" aria-label="Outcome">
                    {MISC_OUTCOMES.map(o => (
                      <button key={o} type="button" role="radio" aria-checked={outcome === o}
                        className={outcome === o ? 'btn-gold' : 'btn-outline'} onClick={() => setOutcome(o)}>
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="misc-grid">
                  <div>
                    <label className="form-label">Disposed off on</label>
                    <div className="misc-clearable">
                      <input className="form-input" type="date" value={disposedOn} onChange={e => setDisposedOn(e.target.value)} />
                      {disposedOn && (
                        <button type="button" className="misc-clearable__btn" aria-label="Clear the date" title="Clear the date"
                          onClick={() => setDisposedOn('')}><Icon name="close" /></button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Order (optional)</label>
                    <div className="misc-file">
                      <input type="file" id="misc-order-file" className="u-hidden"
                        onChange={e => { setOrderFile(e.target.files?.[0] || null); e.target.value = '' }} />
                      <label htmlFor="misc-order-file" className="btn-outline"><Icon name="folder" /> {orderFile ? 'Change file' : 'Choose order'}</label>
                    </div>
                    {orderFile && <span className="misc-file__name">{orderFile.name}</span>}
                  </div>
                </div>
                <p className="misc-dispose__hint">The order can also be uploaded later from this window.</p>
                <div className="form-actions">
                  <button type="button" className="btn-outline" onClick={() => { setDisposing(false); setOrderFile(null); setOutcome('') }} disabled={!!busy}>Cancel</button>
                  <button type="button" className="btn-gold" onClick={confirmDispose} disabled={!!busy || !outcome}>
                    {busy === 'dispose' || busy === 'order' ? 'Saving…' : 'Dispose Off'}
                  </button>
                </div>
              </div>
            )}

            {/* Once disposed off, the order sits right under the status */}
            {disposed && orderBlock}

            {disposed && (
              <button type="button" className="btn-outline" onClick={reopen} disabled={!!busy}>Reopen (back to pending)</button>
            )}
          </div>

          {/* Hearing history of this application, apart from the case's own: next hearing date, edit and delete live here */}
          <div className="misc-docblock">
            <MiscHearingPanel app={app} onChange={onChange} />
          </div>

          {/* Documents */}
          <DocBlock
            title="Application"
            hint="The application as filed in court."
            empty="No application file uploaded yet."
            uploadLabel={app.applicationDocument ? 'Replace file' : 'Upload application'}
            busy={busy === 'upload-APPLICATION'}
            hasRows={!!app.applicationDocument}
            onPick={files => upload(files.slice(0, 1), 'APPLICATION', 'Application uploaded')}
          >
            {app.applicationDocument && <DocRow {...rowProps(app.applicationDocument)} />}
          </DocBlock>

          <DocBlock
            title="Additional documents"
            collapsible
            count={app.additionalDocuments?.length || 0}
            empty="No additional documents."
            uploadLabel="Add documents"
            multiple
            busy={busy === 'upload-ADDITIONAL'}
            hasRows={app.additionalDocuments?.length > 0}
            onPick={files => upload(files, 'ADDITIONAL', files.length === 1 ? 'Document uploaded' : 'Documents uploaded')}
          >
            {(app.additionalDocuments || []).map(d => <DocRow key={d.id} {...rowProps(d)} />)}
          </DocBlock>

          <div className="form-actions misc-footer">
            <button type="button" className="btn-outline btn-outline--danger" onClick={removeApplication} disabled={!!busy}>
              <Icon name="trash" /> Delete application
            </button>
            <button type="button" className="btn-outline" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
