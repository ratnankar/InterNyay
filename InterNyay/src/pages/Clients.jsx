import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { caseClientIds, caseHasClient } from '../utils/caseClients'
import { caseNatureOf } from '../utils/caseClassification'
import Dropdown from '../components/common/Dropdown'
import ImageViewer from '../components/common/ImageViewer'

import Icon from '../components/common/Icon'
import useSeeMore from '../hooks/useSeeMore'
import useGridColumns from '../hooks/useGridColumns'
import usePersistedState from '../hooks/usePersistedState'
import SeeMore from '../components/common/SeeMore'
import ScrollToTopButton from '../components/common/ScrollToTopButton'
// Sort choices for the clients list as [value, label] pairs
const SORT_OPTIONS = [
  ['name',   'Name A–Z'],
  ['cases',  'Most Cases'],
  ['newest', 'Newest First'],
  ['oldest', 'Oldest First'],
]

// Clients page: searchable, sortable grid of client cards
export default function Clients() {
  const { clients, cases, setShowAddClient, setSelectedClient } = useApp()

  // Client whose photo is open full size (null when closed)
  const [viewClient, setViewClient] = useState(null)

  // Search text and the selected sort order
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = usePersistedState('clients_sort', 'newest', SORT_OPTIONS.map(([v]) => v))

  // Number of cases linked to each client id, used for the 'Most Cases' sort
  const casesByClient = useMemo(() => {
    const map = {}
    cases.forEach(c => {
      caseClientIds(c).forEach(id => {
        map[id] = (map[id] || 0) + 1
      })
    })
    return map
  }, [cases])

  // Clients after applying the search text and sort order
  const displayedClients = useMemo(() => {
    let list = clients

    // Match the search text against name, email, phone numbers and address
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(cl =>
        (cl.name || '').toLowerCase().includes(q) ||
        (cl.email || '').toLowerCase().includes(q) ||
        (cl.whatsappPhone || cl.phone || '').toLowerCase().includes(q) ||
        (cl.additionalPhone || '').toLowerCase().includes(q) ||
        (cl.address || '').toLowerCase().includes(q)
      )
    }

    // Sort a copy so the original clients list is not changed
    return [...list].sort((a, b) => {
      if (sortBy === 'cases') {
        return (casesByClient[b.id] || 0) - (casesByClient[a.id] || 0)
      }
      if (sortBy === 'newest' || sortBy === 'oldest') {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : Number(a.id) || 0
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : Number(b.id) || 0
        return sortBy === 'newest' ? bTime - aTime : aTime - bTime
      }
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [clients, search, sortBy, casesByClient])

  // Show the clients a page at a time; starts again when the search or sort changes
  const clientsStep = 18
  const [clientColumns, clientsGridRef] = useGridColumns()
  const {
    visible: visibleClients,
    remaining: clientsRemaining,
    showMore: showMoreClients,
    step: clientsRowStep,
  } = useSeeMore(displayedClients, `${search}|${sortBy}`, clientsStep, 0, { columns: clientColumns })

  return (
    <div className="clients-page">
      <ScrollToTopButton />
      {/* Full-size view of a client's photo */}
      {viewClient && (
        <ImageViewer
          src={viewClient.profilePicture}
          alt={viewClient.name}
          caption={viewClient.name}
          onClose={() => setViewClient(null)}
        />
      )}
      {/* Page title and the Add Client button */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Clients</h1>
          <p className="page-subtitle">Your clients, their contact details and linked cases</p>
        </div>
        <button type="button" className="btn-gold" onClick={() => setShowAddClient(true)}>+ Add Client</button>
      </div>

      {/* Search box and sort dropdown */}
      <div className="list-toolbar">
        <div className="doc-search-wrap">
          <span className="doc-search-icon"><Icon name="search" /></span>
          <input
            className="form-input doc-search-input"
            placeholder="Search by name, email, phone, or address…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {/* Button to clear the search text */}
          {search && (
            <button type="button" className="doc-search-clear" onClick={() => setSearch('')}><Icon name="close" /></button>
          )}
        </div>

        <div className="sort-control">
          <label htmlFor="clients-sort">Sort:</label>
          <Dropdown
            id="clients-sort"
            searchable={false}
            className="form-input"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
          >
            {SORT_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Dropdown>
        </div>
      </div>

      {/* Grid with one card per client */}
      <div className="clients-grid" ref={clientsGridRef}>
        {visibleClients.map(cl => {
          // Linked cases and best available phone number for this card
          const clCases  = cases.filter(c => caseHasClient(c, cl.id))
          const phone    = cl.whatsappPhone || cl.additionalPhone || cl.phone || ''
          return (
            <div
              key={cl.id}
              className="card client-card u-pointer"
              onClick={() => setSelectedClient(cl)}
              
            >              <div className="client-card__header">
                {/* Avatar (photo or default person avatar) */}
                <div
                  className={`client-card__avatar${cl.profilePicture ? ' client-card__avatar--viewable' : ''}`}
                  {...(cl.profilePicture ? {
                    role: 'button',
                    tabIndex: 0,
                    title: 'View full size',
                    onClick: e => { e.stopPropagation(); setViewClient(cl) },
                    onKeyDown: e => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setViewClient(cl) }
                    },
                  } : {})}
                >
                  {cl.profilePicture ? <img src={cl.profilePicture} alt={cl.name} /> : <Icon name="user" />}
                </div>
                <div>
                  {/* Client name and type badge */}
                  <p className="client-card__name">{cl.name}</p>
                  <span className={`badge badge--${cl.type === 'Corporate' ? 'corporate' : 'individual'}`}>
                    {cl.type}
                  </span>
                </div>
              </div>

              {/* Contact details, only shown if at least one exists */}
              {(cl.email || phone || cl.address) && (
                <div className="client-card__info">
                  {cl.email && <p className="client-card__info-row"><Icon name="mail" /> {cl.email}</p>}
                  {phone && <p className="client-card__info-row"><Icon name="phone" /> {phone}</p>}
                  {cl.address && <p className="client-card__address"><Icon name="pin-map" /> {cl.address}</p>}
                </div>
              )}

              {/* Case nature badges (each nature once, first two) and total case count */}
              <div className="client-card__footer">
                {[...new Set(clCases.map(c => caseNatureOf(c)).filter(Boolean))].slice(0, 2).map(nature => (
                  <span key={nature} className="badge badge--case-type">{nature}</span>
                ))}
                <span className="client-card__case-count">
                  {clCases.length} case{clCases.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          )
        })}

        {/* See more when the list is long */}
        <SeeMore remaining={clientsRemaining} onClick={showMoreClients} step={clientsRowStep} />

        {/* Empty state when there are no clients or nothing matches the search */}
        {displayedClients.length === 0 && (
          <div className="empty-state empty-state--full">
            <div className="empty-state__icon"><Icon name="user" duotone /></div>
            <p className="empty-state__title">
              {clients.length === 0 ? 'No clients yet' : 'No clients match your search'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}