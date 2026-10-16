import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import { useCourts, isOwnDistrict } from '../../constants/courts'
import { PDF_SECTIONS } from '../../constants/pdfSections'
import usePdfViewer from '../../hooks/usePdfViewer'
import PdfViewerModal from '../common/PdfViewerModal'
import { formatIsoDate } from '../../utils/rosterUtils'

import Icon from '../common/Icon'
import { getErrorMessage } from '../../utils/errorMessages'
import { confirmDialog } from '../../utils/confirmDialog'
// Turns a file size in bytes into a KB or MB label
const sizeLabel = bytes => {
  if (!bytes) return ''
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

// Upload, view and delete one PDF per district for a given section
export default function DistrictPdfManager({ section }) {
  const { courtNames, districtNames, hierarchy } = useCourts()
  const { addToast } = useApp()
  // Label and value for this section, from PDF_SECTIONS
  const meta = PDF_SECTIONS[section]

  // Uploaded PDFs keyed by district
  const [pdfs, setPdfs] = useState({})
  // District that currently has an upload or delete running
  const [busy, setBusy] = useState('')
  // Refs to the hidden file inputs, one per district
  const fileInputs = useRef({})
  const viewer = usePdfViewer()

  // Fetches the uploaded PDFs for this section and keys them by district
  const load = useCallback(async () => {
    try {
      const res = await api.districtPdfs.list(meta.value)
      const map = {}
      ;(Array.isArray(res) ? res : []).forEach(p => { map[p.district] = p })
      setPdfs(map)
    } catch (e) {
      addToast(getErrorMessage(e, `Could not load the ${meta.label} PDFs`), 'error')
    }
  }, [addToast, meta])

  useEffect(() => { load() }, [load])

  // Uploads a PDF for a district, then reloads the list
  async function upload(district, file) {
    if (!file) return
    setBusy(district)
    try {
      await api.districtPdfs.upload(meta.value, district, file)
      addToast(`${district} — ${meta.label} PDF saved`)
      await load()
    } catch (e) {
      addToast(getErrorMessage(e, 'Upload failed'), 'error')
    } finally {
      setBusy('')
      if (fileInputs.current[district]) fileInputs.current[district].value = ''
    }
  }

  // Deletes a district's PDF after confirmation
  async function remove(district) {
    if (!await confirmDialog(`Remove the ${meta.label} PDF for ${district}?`)) return
    setBusy(district)
    try {
      await api.districtPdfs.remove(meta.value, district)
      addToast('PDF removed')
      await load()
    } catch (e) {
      addToast(getErrorMessage(e, 'Delete failed'), 'error')
    } finally {
      setBusy('')
    }
  }

  // Opens a district's PDF in the viewer
  async function view(district) {
    try {
      await viewer.open(() => api.districtPdfs.fileUrl(meta.value, district), `${meta.label} — ${district}`)
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not open the PDF'), 'error')
    }
  }

  // Number of districts that already have a PDF
  const uploaded = Object.keys(pdfs).length

  return (
    // Collapsible panel with the uploaded count in its header
    <details className="district-pdfs">
      <summary className="district-pdfs__summary">
        <Icon name="pdf" /> {meta.label} PDFs — one for each district
        <span className="district-pdfs__count">{uploaded} of {districtNames.length} uploaded</span>
      </summary>
      <p className="district-pdfs__hint">
        Every district has its own {meta.label} PDF. It appears at the top of that district’s page for everyone.
        Uploading again replaces it.
      </p>

      <div className="district-pdfs__rows">
        {/* Rows grouped by court, with a PDF slot per district */}
        {courtNames.map(court => (
          <div key={court}>
            <div className="district-pdfs__court">{court}</div>

            {hierarchy[court].map(district => {
              const p = pdfs[district]
              const disabled = busy === district
              return (
                <div className="district-pdfs__row" key={district}>
                  <span className="district-pdfs__name">
                    {isOwnDistrict(court, district) ? 'No district' : district}
                  </span>
                  <span className="district-pdfs__file">
                    {p
                      ? `${p.fileName || 'PDF'}${p.sizeBytes ? ` · ${sizeLabel(p.sizeBytes)}` : ''}${p.updatedAt ? ` · ${formatIsoDate(p.updatedAt)}` : ''}`
                      : 'No PDF uploaded'}
                  </span>

                  <div className="district-pdfs__actions">
                    {p && <button type="button" className="btn-outline btn-outline--sm" onClick={() => view(district)}>View</button>}

                    <label className={`btn-outline btn-outline--sm ${disabled ? 'u-wait' : 'u-pointer'}`}>
                      {disabled ? 'Working…' : p ? 'Replace' : 'Upload'}
                      <input
                        ref={el => { fileInputs.current[district] = el }}
                        type="file"
                        accept="application/pdf"
                        hidden
                        disabled={disabled}
                        onChange={e => upload(district, e.target.files?.[0])}
                      />
                    </label>

                    {p && (
                      <button
                        type="button"
                        className="btn-outline btn-outline--sm btn-outline--danger"
                        disabled={disabled}
                        onClick={() => remove(district)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Viewer shown when a PDF is opened */}
      <PdfViewerModal viewer={viewer.viewer} onClose={viewer.close} />
    </details>
  )
}
