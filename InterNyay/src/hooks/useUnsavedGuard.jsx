import { useState } from 'react'
import UnsavedChangesDialog from '../components/common/UnsavedChangesDialog'

// Close handling for a form: with nothing typed it just closes; with unsaved data the cross asks to
// save or discard. Render `dialog` next to the modal. A click outside the window does nothing.
//   dirty     true when the form differs from how it was opened
//   onSave    saves the form (it validates and closes the form itself when it works)
//   onDiscard closes the form and throws the data away
export default function useUnsavedGuard({ dirty, onSave, onDiscard }) {
  const [asking, setAsking] = useState(false)

  // The cross: ask first when there is something to lose
  function requestClose() {
    if (dirty) setAsking(true)
    else onDiscard()
  }

  const dialog = asking ? (
    <UnsavedChangesDialog
      onKeep={() => setAsking(false)}
      onDiscard={() => { setAsking(false); onDiscard() }}
      onSave={async () => { setAsking(false); await onSave() }}
    />
  ) : null

  return { requestClose, dialog, overlayHandlers: {} }
}
