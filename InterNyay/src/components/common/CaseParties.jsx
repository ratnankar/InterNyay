import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { partySides, SIDE_ACCUSED, SIDE_COMPLAINANT } from '../../constants/caseCatalog'
import { caseClientEntries } from '../../utils/caseClients'
import { nonClientsOf, opponentsOf, partySubText } from '../../utils/caseParties'

import Icon from './Icon'

const sideLabel = (side, nature) => partySides(nature).find(s => s.value === side)?.label || ''

function countText(clientCount, nonClientCount, opponentCount, ours) {
  if (!ours) return `${opponentCount} ${opponentCount === 1 ? 'party' : 'parties'}`
  const parts = []
  if (clientCount) parts.push(`${clientCount} ${clientCount === 1 ? 'client' : 'clients'}`)
  if (nonClientCount) parts.push(`${nonClientCount} non-${nonClientCount === 1 ? 'client' : 'clients'}`)
  return parts.join(' · ')
}

function PartySection({ label, summary, open, onToggle, children }) {
  return (
    <div className={`exp-card${open ? ' exp-card--open' : ''}`}>
      <button type="button" className="exp-card__head" onClick={onToggle} aria-expanded={open}>
        <div className="exp-card__avatar"><Icon name="user" /></div>
        <div className="exp-card__titles">
          <p className="exp-card__primary">{label}</p>
          <p className="exp-card__secondary">{summary}</p>
        </div>
        <span className="exp-card__arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="exp-card__body">{children}</div>}
    </div>
  )
}

export default function CaseParties({ caseItem: c, clients = [] }) {
  const { startMarkAsClient } = useApp()
  const [openSide, setOpenSide] = useState({ ours: false, theirs: false })

  const ourSide = c.clientSide === SIDE_ACCUSED ? SIDE_ACCUSED : SIDE_COMPLAINANT
  const theirSide = ourSide === SIDE_ACCUSED ? SIDE_COMPLAINANT : SIDE_ACCUSED

  const clientEntries = caseClientEntries(c, clients)
  const nonClients = nonClientsOf(c)
  const opponentList = opponentsOf(c)
  const opponents = opponentList.length > 0
    ? opponentList
    : (c.opposingParty ? [{ name: c.opposingParty }] : [])

  const toggle = key => e => {
    e.stopPropagation()
    setOpenSide(prev => ({ ...prev, [key]: !prev[key] }))
  }

  if (clientEntries.length === 0 && nonClients.length === 0 && opponents.length === 0) return null

  return (
    <div className="case-parties">
      {(clientEntries.length > 0 || nonClients.length > 0) && (
        <PartySection
          label={sideLabel(ourSide, c.caseNature)}
          summary={countText(clientEntries.length, nonClients.length, 0, true)}
          open={openSide.ours}
          onToggle={toggle('ours')}
        >
          <div className="client-selected-list">
            {clientEntries.map(entry => (
              <div key={`client-${entry.id}`} className="client-selected case-parties__row case-parties__row--client">
                <div className="client-selected__avatar"><Icon name="user" /></div>
                <div className="client-selected__info">
                  <p className="client-selected__name">
                    {entry.name}
                    <span className="client-selected__tag">Client</span>
                    {entry.subType && <span className="client-selected__tag client-selected__tag--muted">{entry.subType}</span>}
                  </p>
                  {entry.phone && <p className="client-selected__email">{entry.phone}</p>}
                </div>
              </div>
            ))}

            {nonClients.map(n => (
              <div key={n.id ?? n.name} className="client-selected case-parties__row case-parties__row--nonclient">
                <div className="client-selected__avatar"><Icon name="user" /></div>
                <div className="client-selected__info">
                  <p className="client-selected__name">
                    {n.name}
                    <span className="client-selected__tag client-selected__tag--muted">Non-client</span>
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
        </PartySection>
      )}

      {opponents.length > 0 && (
        <PartySection
          label={sideLabel(theirSide, c.caseNature)}
          summary={countText(0, 0, opponents.length, false)}
          open={openSide.theirs}
          onToggle={toggle('theirs')}
        >
          <div className="client-selected-list">
            {opponents.map((o, i) => (
              <div key={o.id ?? `${o.name}-${i}`} className="client-selected case-parties__row case-parties__row--opponent">
                <div className="client-selected__avatar"><Icon name="user" /></div>
                <div className="client-selected__info">
                  <p className="client-selected__name">{o.name}</p>
                  {partySubText(o) && <p className="client-selected__email">{partySubText(o)}</p>}
                  {o.address && <p className="client-selected__email">{o.address}</p>}
                </div>
              </div>
            ))}
          </div>
        </PartySection>
      )}
    </div>
  )
}
