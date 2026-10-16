import { useEffect, useState } from 'react'
import api from '../../services/api'
import useOverlayClose from '../../hooks/useOverlayClose'

import Icon from '../common/Icon'
import { getErrorMessage } from '../../utils/errorMessages'
import ModalPortal from '../../components/common/ModalPortal'
// Popup listing the file numbers already used, so the advocate can pick one
export default function FileNumbersModal({ onClose, onPick, selected }) {
  // Released file numbers fetched from the API, with loading and error state
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Closes the modal when the backdrop is clicked
  const overlayHandlers = useOverlayClose(onClose)

  // Load the file numbers once; "alive" avoids updating state after the modal closes
  useEffect(() => {
    let alive = true

    api.cases.fileNumbers()
      .then(res => { if (alive) setData(res) })
      .catch(e => { if (alive) setError(getErrorMessage(e, 'Could not load the file numbers')) })
      .finally(() => { if (alive) setLoading(false) })

    return () => { alive = false }
  }, [])

  // File numbers that were freed up and can be reused
  const released = data?.released || []

  return (
    <ModalPortal>
      <div className="overlay overlay--stacked" {...overlayHandlers}>
        <div className="modal modal--md file-numbers" onClick={e => e.stopPropagation()}>

          <div className="modal__header">
            <h2 className="modal__title">File Numbers</h2>
            <button aria-label="Close" title="Close" type="button" className="btn-icon" onClick={onClose}><Icon name="close" /></button>
          </div>

          {loading && <p className="file-numbers__note">Loading…</p>}
          {error && <p className="file-numbers__note file-numbers__note--error">{error}</p>}

          {data && (
            <>
              <div className="file-numbers__stats">
                <div className="file-numbers__stat">
                  <span className="file-numbers__stat-label">Next automatic number</span>
                  <span className="file-numbers__stat-value">{data.nextNumber}</span>
                  {onPick && (
                    <button
                      type="button"
                      className="btn-outline btn-outline--sm"
                      disabled={selected === data.nextNumber}
                      onClick={() => onPick(data.nextNumber)}
                    >
                      {selected === data.nextNumber ? 'Selected' : 'Use this'}
                    </button>
                  )}
                </div>

                <div className="file-numbers__stat">
                  <span className="file-numbers__stat-label">Highest number in use</span>
                  <span className="file-numbers__stat-value">{data.maxOccupied || '—'}</span>
                  <span className="file-numbers__stat-sub">
                    {data.occupiedCount} open {data.occupiedCount === 1 ? 'case holds' : 'cases hold'} a number
                  </span>
                </div>
              </div>

              <p className="file-numbers__title">
                Released numbers{released.length ? ` (${released.length})` : ''}
              </p>
              <p className="file-numbers__note">
                A number is released when its case is decided, withdrawn or deleted, and can be used again.
              </p>

              {released.length === 0 ? (
                <p className="file-numbers__empty">No released numbers yet.</p>
              ) : (
                <div className="file-numbers__list">
                  {released.map(r => (
                    <div key={r.number} className="file-numbers__row">
                      <span className="file-numbers__num">{r.number}</span>

                      <div className="file-numbers__info">
                        {r.caseTitle
                          ? <>
                              <p className="file-numbers__case">{r.caseTitle}</p>
                              {r.caseNo && <p className="file-numbers__meta">{r.caseNo} · decided</p>}
                            </>
                          : <p className="file-numbers__meta">Case deleted</p>}
                      </div>

                      {onPick && (
                        <button
                          type="button"
                          className="btn-outline btn-outline--sm"
                          disabled={selected === r.number}
                          onClick={() => onPick(r.number)}
                        >
                          {selected === r.number ? 'Selected' : 'Use'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
