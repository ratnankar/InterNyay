import { useCallback, useRef, useState } from 'react'
import ImageCropModal from '../components/common/ImageCropModal'
import { assertImageFile } from '../utils/imageUtils'
import { getErrorMessage } from '../utils/errorMessages'

// Reusable hook for picking an image and cropping it in a modal before it is used (profile photo, client photo, etc.)
export default function useImageCrop({ shape = 'circle', title = 'Adjust photo', onError } = {}) {
  // The image file currently being cropped; null when the cropper is closed
  const [file, setFile] = useState(null)
  // Remembers the caller's callback so it can be called after the crop is confirmed
  const onDoneRef = useRef(null)

  // Call this with the chosen file; it validates the file and then opens the cropper
  const pick = useCallback((chosen, onDone) => {
    if (!chosen) return

    try {
      // Reject non-image or oversized files before opening the cropper
      assertImageFile(chosen)
    } catch (e) {
      onError?.(getErrorMessage(e, 'Please choose a different image.'))
      return
    }

    onDoneRef.current = onDone
    setFile(chosen)
  }, [onError])

  // The crop modal element - render this somewhere in the component using the hook
  const cropper = file ? (
    <ImageCropModal
      file={file}
      shape={shape}
      title={title}
      onCancel={() => setFile(null)}
      onDone={dataUrl => {
        setFile(null)
        onDoneRef.current?.(dataUrl)
      }}
    />
  ) : null

  // pick() starts the flow, cropper must be rendered by the caller
  return { pick, cropper }
}
