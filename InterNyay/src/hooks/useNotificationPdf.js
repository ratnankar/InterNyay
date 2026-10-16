import { useEffect, useState } from 'react'
import api from '../services/api'

// Handles previewing the PDF attached to a notification
export default function useNotificationPdf() {
  // PDF currently open in the preview ({ url, title }) or null
  const [preview, setPreview] = useState(null)
  // Message shown if the PDF could not be opened
  const [pdfError, setPdfError] = useState('')

  // Free the blob URL when the preview changes or closes
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview.url) }
  }, [preview])

  // Click handler for "View PDF" - stopPropagation so the parent row isn't also clicked
  const viewPdf = (e, item) => {
    e?.stopPropagation()
    setPdfError('')
    api.notifications
      .preview(item.id)
      .then(url => setPreview({ url, title: item.title }))
      .catch(() => setPdfError('Could not open the PDF.'))
  }

  // Close the preview modal
  const closePreview = () => setPreview(null)

  return { preview, viewPdf, closePreview, pdfError, clearPdfError: () => setPdfError('') }
}
