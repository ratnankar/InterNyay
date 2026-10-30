import { useRef } from 'react'
import Icon from './Icon'
import {
  CONTACT_ATTACH_ACCEPT,
  CONTACT_ATTACH_EXT,
  CONTACT_ATTACH_MAX,
  CONTACT_ATTACH_MAX_BYTES,
  attachmentKind,
  formatFileSize,
} from '../../constants/contact'

// "Attach photos, videos or a PDF" control: a button that opens the file chooser and the list of chosen files,
// each with a remove button. files is the list of File objects, onChange gets the new list, onProblem gets a message
// when a file is refused (wrong type, too big, too many)
export default function AttachmentPicker({ files, onChange, onProblem, disabled = false }) {
  const input = useRef(null)

  // Adds the chosen files that are allowed and reports the ones that are not
  function add(e) {
    const picked = Array.from(e.target.files || [])
    e.target.value = ''   // choosing the same file again must work
    if (picked.length === 0) return

    const next = [...files]
    const problems = []
    for (const f of picked) {
      const ext = f.name.split('.').pop().toLowerCase()
      if (!CONTACT_ATTACH_EXT.includes(ext)) problems.push(`"${f.name}" is not a photo, video or PDF`)
      else if (f.size > CONTACT_ATTACH_MAX_BYTES) problems.push(`"${f.name}" is larger than ${formatFileSize(CONTACT_ATTACH_MAX_BYTES)}`)
      else if (f.size === 0) problems.push(`"${f.name}" is empty`)
      else if (next.some(x => x.name === f.name && x.size === f.size)) continue
      else if (next.length >= CONTACT_ATTACH_MAX) { problems.push(`You can attach up to ${CONTACT_ATTACH_MAX} files`); break }
      else next.push(f)
    }
    if (next.length !== files.length) onChange(next)
    if (problems.length) onProblem?.(problems[0])
  }

  return (
    <div className="attach-picker">
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={CONTACT_ATTACH_ACCEPT}
        onChange={add}
      />

      <button
        type="button"
        className="btn-outline btn-outline--sm"
        disabled={disabled || files.length >= CONTACT_ATTACH_MAX}
        onClick={() => input.current?.click()}
      >
        <Icon name="image" /> Attach photos, videos or PDF
      </button>
      <span className="attach-picker__hint">
        Up to {CONTACT_ATTACH_MAX} files, {formatFileSize(CONTACT_ATTACH_MAX_BYTES)} each (optional)
      </span>

      {files.length > 0 && (
        <ul className="attach-list">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}-${i}`} className="attach-chip">
              <Icon name={{ image: 'image', video: 'film', pdf: 'pdf' }[attachmentKind(f.name, f.type)]} />
              <span className="attach-chip__name" title={f.name}>{f.name}</span>
              <span className="attach-chip__size">{formatFileSize(f.size)}</span>
              <button
                type="button"
                className="btn-icon attach-chip__remove"
                aria-label={`Remove ${f.name}`}
                title="Remove"
                disabled={disabled}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
              >
                <Icon name="close" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
