// Largest image we accept before cropping (15 MB)
const MAX_SOURCE_BYTES = 15 * 1024 * 1024

// Throws a readable error if the chosen file isn't an image or is too large
export function assertImageFile(file) {
  if (!file) throw new Error('Please choose a file first.')

  if (!file.type || !file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (JPG, PNG or similar).')
  }

  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('That image is too large. Please choose one under 15 MB.')
  }
}
