import ModalPortal from './ModalPortal'
// Asks what to do with typed-in data when a form is closed with the cross
export default function UnsavedChangesDialog({ onSave, onDiscard, onKeep }) {
  return (
    <ModalPortal>
      <div className="overlay overlay--stacked" onClick={e => e.stopPropagation()}>
        <div className="modal modal--sm" role="alertdialog" aria-labelledby="unsaved-title" onClick={e => e.stopPropagation()}>
          <div className="modal__header">
            <h2 className="modal__title" id="unsaved-title">Save your changes?</h2>
          </div>
          <p className="confirm-dialog__message">
            You have details that are not saved yet. Save them, discard them, or cancel to keep editing.
          </p>
          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={onKeep}>Cancel</button>
            <button type="button" className="btn-outline" onClick={onDiscard}>Discard</button>
            <button type="button" className="btn-gold" onClick={onSave}>Save</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
