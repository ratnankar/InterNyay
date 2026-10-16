import Icon from './Icon'

// Shown in an upload popup once a file is chosen: the real name of the chosen file, and the name the document will be
// saved with (the file name to start with, the advocate can change it). The file itself keeps its original name
export default function UploadNameField({ fileName, name, onChange, label = 'Document name' }) {
  if (!fileName) return null

  return (
    <>
      <div className="upload-filename"><Icon name="file" /> Selected file: <strong>{fileName}</strong></div>

      <div className="form-group u-mt-12">
        <label className="form-label">{label} *</label>
        <input
          className="form-input"
          value={name}
          maxLength={255}
          placeholder="Name shown in your list"
          onChange={e => onChange(e.target.value)}
        />
        <p className="admin__hint">You can change this name now, or later with the pencil beside the document name.</p>
      </div>
    </>
  )
}
