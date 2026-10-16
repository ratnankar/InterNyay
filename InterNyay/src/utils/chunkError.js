// A page file (chunk) that could not be downloaded. This happens right after a new version is published (the old file names are gone
// while the browser still holds the old index.html) and on a weak or dropped connection. Reloading fixes it.
const CHUNK_ERROR = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError|Loading chunk .* failed|Loading CSS chunk .* failed/i

export function isChunkError(error) {
  const text = typeof error === 'string' ? error : `${error?.name || ''} ${error?.message || ''}`
  return CHUNK_ERROR.test(text)
}

const KEY = 'internyay_chunk_reload'
const WINDOW_MS = 15000

// Reloads the page once to pick up the new version. Returns false when it already did so a moment ago,
// so a file that is really missing shows the error screen instead of reloading again and again
export function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (Date.now() - last < WINDOW_MS) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch { /* storage unavailable: reload anyway, the page cannot loop without the flag only if the file is really missing */ }
  window.location.reload()
  return true
}
