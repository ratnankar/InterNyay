import { useState } from 'react'
import Icon from './Icon'
import ModalPortal from './ModalPortal'
import PdfViewerModal from './PdfViewerModal'
import useOverlayClose from '../../hooks/useOverlayClose'
import usePdfViewer from '../../hooks/usePdfViewer'
import { attachmentKind, formatFileSize } from '../../constants/contact'
import { getErrorMessage } from '../../utils/errorMessages'
import { useApp } from '../../context/AppContext'

// Video popup for an attached video
function VideoModal({ video, onClose }) {
  const overlayHandlers = useOverlayClose(onClose)
  return (
    <ModalPortal>
      <div className="overlay overlay--stacked" {...overlayHandlers}>
        <div className="modal modal--lg" onClick={e => e.stopPropagation()}>
          <div className="modal__header">
            <h2 className="modal__title" title={video.title}>{video.title}</h2>
            <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={onClose}><Icon name="close" /></button>
          </div>
          <video src={video.url} controls autoPlay playsInline className="attach-video" />
        </div>
      </div>
    </ModalPortal>
  )
}

// Files attached to a message: a chip for each one. Clicking opens a photo or PDF in the app's viewer (PDFs with Print)
// and a video in a player popup. loadBlob(id) returns a blob URL for the file
export default function ContactAttachments({ attachments, loadBlob }) {
  const { addToast } = useApp()
  const pdf = usePdfViewer()
  const [video, setVideo] = useState(null)
  const [busyId, setBusyId] = useState(null)

  if (!attachments || attachments.length === 0) return null

  // Downloads the file and shows it
  async function open(a) {
    if (busyId) return
    setBusyId(a.id)
    try {
      if (attachmentKind(a.fileName, a.mimeType) === 'video') {
        const url = await loadBlob(a.id)
        setVideo({ url, title: a.fileName })
      } else {
        await pdf.open(() => loadBlob(a.id), a.fileName)
      }
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not open the file'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  // Closes the player and frees the file from memory
  function closeVideo() {
    if (video) URL.revokeObjectURL(video.url)
    setVideo(null)
  }

  return (
    <>
      <ul className="attach-list attach-list--sent">
        {attachments.map(a => (
          <li key={a.id}>
            <button type="button" className="attach-chip attach-chip--open" onClick={() => open(a)} disabled={busyId === a.id} title={a.fileName}>
              <Icon name={{ image: 'image', video: 'film', pdf: 'pdf' }[attachmentKind(a.fileName, a.mimeType)]} />
              <span className="attach-chip__name">{a.fileName}</span>
              <span className="attach-chip__size">{formatFileSize(a.sizeBytes)}</span>
            </button>
          </li>
        ))}
      </ul>
      <PdfViewerModal viewer={pdf.viewer} onClose={pdf.close} stacked fileName={pdf.viewer?.title} />
      {video && <VideoModal video={video} onClose={closeVideo} />}
    </>
  )
}
