import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { legalForms as legalFormsApi } from '../services/api'
import useOverlayClose from '../hooks/useOverlayClose'
import FormFillWindow from '../components/common/FormFillWindow'
import { getFormFields } from '../utils/legalForms'

import Icon from '../components/common/Icon'
import ErrorMessage from '../components/common/ErrorMessage'
import { getErrorMessage } from '../utils/errorMessages'
import ModalPortal from '../components/common/ModalPortal'
// Legal Forms page: browse official court forms and open, download, print or auto-fill them
export default function LegalForms() {
  // Forms list with its loading and error state
  const { setDocPreview } = useApp()

  const [forms, setForms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Id of the form currently being downloaded, printed or opened (null when idle)
  const [downloading, setDownloading] = useState(null)
  const [printing, setPrinting] = useState(null)
  const [opening, setOpening] = useState(null)

  // Form currently open in the auto-fill window
  const [fillForm, setFillForm] = useState(null)

  // Load the forms once on mount
  useEffect(() => { loadForms() }, [])

  // Fetch the forms list; an empty list and an error message are set if it fails
  async function loadForms() {
    try {
      setLoading(true)
      setError('')
      const data = await legalFormsApi.list()
      setForms(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Failed to load legal forms:', e)
      setForms([])
      setError(getErrorMessage(e, 'We could not load the legal forms. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  // Download the form file
  async function handleDownload(form) {
    try {
      setError('')
      setDownloading(form.id)
      await legalFormsApi.download(form.id, form.name)
    } catch (e) {
      setError(getErrorMessage(e, 'We could not download this form. Please try again.'))
    } finally {
      setDownloading(null)
    }
  }

  // Fetch a preview of the form and show it in the document preview
  async function handleOpen(form) {
    try {
      setError('')
      setOpening(form.id)
      const url = await legalFormsApi.previewBlob(form.id, true)
      setDocPreview({ url, title: form.name || 'Legal Form' })
    } catch (e) {
      setError(getErrorMessage(e, 'We could not open this form. Please try again.'))
    } finally {
      setOpening(null)
    }
  }

  // Send the form to the print dialog
  async function handlePrint(form) {
    try {
      setError('')
      setPrinting(form.id)
      await legalFormsApi.print(form.id)
    } catch (e) {
      setError(getErrorMessage(e, 'We could not print this form. Please try again.'))
    } finally {
      setPrinting(null)
    }
  }

  // Open and close the auto-fill window
  const openFill = form => setFillForm(form)
  // Close the form fill window
  const closeFill = () => setFillForm(null)

  // Close the auto-fill window when the overlay is clicked
  const overlayHandlers = useOverlayClose(closeFill, { backdrop: false })

  // Simple loading screen while the forms are being fetched
  if (loading) {
    return (
      <div>
        {/* Page title shown while loading */}
        <div className="page-header"><h1 className="page-title">Legal Forms</h1></div>
        <p className="u-muted u-pad-32">Loading forms...</p>
      </div>
    )
  }

  return (
    <div>
      {/* Page title and the number of forms */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Legal Forms</h1>
          <p className="page-subtitle">
            {forms.length} official court forms — open, download or auto-fill from your cases
          </p>
        </div>
      </div>

      {/* Error banner when the forms could not be loaded */}
      <ErrorMessage message={error} />

      {/* Message when there are no forms */}
      {forms.length === 0 && (
        <div className="u-empty-state">
          No legal forms found in the database.
        </div>
      )}

      {/* Grid with one card per form */}
      <div className="form-template-grid">
        {forms.map(form => {
          // Auto fill is offered only for fillable forms that have fields
          const canAutoFill = form.fillable && getFormFields(form).length > 0
          const busyOpen = opening === form.id
          return (
            <div key={form.id} className="form-template-card">
              <div className="form-template-card__header">
                <h3 className="form-template-card__title">{form.name}</h3>
              </div>

              {form.description?.trim() && (
                <p className="form-template-card__desc">{form.description.trim()}</p>
              )}

              {/* Auto fill button plus Open, Download and Print buttons */}
              <div className="form-template-card__actions">
                {canAutoFill && (
                  <button type="button" className="btn-gold" onClick={() => openFill(form)}>
                    <Icon name="sign" /> Auto fill
                  </button>
                )}

                <div className="form-template-card__row">
                  <button type="button" className="btn-outline" disabled={busyOpen} onClick={() => handleOpen(form)}>
                    {busyOpen ? 'Opening…' : 'Open'}
                  </button>
                  <button type="button" className="btn-outline" disabled={downloading === form.id} onClick={() => handleDownload(form)}>
                    {downloading === form.id ? 'Saving…' : 'Download'}
                  </button>
                  <button type="button" className="btn-outline" disabled={printing === form.id} onClick={() => handlePrint(form)}>
                    {printing === form.id ? 'Printing…' : 'Print'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Auto-fill window shown over the page */}
      {fillForm && (
        <ModalPortal>
          <div className="overlay" {...overlayHandlers}>
            <FormFillWindow key={fillForm.id} form={fillForm} onClose={closeFill} />
          </div>
        </ModalPortal>
      )}
    </div>
  )
}
