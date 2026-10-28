import PdfViewerModal from './PdfViewerModal'
// Popup that shows a notification's PDF, in the app's PDF viewer
export default function NotificationPdfModal({ preview, onClose, top = false }) {
  return <PdfViewerModal viewer={preview} onClose={onClose} top={top} fileName={preview ? `${preview.title.slice(0, 40)}.pdf` : undefined} />
}
