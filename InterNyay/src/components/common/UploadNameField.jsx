import Icon from './Icon'

// Shown in an upload popup once a file is chosen: the name of the chosen file. The document is saved with the file's name
// (the name is set when the file is picked); it can be changed afterwards with the pencil beside the document name
export default function UploadNameField({ fileName }) {
  if (!fileName) return null

  return (
    <div className="upload-filename"><Icon name="file" /> Selected file: <strong>{fileName}</strong></div>
  )
}
