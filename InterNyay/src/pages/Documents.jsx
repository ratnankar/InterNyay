import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { caseTypeLabel } from '../utils/caseClassification'
import { documentTitle, documentTypeLabel, isEvidenceDocument, isMiscDocument, evidenceOwnerOf, evidenceTitle } from '../utils/documentUtils'
import MiscDocsSection from '../components/misc/MiscDocsSection'
import Dropdown from '../components/common/Dropdown'

import Icon from '../components/common/Icon'
import DocInfoButton from '../components/common/DocInfoButton'
import useSeeMore from '../hooks/useSeeMore'
import usePersistedState from '../hooks/usePersistedState'
import SeeMore from '../components/common/SeeMore'
import { confirmDialog } from '../utils/confirmDialog'
import ModalPortal from '../components/common/ModalPortal'
import useSessionState from '../hooks/useSessionState'
// File extension to icon name lookup, with a fallback for unknown types
const DOC_ICONS = {
  pdf: 'pdf',
  docx: 'word',
  doc: 'word',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  webp: 'image',
  xlsx: 'sheet',
  xls: 'sheet',
  csv: 'sheet',
  default: 'file'
}

// Pick the icon for a file from its extension
const getIcon = name => {
  if (!name) return DOC_ICONS.default

  const ext = name.includes('.')
    ? name.split('.').pop().toLowerCase()
    : ''

  return DOC_ICONS[ext] || DOC_ICONS.default
}

// Tabs shown at the top of the page, one per document source
const SOURCES = ['Case Documents', 'Client Documents', 'Advocate Documents']

// One evidence file row with open, new tab, download and delete buttons
function EvidenceRow({ doc, onView, onDownload, onDelete }) {
  return (
    <div className="doc-row doc-row--evidence">
      <div className="doc-row__icon"><Icon name="film" /></div>

      <div className="doc-row__body">
        <p className="doc-row__name">{evidenceTitle(doc)}<DocInfoButton doc={doc} /></p>
        <p className="doc-row__meta">
          {doc.size}
          {' • '}
          <span className="u-nowrap">Uploaded {doc.date ? String(doc.date).slice(0, 10) : 'Unknown date'}</span>
        </p>
      </div>

      <div className="doc-row__actions">
        <button type="button" className="btn-outline" onClick={onView} title="Open in this tab"><Icon name="eye" /> Open</button>
        <button type="button" className="btn-outline" onClick={onDownload}><Icon name="download" /> Download</button>
        <button type="button" className="btn-outline btn-outline--danger" onClick={onDelete}><Icon name="trash" /> Delete</button>
      </div>
    </div>
  )
}

