import { useApp } from '../../context/AppContext'
import { nonClientsOf, partySubText } from '../../utils/caseParties'

import Icon from './Icon'

// People on our side of a saved case who are not saved as clients. Each can be marked as a client:
// the Register Client form opens with their details filled in, and once saved they become a client of this case
export default function CaseNonClients({ caseItem: c }) {
  const { startMarkAsClient } = useApp()

  const nonClients = nonClientsOf(c)
  if (nonClients.length === 0) return null

  return (
    <div className="case-nonclients">
      <p className="case-fields__section-title">Not saved as clients</p>

      <div className="client-selected-list">
        {nonClients.map(n => (
          <div key={n.id} className="client-selected client-selected--nonclient">
            <div className="client-selected__avatar">
              <Icon name="user" />
            </div>
            <div className="client-selected__info">
              <p className="client-selected__name">
                {n.name}
                {n.subType && <span className="client-selected__tag client-selected__tag--muted">{n.subType}</span>}
              </p>
              <p className="client-selected__email">{partySubText(n) || 'No other details'}</p>
            </div>
            <button
              type="button"
              className="btn-outline"
              onClick={e => { e.stopPropagation(); startMarkAsClient(n, c.id) }}
            >
              Mark as client
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
