import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import { PDF_SECTIONS } from '../../constants/pdfSections'
import usePdfViewer from '../../hooks/usePdfViewer'
import PdfViewerModal from './PdfViewerModal'
import { formatIsoDate } from '../../utils/rosterUtils'

import Icon from './Icon'
import { getErrorMessage } from '../../utils/errorMessages'
// Bar with the PDF uploaded for a district, if there is one
export default function DistrictPdfBar({ section, district }) {
  const { addToast } = useApp()
  // Label and API value for this PDF section
  const meta = PDF_SECTIONS[section]

  // District PDFs keyed by district name
  const [pdfs, setPdfs] = useState({})
  // Hook that handles fetching and showing the PDF in a modal
  const viewer = usePdfViewer()

  // Load the available PDFs for this section; "alive" stops a late response from updating an unmounted component
  useEffect(() => {
    let alive = true
    api.districtPdfs.list(meta.value)
      .then(rows => {
        if (!alive) return
        const map = {}
        ;(Array.isArray(rows) ? rows : []).forEach(r => { map[r.district] = r })
        setPdfs(map)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [meta])

  // PDF for the selected district; render nothing if there isn't one
  const pdf = pdfs[district]
  if (!pdf) return null

  // Open the district's PDF in the viewer, toast on failure
  const open = async () => {
    try {
      await viewer.open(() => api.districtPdfs.fileUrl(meta.value, district), `${meta.label} — ${district}`)
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not open the PDF'), 'error')
    }
  }

  return (
    <>
      <div className="qa-pdf-bar">
        <span className="qa-pdf-bar__label">
          <Icon name="pdf" /> {district} — {meta.label} PDF
          {pdf.updatedAt && <span className="qa-pdf-bar__meta">updated {formatIsoDate(pdf.updatedAt)}</span>}
        </span>
        <button type="button" className="btn-outline btn-outline--sm" onClick={open}>View</button>
      </div>
      <PdfViewerModal viewer={viewer.viewer} onClose={viewer.close} />
    </>
  )
}
