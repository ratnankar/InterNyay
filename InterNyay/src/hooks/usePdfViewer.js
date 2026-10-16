import { useCallback, useEffect, useState } from 'react'

// Opens a PDF in the viewer modal; loadUrl() is a function that returns a blob URL for the file
export default function usePdfViewer() {
  // Currently open PDF ({ url, title }) or null
  const [viewer, setViewer] = useState(null)
  const [loading, setLoading] = useState(false)

  // Release the blob URL from memory when the viewer closes or changes
  useEffect(() => {
    return () => {
      if (viewer) URL.revokeObjectURL(viewer.url)
    }
  }, [viewer])

  // Load the PDF (shows loading state meanwhile) and open it in the viewer
  const open = useCallback(async (loadUrl, title) => {
    setLoading(true)
    try {
      const url = await loadUrl()
      setViewer({ url, title })
    } finally {
      setLoading(false)
    }
  }, [])

  // Close the viewer
  const close = useCallback(() => setViewer(null), [])

  return { viewer, loading, open, close }
}
