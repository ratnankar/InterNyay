export default function ChatActionCard({ card, onConfirm, onCancel }) {
  const state = card.state || 'pending'
  const lines = Array.isArray(card.lines) ? card.lines : []

  return (
    <div className={`chat__card chat__card--${state}`} role="group" aria-label={card.title}>
      <p className="chat__card-title">{card.title}</p>
      <ul className="chat__card-lines">
        {lines.map((line, i) => <li key={i}>{line}</li>)}
      </ul>
      {(state === 'pending' || state === 'working') && (
        <div className="chat__card-actions">
          <button type="button" className="btn-gold chat__card-confirm" onClick={onConfirm} disabled={state === 'working'}>
            {state === 'working' ? 'Saving…' : card.confirmLabel || 'Confirm'}
          </button>
          <button type="button" className="chat__card-cancel" onClick={onCancel} disabled={state === 'working'}>
            Cancel
          </button>
        </div>
      )}
      {state === 'done' && <p className="chat__card-result chat__card-result--ok" role="status">{card.result}</p>}
      {state === 'error' && <p className="chat__card-result chat__card-result--bad" role="alert">{card.result}</p>}
      {state === 'cancelled' && <p className="chat__card-result">Cancelled. Nothing was changed.</p>}
    </div>
  )
}