// + Upload button that opens a small menu to upload either a document or evidence
function UploadMenuButton({ menuKey, openKey, setOpenKey, onDocument, onEvidence }) {
  const isOpen = openKey === menuKey

  return (
    <div className="upload-menu">
      <button type="button"
        className="btn-outline"
        onClick={() => setOpenKey(isOpen ? null : menuKey)}
      >
        + Upload
      </button>

      {/* Backdrop closes the menu when clicked outside, list holds the two upload options */}
      {isOpen && (
        <>
          <div className="upload-menu__backdrop" onClick={() => setOpenKey(null)} />

          <div className="upload-menu__list">
            <button type="button"
              className="upload-menu__item"
              onClick={() => { setOpenKey(null); onDocument() }}
            >
              <Icon name="file" /> Upload Document
            </button>
            <button type="button"
              className="upload-menu__item"
              onClick={() => { setOpenKey(null); onEvidence() }}
            >
              <Icon name="film" /> Upload Evidence
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// Collapsible Evidence section inside a case or client group
function EvidenceSection({ items, onView, onDownload, onDelete }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div className={`exp-card exp-card--evidence${isOpen ? ' exp-card--open' : ''}`}>
      <button type="button" className="exp-card__head" onClick={() => setIsOpen(open => !open)}>
        <div className="exp-card__avatar"><Icon name="film" /></div>
        <div className="exp-card__titles">
          <p className="exp-card__primary">Evidence</p>
          <p className="exp-card__secondary">
            {items.length} item{items.length !== 1 ? 's' : ''}
          </p>
        </div>
        <span className="exp-card__arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="exp-card__body">
          {items.length === 0 ? (
            <p className="doc-group__evidence-empty">
              <Icon name="inbox" /> No evidence uploaded yet. Click "+ Upload" above and choose Evidence to add a file.
            </p>
          ) : (
            items.map(doc => (
              <EvidenceRow
                key={doc.id}
                doc={doc}
                onView={() => onView(doc)}
                onDownload={() => onDownload(doc)}
                onDelete={() => onDelete(doc)}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// Card for one client: their general documents plus their evidence, collapsible
function ClientDocGroup({
  clientId,
  clientName,
  docs,
  evidenceItems,
  isOpen,
  onToggle,
  openUploadMenu,
  setOpenUploadMenu,
  setUploadDocClientId,
  setEvidenceCategory,
  setEvidenceTargetId,
  setShowUploadEvidence,
  handleViewDocument,
  handleDownloadDocument,
  handleDeleteClientDocument,
  handleDeleteEvidence,
}) {
  return (
    <div className="card doc-group">
      <div
        className="doc-group__header doc-group__header--toggle"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() }
        }}
      >
        {/* Client name and summary line */}
        <div>
          <p className="doc-group__case-name">{clientName}</p>
          <p className="doc-group__meta">
            General-purpose client documents
          </p>
        </div>

        <div className="doc-group__actions">
          <span className="doc-group__file-count">
            {docs.length} file{docs.length !== 1 ? 's' : ''}
          </span>

          {/* Stops the click here from toggling the card while using the upload menu */}
          <span onClick={e => e.stopPropagation()}>
            <UploadMenuButton
              menuKey={`client-${clientId}`}
              openKey={openUploadMenu}
              setOpenKey={setOpenUploadMenu}
              onDocument={() => setUploadDocClientId(Number(clientId))}
              onEvidence={() => {
                setEvidenceCategory('Client')
                setEvidenceTargetId(Number(clientId))
                setShowUploadEvidence(true)
              }}
            />
          </span>

          <span className="doc-group__arrow">{isOpen ? '▲' : '▼'}</span>
        </div>
      </div>

      {isOpen && (
        <>
          {/* One row per client document */}
          {docs.map(doc => (
            <div key={doc.id} className="doc-row">
              <div className="doc-row__icon"><Icon name={getIcon(doc.fileName || doc.name)} /></div>

              <div className="doc-row__body">
                <p className="doc-row__name">{documentTitle(doc)}<DocInfoButton doc={doc} /></p>
                <p className="doc-row__meta">
                  {documentTypeLabel(doc) && `${documentTypeLabel(doc)} • `}
                  {doc.size}
                  {' • '}
                  <span className="u-nowrap">Uploaded {doc.date ? String(doc.date).slice(0, 10) : 'Unknown date'}</span>
                </p>
              </div>

              <div className="doc-row__actions">
                <button type="button"
                  className="btn-outline"
                  onClick={() => handleViewDocument(doc)}
                  title="Open in this tab"
                >
                  <Icon name="eye" /> Open
                </button>
                <button type="button"
                  className="btn-outline"
                  onClick={() => handleDownloadDocument(doc)}
                >
                  <Icon name="download" /> Download
                </button>
                <button
                  className="btn-outline btn-outline--danger"
                  onClick={async () => {
                    if (await confirmDialog(`Delete document "${doc.name}"?`)) {
                      handleDeleteClientDocument(doc.clientId, doc.id)
                    }
                  }}
                >
                  <Icon name="trash" /> Delete
                </button>
              </div>
            </div>
          ))}

          {/* Message when this client has no documents yet */}
          {docs.length === 0 && (
            <p className="doc-group__evidence-empty">
              <Icon name="inbox" /> No documents uploaded yet. Click "+ Upload" above to add one.
            </p>
          )}

          {/* Evidence files uploaded for this client */}
          <EvidenceSection
            items={evidenceItems}
            onView={handleViewDocument}
            onDownload={handleDownloadDocument}
            onDelete={handleDeleteEvidence}
          />
        </>
      )}
    </div>
  )
}

// One case document row with open, new tab, download and delete buttons
function DocRow({ doc, onView, onDownload, onDelete }) {
  return (
    <div className="doc-row">
      <div className="doc-row__icon"><Icon name={getIcon(doc.fileName || doc.name)} /></div>

      <div className="doc-row__body">
        <p className="doc-row__name">{documentTitle(doc)}<DocInfoButton doc={doc} /></p>
        <p className="doc-row__meta">
          {documentTypeLabel(doc) && `${documentTypeLabel(doc)} • `}
          {doc.size}
          {' • '}
          <span className="u-nowrap">Uploaded {doc.date ? String(doc.date).slice(0, 10) : 'Unknown date'}</span>
        </p>
      </div>

      <div className="doc-row__actions">
        <button type="button" className="btn-outline" onClick={onView} title="Open in this tab"><Icon name="eye" /> Open</button>
        <button type="button" className="btn-outline" onClick={onDownload}><Icon name="download" /> Download</button>
        <button type="button" className="btn-outline btn-outline--danger" onClick={onDelete}><Icon name="trash" /> Delete</button>
      </div>
    </div>
  )
}

// Card for one case: its documents plus its evidence, collapsible
function CaseDocGroup({
  caseId,
  group,
  evidenceItems,
  isOpen,
  onToggle,
  openUploadMenu,
  setOpenUploadMenu,
  setUploadDocCaseId,
  setEvidenceCategory,
  setEvidenceTargetId,
  setShowUploadEvidence,
  handleViewDocument,
  handleDownloadDocument,
  handleDeleteDocument,
  handleDeleteEvidence,
}) {
  // The case's own documents and its misc. application documents are listed apart
  const caseDocs = group.docs.filter(d => !isMiscDocument(d))
  const miscDocs = group.docs.filter(isMiscDocument)

  const renderRow = doc => (
    <DocRow
      key={doc.id}
      doc={doc}
      onView={() => handleViewDocument(doc)}
      onDownload={() => handleDownloadDocument(doc)}
      onDelete={async () => {
        if (await confirmDialog(`Delete document "${doc.name}"?`)) {
          handleDeleteDocument(doc.caseId, doc.id)
        }
      }}
    />
  )

  return (
    <div className="card doc-group">
      <div
        className="doc-group__header doc-group__header--toggle"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() }
        }}
      >
        {/* Case title, case number, client and case type tag */}
        <div>
          <p className="doc-group__case-name">{group.caseName}</p>

          <p className="doc-group__meta">
            {group.caseNo}
            {' • '}
            {group.client}

            <span className="doc-group__tag">{group.caseType}</span>

          </p>
        </div>

        <div className="doc-group__actions">
          <span className="doc-group__file-count">
            {group.docs.length} file{group.docs.length !== 1 ? 's' : ''}
          </span>

          {/* Stops the click here from toggling the card while using the upload menu */}
          <span onClick={e => e.stopPropagation()}>
            <UploadMenuButton
              menuKey={`case-${caseId}`}
              openKey={openUploadMenu}
              setOpenKey={setOpenUploadMenu}
              onDocument={() => setUploadDocCaseId(Number(caseId))}
              onEvidence={() => {
                setEvidenceCategory('Case')
                setEvidenceTargetId(Number(caseId))
                setShowUploadEvidence(true)
              }}
            />
          </span>

          <span className="doc-group__arrow">{isOpen ? '▲' : '▼'}</span>
        </div>
      </div>

      {isOpen && (
        <>
          {/* One row per case document, delete asks for confirmation first */}
          {caseDocs.map(renderRow)}

          {/* Message when this case has no documents yet */}
          {group.docs.length === 0 && (
            <p className="doc-group__evidence-empty">
              <Icon name="inbox" /> No documents uploaded yet. Click "+ Upload" above to add one.
            </p>
          )}

          {/* Documents of the case's misc. applications, grouped by application */}
          <MiscDocsSection docs={miscDocs} renderRow={renderRow} nested flush />

          {/* Evidence files uploaded for this case */}
          <EvidenceSection
            items={evidenceItems}
            onView={handleViewDocument}
            onDownload={handleDownloadDocument}
            onDelete={handleDeleteEvidence}
          />
        </>
      )}
    </div>
  )
}

// Documents page: browse case, client and advocate documents and upload new ones or evidence
export default function Documents() {
  const {
    cases = [],
    clients = [],
    advocateDocs = [],
    setUploadDocCaseId,
    setUploadDocClientId,
    setUploadDocAdvocate,
    setShowUploadEvidence,
    setEvidenceCategory,
    setEvidenceTargetId,
    handleDeleteDocument,
    handleDeleteClientDocument,
    handleDeleteAdvocateDoc,
    handleDownloadDocument,
    handleViewDocument,
  } = useApp()

  // Which tab is selected
  const [source, setSource] = useSessionState('documents_source', 'Case Documents')

  // Case documents tab: search text, view mode (by case or flat list) and sort order
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = usePersistedState('documents_sort', 'date', ['date', 'oldest', 'name'])

  // Client documents tab: search text and sort order
  const [clientSearch, setClientSearch] = useState('')
  const [clientSortBy, setClientSortBy] = usePersistedState('client_documents_sort', 'date', ['date', 'oldest', 'name'])

  // Advocate documents tab: search text
  const [advocateSearch, setAdvocateSearch] = useState('')

  // State for the 'find a case or client to upload for' popup
  const [showUploadSearch, setShowUploadSearch] = useState(false)
  const [uploadSearch, setUploadSearch] = useState('')

  // Key of the upload menu that is currently open, if any
  const [openUploadMenu, setOpenUploadMenu] = useState(null)

  // Which case and client cards the user has expanded or collapsed by hand
  const [openCaseCards, setOpenCaseCards] = useSessionState('documents_open_cases', {})
  const [openClientCards, setOpenClientCards] = useSessionState('documents_open_clients', {})

  // A card with no manual choice opens by itself while a search is active
  const caseCardOpen = id => openCaseCards[id] ?? !!searchQuery.trim()
  const clientCardOpen = id => openClientCards[id] ?? !!clientSearch.trim()

  // Open or close a case card
  function toggleCaseCard(caseId) {
    const now = caseCardOpen(caseId)
    setOpenCaseCards(open => ({ ...open, [caseId]: !now }))
  }

  // Open or close a client card
  function toggleClientCard(clientId) {
    const now = clientCardOpen(clientId)
    setOpenClientCards(open => ({ ...open, [clientId]: !now }))
  }

  // Cases and clients matching the upload popup search, limited to 8 each and filtered by the selected tab
  const uploadSearchResults = useMemo(() => {
    const q = uploadSearch.trim().toLowerCase()
    if (!q) return { caseMatches: [], clientMatches: [] }

    const caseMatches = source === 'Client Documents' ? [] : cases
      .filter(c => {
        const client = clients.find(cl => Number(cl.id) === Number(c.clientId))
        return (
          (c.title || '').toLowerCase().includes(q) ||
          (c.caseNo || '').toLowerCase().includes(q) ||
          (c.clientName || client?.name || '').toLowerCase().includes(q)
        )
      })
      .slice(0, 8)

    const clientMatches = source === 'Case Documents' ? [] : clients
      .filter(cl => (cl.name || '').toLowerCase().includes(q))
      .slice(0, 8)

    return { caseMatches, clientMatches }
  }, [uploadSearch, cases, clients, source])

  // Close the upload popup and clear its search
  function closeUploadSearch() {
    setShowUploadSearch(false)
    setUploadSearch('')
  }

  // Open the upload dialog for the chosen case or client
  function quickUploadForCase(caseId) {
    setUploadDocCaseId(caseId)
    setUploadSearch('')
  }

  // Open the upload popup for this client
  function quickUploadForClient(clientId) {
    setUploadDocClientId(clientId)
    setUploadSearch('')
  }

  // Flatten every case's documents (evidence excluded) and attach case, client and file details
  const allDocs = useMemo(() => {
    return cases.flatMap(c => {
      const documents = (Array.isArray(c.documents) ? c.documents : [])
        .filter(d => !isEvidenceDocument(d))

      return documents.map(d => {
        const client =
          clients.find(
            cl => Number(cl.id) === Number(c.clientId)
          )

        const name = d.name || 'Unnamed document'

        return {
          ...d,
          caseId: c.id,
          caseName: c.title || 'Unknown Case',
          caseNo: c.caseNo || '',
          caseType: caseTypeLabel(c),
          clientId: c.clientId,
          client:
            c.clientName ||
            client?.name ||
            'Unknown',
          docType: d.type || '',
          ext: name.includes('.')
            ? name.split('.').pop().toLowerCase()
            : '',
          size: d.size || d.fileSize || 'Unknown',
          date:
            d.date ||
            d.uploadedAt ||
            ''
        }
      })
    })
  }, [cases, clients])

  // Apply the case tab search, then sort by name or newest first
  const filtered = useMemo(() => {
    let docs = allDocs

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()

      docs = docs.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.caseName.toLowerCase().includes(q) ||
        d.client.toLowerCase().includes(q) ||
        (d.caseNo || '').toLowerCase().includes(q)
      )
    }

    return [...docs].sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name)
      }

      if (sortBy === 'oldest') {
        return String(a.date).localeCompare(
          String(b.date)
        )
      }

      return String(b.date).localeCompare(
        String(a.date)
      )
    })
  }, [
    allDocs,
    searchQuery,
    sortBy
  ])

  // Group the filtered documents by case
  const groupedByCase = useMemo(() => {
    const map = {}

    filtered.forEach(doc => {
      if (!map[doc.caseId]) {
        map[doc.caseId] = {
          caseName: doc.caseName,
          caseNo: doc.caseNo || '',
          client: doc.client,
          caseType: doc.caseType,
          docs: []
        }
      }

      map[doc.caseId].docs.push(doc)
    })

    return Object.entries(map)
  }, [filtered])

  // Only the search box counts as a filter here
  const hasFilters = !!searchQuery

  // Reset the search
  function clearFilters() {
    setSearchQuery('')
  }

  // Flatten every client's documents (evidence excluded) and attach client and file details
  const allClientDocs = useMemo(() => {
    return clients.flatMap(cl => {
      const documents = (Array.isArray(cl.documents) ? cl.documents : [])
        .filter(d => !isEvidenceDocument(d))

      return documents.map(d => {
        const name = d.name || 'Unnamed document'

        return {
          ...d,
          clientId: cl.id,
          clientName: cl.name || 'Unknown Client',
          docType: d.type || '',
          ext: name.includes('.')
            ? name.split('.').pop().toLowerCase()
            : '',
          size: d.size || d.fileSize || 'Unknown',
          date: d.date || d.uploadedAt || ''
        }
      })
    })
  }, [clients])

  // Apply the client tab search, then sort by name or newest first
  const filteredClientDocs = useMemo(() => {
    let docs = allClientDocs

    if (clientSearch.trim()) {
      const q = clientSearch.toLowerCase()
      docs = docs.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.clientName.toLowerCase().includes(q)
      )
    }

    return [...docs].sort((a, b) => {
      if (clientSortBy === 'name') {
        return a.name.localeCompare(b.name)
      }

      if (clientSortBy === 'oldest') {
        return String(a.date).localeCompare(String(b.date))
      }

      return String(b.date).localeCompare(String(a.date))
    })
  }, [allClientDocs, clientSearch, clientSortBy])

  // Group the filtered client documents by client
  const groupedByClient = useMemo(() => {
    const map = {}

    filteredClientDocs.forEach(doc => {
      if (!map[doc.clientId]) {
        map[doc.clientId] = {
          clientName: doc.clientName,
          docs: []
        }
      }
      map[doc.clientId].docs.push(doc)
    })

    return Object.entries(map)
  }, [filteredClientDocs])

  // Advocate documents (evidence excluded) with size, extension and date filled in
  const normalizedAdvocateDocs = useMemo(() => {
    return advocateDocs
      .filter(d => !isEvidenceDocument(d))
      .map(d => {
        const name = d.name || 'Unnamed document'
        return {
          ...d,
          ext: name.includes('.') ? name.split('.').pop().toLowerCase() : '',
          size: d.size || d.fileSize || 'Unknown',
          date: d.date || d.uploadedAt || ''
        }
      })
  }, [advocateDocs])

  // Search advocate documents by name or type, newest first
  const filteredAdvocateDocs = useMemo(() => {
    let docs = normalizedAdvocateDocs
    if (advocateSearch.trim()) {
      const q = advocateSearch.trim().toLowerCase()
      docs = docs.filter(d =>
        (d.name || '').toLowerCase().includes(q) ||
        (d.type || '').toLowerCase().includes(q)
      )
    }
    return [...docs].sort((a, b) => String(b.date).localeCompare(String(a.date)))
  }, [normalizedAdvocateDocs, advocateSearch])

  // Collect evidence files from every case and every client into one list
  const allEvidence = useMemo(() => {
    const fromCases = cases.flatMap(c => {
      const client = clients.find(cl => Number(cl.id) === Number(c.clientId))
      return (Array.isArray(c.documents) ? c.documents : [])
        .filter(isEvidenceDocument)
        .map(d => ({
          ...d,
          caseId: c.id,
          caseName: c.title || 'Unknown Case',
          caseNo: c.caseNo || '',
          clientId: c.clientId,
          client: c.clientName || client?.name || 'Unknown',
          size: d.size || d.fileSize || 'Unknown',
          date: d.date || d.uploadedAt || '',
          evidenceOf: evidenceOwnerOf(d),
          ownerLabel: c.title || 'Unknown Case',
        }))
    })

    const fromClients = clients.flatMap(cl =>
      (Array.isArray(cl.documents) ? cl.documents : [])
        .filter(isEvidenceDocument)
        .map(d => ({
          ...d,
          clientId: cl.id,
          clientName: cl.name || 'Unknown Client',
          size: d.size || d.fileSize || 'Unknown',
          date: d.date || d.uploadedAt || '',
          evidenceOf: evidenceOwnerOf(d),
          ownerLabel: cl.name || 'Unknown Client',
        }))
    )

    return [...fromCases, ...fromClients]
  }, [cases, clients])

  // Case evidence grouped by case id, newest first
  const evidenceByCaseId = useMemo(() => {
    const map = {}
    allEvidence
      .filter(d => d.evidenceOf === 'Case' && d.caseId != null)
      .forEach(d => {
        const key = String(d.caseId)
        if (!map[key]) map[key] = []
        map[key].push(d)
      })
    Object.values(map).forEach(list => list.sort((a, b) => String(b.date).localeCompare(String(a.date))))
    return map
  }, [allEvidence])

  // Client evidence grouped by client id, newest first
  const evidenceByClientId = useMemo(() => {
    const map = {}
    allEvidence
      .filter(d => d.evidenceOf === 'Client' && d.clientId != null)
      .forEach(d => {
        const key = String(d.clientId)
        if (!map[key]) map[key] = []
        map[key].push(d)
      })
    Object.values(map).forEach(list => list.sort((a, b) => String(b.date).localeCompare(String(a.date))))
    return map
  }, [allEvidence])

  // Case groups to show, adding cases that have evidence but no documents when no search is active
  const caseGroups = useMemo(() => {
    const groups = [...groupedByCase]
    if (searchQuery.trim()) return groups

    const listed = new Set(groups.map(([id]) => String(id)))
    cases.forEach(c => {
      const key = String(c.id)
      if (listed.has(key) || !evidenceByCaseId[key]?.length) return
      const client = clients.find(cl => Number(cl.id) === Number(c.clientId))
      groups.push([key, {
        caseName: c.title || 'Unknown Case',
        caseNo: c.caseNo || '',
        client: c.clientName || client?.name || 'Unknown',
        caseType: caseTypeLabel(c),
        docs: [],
      }])
    })
    return groups
  }, [groupedByCase, cases, clients, evidenceByCaseId, searchQuery])

  // Client groups to show, adding clients that have evidence but no documents when no search is active
  const clientGroups = useMemo(() => {
    const groups = [...groupedByClient]
    if (clientSearch.trim()) return groups

    const listed = new Set(groups.map(([id]) => String(id)))
    clients.forEach(cl => {
      const key = String(cl.id)
      if (listed.has(key) || !evidenceByClientId[key]?.length) return
      groups.push([key, { clientName: cl.name || 'Unknown Client', docs: [] }])
    })
    return groups
  }, [groupedByClient, clients, evidenceByClientId, clientSearch])

  // Delete an evidence file after confirming, from its case or client
  async function handleDeleteEvidence(doc) {
    if (!await confirmDialog(`Delete evidence "${evidenceTitle(doc)}"?`)) return
    if (doc.caseId) handleDeleteDocument(doc.caseId, doc.id)
    else if (doc.clientId) handleDeleteClientDocument(doc.clientId, doc.id)
  }

  // Show each list a page at a time; each starts again when its search, sort or view changes
  const docGroupsStep = 12
  const docRowsStep = 25
  const {
    visible: visibleCaseGroups,
    remaining: caseGroupsRemaining,
    showMore: showMoreCaseGroups, step: showMoreCaseGroupsStep,
  } = useSeeMore(caseGroups, `${searchQuery}|${sortBy}`, docGroupsStep)
  const {
    visible: visibleClientGroups,
    remaining: clientGroupsRemaining,
    showMore: showMoreClientGroups, step: showMoreClientGroupsStep,
  } = useSeeMore(clientGroups, `${clientSearch}|${clientSortBy}`, docGroupsStep)
  const {
    visible: visibleAdvocateDocs,
    remaining: advocateDocsRemaining,
    showMore: showMoreAdvocateDocs, step: showMoreAdvocateDocsStep,
  } = useSeeMore(filteredAdvocateDocs, advocateSearch, docRowsStep)

  return (
    <div>
      {/* Page title, document count for the selected tab and the upload buttons */}
      <div className="page-header documents__header">
        <div>
          <h1 className="page-title">Documents</h1>

          {/* Count shows 'x of y total' when a search hides some documents */}
          <p className="documents__count">
            {source === 'Case Documents' &&
              `${filtered.length} document${filtered.length !== 1 ? 's' : ''}${
                allDocs.length !== filtered.length ? ` of ${allDocs.length} total` : ''
              }`}
            {source === 'Client Documents' &&
              `${filteredClientDocs.length} document${filteredClientDocs.length !== 1 ? 's' : ''}${
                allClientDocs.length !== filteredClientDocs.length ? ` of ${allClientDocs.length} total` : ''
              }`}
            {source === 'Advocate Documents' &&
              `${filteredAdvocateDocs.length} document${filteredAdvocateDocs.length !== 1 ? 's' : ''}${
                normalizedAdvocateDocs.length !== filteredAdvocateDocs.length ? ` of ${normalizedAdvocateDocs.length} total` : ''
              }`}
          </p>
        </div>

        {/* Upload buttons */}
        <div className="documents__header-actions">
          <button type="button"
            className="btn-gold"
            onClick={() => {
              if (source === 'Advocate Documents') setUploadDocAdvocate(true)
              else setShowUploadSearch(true)
            }}
            title="Upload court documents, agreements, affidavits, etc."
          >
            + Upload Document
          </button>

          {/* Evidence upload is only for case and client documents */}
          {source !== 'Advocate Documents' && (
          <button type="button"
            className="btn-outline btn-gold-secondary"
            onClick={() => {
              if (source === 'Case Documents') setEvidenceCategory('Case')
              else setEvidenceCategory('Client')
              setShowUploadEvidence(true)
            }}
            title="Upload any file as evidence for the selected case or client source"
          >
            + Upload Evidence
          </button>
          )}
        </div>
      </div>

      {/* Popup to search for the case or client the document belongs to */}
      {showUploadSearch && (
        <ModalPortal>
          <div className="overlay" onClick={closeUploadSearch}>
            <div className="modal modal--sm" onClick={e => e.stopPropagation()}>
              <div className="modal__header">
                <h2 className="modal__title">Upload Document</h2>
                <button type="button" aria-label="Close" title="Close" className="btn-icon" onClick={closeUploadSearch}><Icon name="close" /></button>
              </div>

              <p className="fee-hearing-empty u-mb-12">
                Search for the {source === 'Case Documents' ? 'case' : 'client'} you want to upload a document for.
              </p>

              <div className="doc-search-wrap">
                <span className="doc-search-icon"><Icon name="search" /></span>
                <input
                  className="form-input doc-search-input"
                  autoFocus
                  placeholder={`Search a ${source === 'Case Documents' ? 'case' : 'client'}…`}
                  value={uploadSearch}
                  onChange={e => setUploadSearch(e.target.value)}
                />
                {uploadSearch && (
                  <button type="button" className="doc-search-clear" onClick={() => setUploadSearch('')}><Icon name="close" /></button>
                )}
              </div>

              {/* Results: clients first, then cases, clicking one starts the upload */}
              {uploadSearch.trim() && (
                uploadSearchResults.caseMatches.length === 0 && uploadSearchResults.clientMatches.length === 0 ? (
                  <p className="upload-search__empty">
                    No {source === 'Case Documents' ? 'case' : 'client'} matches "{uploadSearch}".
                  </p>
                ) : (
                  <div className="upload-search__results">
                    {uploadSearchResults.clientMatches.map(cl => (
                      <button
                        key={`client-${cl.id}`}
                        className="upload-search__row"
                        onClick={() => {
                          quickUploadForClient(cl.id)
                          setShowUploadSearch(false)
                        }}
                      >
                        <span className="upload-search__icon"><Icon name="user" /></span>
                        <span className="upload-search__body">
                          <span className="upload-search__name">{cl.name}</span>
                          <span className="upload-search__meta">Client</span>
                        </span>
                        <span className="upload-search__action">+ Upload</span>
                      </button>
                    ))}

                    {uploadSearchResults.caseMatches.map(c => {
                      const client = clients.find(cl => Number(cl.id) === Number(c.clientId))
                      return (
                        <button
                          key={`case-${c.id}`}
                          className="upload-search__row"
                          onClick={() => {
                            quickUploadForCase(c.id)
                            setShowUploadSearch(false)
                          }}
                        >
                          <span className="upload-search__icon"><Icon name="folder" /></span>
                          <span className="upload-search__body">
                            <span className="upload-search__name">{c.title}</span>
                            <span className="upload-search__meta">
                              {c.caseNo ? `${c.caseNo} • ` : ''}{c.clientName || client?.name || 'Case'}
                            </span>
                          </span>
                          <span className="upload-search__action">+ Upload</span>
                        </button>
                      )
                    })}
                  </div>
                )
              )}

              <div className="form-actions">
                <button type="button" className="btn-outline" onClick={closeUploadSearch}>Close</button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Tabs to switch between Case, Client and Advocate documents */}
      <div className="case-filters">
        {SOURCES.map(s => (
          <button
            key={s}
            className={`case-filter-btn${source === s ? ' case-filter-btn--active' : ''}`}
            onClick={() => setSource(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Case Documents tab */}
      {source === 'Case Documents' && (
        <>
          {/* Search box, sort dropdown and clear button */}
          <div className="card doc-filter-bar">
            <div className="doc-filter-row">
              <div className="doc-search-wrap">
                <span className="doc-search-icon">
                  <Icon name="search" />
                </span>

                <input
                  className="form-input doc-search-input"
                  placeholder="Search by file name, case, client, or case number…"
                  value={searchQuery}
                  onChange={e =>
                    setSearchQuery(e.target.value)
                  }
                />

                {searchQuery && (
                  <button type="button"
                    className="doc-search-clear"
                    onClick={() => setSearchQuery('')}
                  >
                    <Icon name="close" />
                  </button>
                )}
              </div>

              <div className="doc-filter-group doc-filter-group--right">
                <label className="doc-filter-label">
                  Sort:
                </label>

                <Dropdown
                  className="form-input doc-filter-select"
                  searchable={false}
                  value={sortBy}
                  onChange={e =>
                    setSortBy(e.target.value)
                  }
                >
                  <option value="date">
                    Newest First
                  </option>

                  <option value="oldest">
                    Oldest First
                  </option>

                  <option value="name">
                    Name A–Z
                  </option>
                </Dropdown>
              </div>

              {hasFilters && (
                <button type="button"
                  className="btn-outline"
                  onClick={clearFilters}
                >
                  Clear All
                </button>
              )}
            </div>
          </div>

          {/* Empty state when nothing matches or no documents exist */}
          {caseGroups.length === 0 && (
            <div className="empty-state">
              <div className="empty-state__icon">
                <Icon name="inbox" duotone />
              </div>

              <p className="empty-state__title">
                {allDocs.length === 0
                  ? 'No documents uploaded yet'
                  : 'No documents match your search'}
              </p>

              <p className="empty-state__desc">
                {allDocs.length === 0
                  ? 'Open a case and upload documents to get started.'
                  : 'Try adjusting your filters.'}
              </p>
            </div>
          )}

          {/* Grouped view: one card per case */}
          {caseGroups.length > 0 && (
              <div className="doc-groups">
                {visibleCaseGroups.map(([caseId, group]) => (
                  <CaseDocGroup
                    key={caseId}
                    caseId={caseId}
                    group={group}
                    evidenceItems={evidenceByCaseId[String(caseId)] || []}
                    isOpen={caseCardOpen(caseId)}
                    onToggle={() => toggleCaseCard(caseId)}
                    openUploadMenu={openUploadMenu}
                    setOpenUploadMenu={setOpenUploadMenu}
                    setUploadDocCaseId={setUploadDocCaseId}
                    setEvidenceCategory={setEvidenceCategory}
                    setEvidenceTargetId={setEvidenceTargetId}
                    setShowUploadEvidence={setShowUploadEvidence}
                    handleViewDocument={handleViewDocument}
                    handleDownloadDocument={handleDownloadDocument}
                    handleDeleteDocument={handleDeleteDocument}
                    handleDeleteEvidence={handleDeleteEvidence}
                  />
                ))}
                <SeeMore remaining={caseGroupsRemaining} onClick={showMoreCaseGroups} step={showMoreCaseGroupsStep} />
              </div>
            )}
        </>
      )}

      {/* Client Documents tab */}
      {source === 'Client Documents' && (
        <>
          {/* Search box, sort dropdown and clear button */}
          <div className="card doc-filter-bar">
            <div className="doc-filter-row">
              <div className="doc-search-wrap">
                <span className="doc-search-icon"><Icon name="search" /></span>

                <input
                  className="form-input doc-search-input"
                  placeholder="Search by file name or client…"
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                />

                {clientSearch && (
                  <button type="button"
                    className="doc-search-clear"
                    onClick={() => setClientSearch('')}
                  >
                    <Icon name="close" />
                  </button>
                )}
              </div>

              <div className="doc-filter-group doc-filter-group--right">
                <label className="doc-filter-label">
                  Sort:
                </label>

                <Dropdown
                  className="form-input doc-filter-select"
                  searchable={false}
                  value={clientSortBy}
                  onChange={e =>
                    setClientSortBy(e.target.value)
                  }
                >
                  <option value="date">
                    Newest First
                  </option>

                  <option value="oldest">
                    Oldest First
                  </option>

                  <option value="name">
                    Name A–Z
                  </option>
                </Dropdown>
              </div>

              {clientSearch && (
                <button type="button"
                  className="btn-outline"
                  onClick={() => {
                    setClientSearch('')
                  }}
                >
                  Clear All
                </button>
              )}
            </div>
          </div>

          {/* Empty state when nothing matches or no client documents exist */}
          {clientGroups.length === 0 && (
            <div className="empty-state">
              <div className="empty-state__icon"><Icon name="inbox" duotone /></div>
              <p className="empty-state__title">
                {allClientDocs.length === 0
                  ? 'No client documents uploaded yet'
                  : 'No documents match your search'}
              </p>
              <p className="empty-state__desc">
                {allClientDocs.length === 0
                  ? 'Open a client and upload a general-purpose document to get started.'
                  : 'Try adjusting your filters.'}
              </p>
            </div>
          )}

          {/* One card per client */}
          {clientGroups.length > 0 && (
            <div className="doc-groups">
              {visibleClientGroups.map(([clientId, group]) => (
                <ClientDocGroup
                  key={clientId}
                  clientId={clientId}
                  clientName={group.clientName}
                  docs={group.docs}
                  evidenceItems={evidenceByClientId[String(clientId)] || []}
                  isOpen={clientCardOpen(clientId)}
                  onToggle={() => toggleClientCard(clientId)}
                  openUploadMenu={openUploadMenu}
                  setOpenUploadMenu={setOpenUploadMenu}
                  setUploadDocClientId={setUploadDocClientId}
                  setEvidenceCategory={setEvidenceCategory}
                  setEvidenceTargetId={setEvidenceTargetId}
                  setShowUploadEvidence={setShowUploadEvidence}
                  handleViewDocument={handleViewDocument}
                  handleDownloadDocument={handleDownloadDocument}
                  handleDeleteClientDocument={handleDeleteClientDocument}
                  handleDeleteEvidence={handleDeleteEvidence}
                />
              ))}
              <SeeMore remaining={clientGroupsRemaining} onClick={showMoreClientGroups} step={showMoreClientGroupsStep} />
            </div>
          )}
        </>
      )}

      {/* Advocate Documents tab: personal documents not linked to any case or client */}
      {source === 'Advocate Documents' && (
        <>
          {/* Search box */}
          <div className="card doc-filter-bar">
            <div className="doc-search-wrap">
              <span className="doc-search-icon"><Icon name="search" /></span>

              <input
                className="form-input doc-search-input"
                placeholder="Search by file name or type…"
                value={advocateSearch}
                onChange={e => setAdvocateSearch(e.target.value)}
              />

              {advocateSearch && (
                <button type="button" className="doc-search-clear" onClick={() => setAdvocateSearch('')}><Icon name="close" /></button>
              )}
            </div>
          </div>

          {/* Empty state when nothing matches or no advocate documents exist */}
          {filteredAdvocateDocs.length === 0 && (
            <div className="empty-state">
              <div className="empty-state__icon"><Icon name="inbox" duotone /></div>
              <p className="empty-state__title">
                {normalizedAdvocateDocs.length === 0
                  ? 'No advocate documents uploaded yet'
                  : 'No documents match your search'}
              </p>
              <p className="empty-state__desc">
                {normalizedAdvocateDocs.length === 0
                  ? 'Upload a personal document — not linked to any case or client — to get started.'
                  : 'Try adjusting your search.'}
              </p>
            </div>
          )}

          {/* Single card listing the advocate's own documents */}
          {filteredAdvocateDocs.length > 0 && (
            <div className="card doc-group">
              <div className="doc-group__header">
                <div>
                  <p className="doc-group__case-name">Your Documents</p>
                  <p className="doc-group__meta">Not linked to any case or client</p>
                </div>

                <div className="doc-group__actions">
                  <span className="doc-group__file-count">
                    {filteredAdvocateDocs.length} file{filteredAdvocateDocs.length !== 1 ? 's' : ''}
                  </span>
                  <button type="button" className="btn-outline" onClick={() => setUploadDocAdvocate(true)}>
                    + Upload
                  </button>
                </div>
              </div>

              {visibleAdvocateDocs.map(doc => (
                <div key={doc.id} className="doc-row">
                  <div className="doc-row__icon"><Icon name={getIcon(doc.fileName || doc.name)} /></div>

                  <div className="doc-row__body">
                    <p className="doc-row__name">{documentTitle(doc)}<DocInfoButton doc={doc} /></p>
                    <p className="doc-row__meta">
                      {doc.size}
                      {' • '}
                      <span className="u-nowrap">Uploaded {doc.date ? String(doc.date).slice(0, 10) : 'Unknown date'}</span>
                    </p>
                  </div>

                  <div className="doc-row__actions">
                    <button type="button" className="btn-outline" onClick={() => handleViewDocument(doc)} title="Open in this tab">
                      <Icon name="eye" /> Open
                    </button>
                    <button type="button" className="btn-outline" onClick={() => handleDownloadDocument(doc)}>
                      <Icon name="download" /> Download
                    </button>
                    <button
                      className="btn-outline btn-outline--danger"
                      onClick={async () => {
                        if (await confirmDialog(`Delete document "${doc.name}"?`)) {
                          handleDeleteAdvocateDoc(doc.id)
                        }
                      }}
                    >
                      <Icon name="trash" /> Delete
                    </button>
                  </div>
                </div>
              ))}
              <SeeMore remaining={advocateDocsRemaining} onClick={showMoreAdvocateDocs} step={showMoreAdvocateDocsStep} />
            </div>
          )}

        </>
      )}
    </div>
  )
}