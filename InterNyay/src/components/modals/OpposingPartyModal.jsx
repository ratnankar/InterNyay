import { useState } from 'react'
import { createPortal } from 'react-dom'
import useOverlayClose from '../../hooks/useOverlayClose'
import { indianPhoneError } from '../../utils/validators'
import Req from '../common/Req'

import Icon from '../common/Icon'
// Popup to add or edit the opposing party's details
export default function OpposingPartyModal({ partyLabel, initial, onSave, onClose }) {
  // Form values, started from the existing party when editing
  const [values, setValues] = useState({
    name:       initial?.name       || '',
    fatherName: initial?.fatherName || '',
    address:    initial?.address    || '',
    phone:      initial?.phone      || '',
  })
  // Validation message shown in the form
  const [error, setError] = useState('')

  // Closes the modal when the backdrop is clicked
  const overlayHandlers = useOverlayClose(onClose, { backdrop: false })

  // Returns an input handler for one field and clears the error
  const set = key => e => {
    setValues(v => ({ ...v, [key]: e.target.value }))
    setError('')
  }

  // Name is required and the phone must be a valid Indian number; trim everything before handing it back
  function save() {
    if (!values.name.trim()) {
      setError(`Enter the name of the ${partyLabel}`)
      return
    }

    const phoneProblem = indianPhoneError(values.phone, { label: 'phone number' })
    if (phoneProblem) {
      setError(phoneProblem)
      return
    }

    onSave({
      name:       values.name.trim(),
      fatherName: values.fatherName.trim(),
      address:    values.address.trim(),
      phone:      values.phone.trim(),
    })
  }

  // Rendered on document.body so it sits above the Add Case popup instead of inside its scrolling box
  return createPortal(
    <div className="overlay overlay--stacked" {...overlayHandlers}>
      <div className="modal modal--md" onClick={e => e.stopPropagation()}>

        <div className="modal__header">
          <div>
            <h2 className="modal__title">Opposite Party Details</h2>
            <p className="opposing-modal__sub">{partyLabel}</p>
          </div>
          <button aria-label="Close" title="Close" type="button" className="btn-icon" onClick={onClose}><Icon name="close" /></button>
        </div>

        <div className="client-form">
          <div>
            <label className="form-label">Name<Req /></label>
            <input
              className="form-input"
              placeholder="Full name"
              maxLength={200}
              autoComplete="off"
              autoFocus
              value={values.name}
              onChange={set('name')}
            />
          </div>

          <div>
            <label className="form-label">Father's Name</label>
            <input
              className="form-input"
              placeholder="Father's full name"
              maxLength={255}
              autoComplete="off"
              value={values.fatherName}
              onChange={set('fatherName')}
            />
          </div>

          <div>
            <label className="form-label">Address</label>
            <textarea
              className="form-input"
              rows={3}
              placeholder="Full address"
              maxLength={500}
              value={values.address}
              onChange={set('address')}
            />
          </div>

          <div>
            <label className="form-label">Phone Number</label>
            <input
              className="form-input"
              type="tel"
              inputMode="tel"
              placeholder="+91 XXXXX XXXXX"
              maxLength={16}
              autoComplete="off"
              value={values.phone}
              onChange={set('phone')}
            />
          </div>

          {error && <p className="opposing-modal__error">{error}</p>}
        </div>

        <div className="form-actions">
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-gold" onClick={save}>Save Details</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
