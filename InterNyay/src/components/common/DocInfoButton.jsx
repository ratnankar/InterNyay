import { useApp } from '../../context/AppContext'
import { isOrderDocument } from '../../utils/documentUtils'
import Icon from './Icon'

// Small pencil at the side of a document's name: opens the rename popup (it also shows the original file name, type, size
// and date). Orders are left out: their title is built from the hearing date
export default function DocInfoButton({ doc }) {
  const { setRenameDocTarget } = useApp()
  if (!doc || isOrderDocument(doc)) return null

  return (
    <button
      type="button"
      className="doc-rename-btn"
      title="Rename"
      aria-label="Rename document"
      onClick={e => { e.stopPropagation(); setRenameDocTarget({ ...doc, _edit: true }) }}
    >
      <Icon name="edit" />
    </button>
  )
}
