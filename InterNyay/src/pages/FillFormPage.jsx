import { useEffect, useState } from 'react'
import { legalForms as legalFormsApi } from '../services/api'
import FormFillWindow from '../components/common/FormFillWindow'
import { getErrorMessage } from '../utils/errorMessages'

// Standalone page that opens one legal form (by formId) for filling, optionally linked to a case
export default function FillFormPage({ formId, caseId }) {
  // Form found for the id and any error message
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')

  // Fetch the forms list and pick the one matching formId
  useEffect(() => {
    // Flag that stops state updates after the page is closed or formId changes
    let alive = true
    legalFormsApi.list()
      .then(list => {
        if (!alive) return
        const found = (Array.isArray(list) ? list : []).find(f => String(f.id) === String(formId))
        if (found) setForm(found)
        else setError('This form could not be found.')
      })
      .catch(e => { if (alive) setError(getErrorMessage(e, 'Unable to load the form.')) })
    return () => { alive = false }
  }, [formId])

  return (
    // Error message, loading message, or the form window once the form is loaded
    <div className="legal-fill-page">
      {error && <p className="text-error u-pad-32" >{error}</p>}
      {!error && !form && <p className="u-muted u-pad-32">Loading form…</p>}
      {form && <FormFillWindow form={form} initialCaseId={caseId} standalone />}
    </div>
  )
}
