import { useApp } from '../../context/AppContext'

import PdfViewerModal from './PdfViewerModal'
// Popup that previews an uploaded document, in the app's PDF viewer
export default function DocPreviewModal() {
  // Preview state comes from AppContext; null means the modal is closed
  const { docPreview, closeDocPreview } = useApp()

  return <PdfViewerModal viewer={docPreview} onClose={closeDocPreview} stacked fileName={docPreview?.title} />
}
