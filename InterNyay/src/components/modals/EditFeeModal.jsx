import { useApp } from '../../context/AppContext'
import CaseFeeSection from './CaseFeeSection'
import { useEffect, useRef } from 'react'
import useUnsavedGuard from '../../hooks/useUnsavedGuard'
import { caseHasCorporatePanel } from '../../utils/caseClients'

import Icon from '../common/Icon'
import ModalPortal from '../../components/common/ModalPortal'
// Popup to edit only the fee side of a case
export default function EditFeeModal() {
  // Fee-only editing state and handlers come from AppContext
  const {
    feeOnlyCaseId,
    feeOnlyForm,
    feeOnlyFocusDate,
    feeOnlyReadOnly,
    setFeeOnlyForm,
    closeFeeOnly,
    addFeeOnlyHearingRow,
    updateFeeOnlyHearingRow,
    removeFeeOnlyHearingRow,
    handleSaveFeeOnly,
    cases,
    clients,
  } = useApp()

  // How the fee form looked when it was opened, to know whether anything was changed since
  const feeSignature = JSON.stringify(feeOnlyForm)
  const feeBaseline = useRef(null)
  useEffect(() => { feeBaseline.current = feeOnlyCaseId ? feeSignature : null }, [feeOnlyCaseId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clicking outside never closes the form; the cross asks to save or discard unsaved fee details
  const { requestClose, dialog, overlayHandlers } = useUnsavedGuard({
    dirty: !!feeOnlyCaseId && !feeOnlyReadOnly && feeBaseline.current !== null && feeSignature !== feeBaseline.current,
    onSave: handleSaveFeeOnly,
    onDiscard: closeFeeOnly,
  })

  // Nothing to show when no case is being edited
  if (!feeOnlyCaseId) {
    return null
  }

  // The case whose fees are being edited
  const c = cases.find(item => item.id === feeOnlyCaseId)

  return (
    <>
    <ModalPortal>
      <div className="overlay" {...overlayHandlers}>
        <div className="modal modal--sm" onClick={e => e.stopPropagation()}>

          <div className="modal__header">
            <div>
              <h2 className="modal__title">{feeOnlyReadOnly ? 'View Fee' : 'Fee Details'}</h2>
              {c && (
                <p className="u-note-sm">
                  {c.title}
                  {c.caseNo ? ` • ${c.caseNo}` : ''}
                </p>
              )}
            </div>
            <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={requestClose}><Icon name="close" /></button>
          </div>

          <CaseFeeSection
            form={feeOnlyForm}
            setForm={setFeeOnlyForm}
            addRow={addFeeOnlyHearingRow}
            updateRow={updateFeeOnlyHearingRow}
            removeRow={removeFeeOnlyHearingRow}
            corporatePanel={!!c && caseHasCorporatePanel(c, clients)}
            hasClient
            updateMode
            caseId={feeOnlyCaseId}
            focusDate={feeOnlyFocusDate}
            readOnly={feeOnlyReadOnly}
          />

          <div className="form-actions">
            {feeOnlyReadOnly ? (
              <button type="button" className="btn-outline" onClick={closeFeeOnly}>Close</button>
            ) : (
              <>
                <button type="button" className="btn-outline" onClick={closeFeeOnly}>Cancel</button>
                <button type="button" className="btn-gold" onClick={handleSaveFeeOnly}>Save Fee Details</button>
              </>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
    {dialog}
    </>
  )
}