import { useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import { useApp } from '../context/AppContext'
import SearchInput from '../components/common/SearchInput'
import SeeMore from '../components/common/SeeMore'
import useSeeMore from '../hooks/useSeeMore'

// For an advocate a firm created: the cases the firm allotted to them. A case is added with its CNR number; once it is in the
// advocate's own Cases list it shows as added
export default function AllottedCases() {
  const { currentUser, openAddCase } = useApp()
  const [rows, setRows] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [only, setOnly] = useState('pending')

  useEffect(() => {
    let live = true
    api.corporate.mine()
      .then(r => { if (live) { setRows(r || []); setError('') } })
      .catch(e => { if (live) setError(e.message || 'Could not load the allotted cases') })
      .finally(() => { if (live) setLoaded(true) })
    return () => { live = false }
  }, [])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => (only === 'all' || (only === 'pending' ? !r.added : r.added))
      && (!q || r.cnrNo.toLowerCase().includes(q) || [r.ccNo, r.courtName, r.accused].some(v => (v || '').toLowerCase().includes(q))))
  }, [rows, search, only])

  const { visible, remaining, showMore } = useSeeMore(shown, `${search}|${only}`, 30)

  const pending = rows.filter(r => !r.added).length

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Allotted Cases</h1>
          <p className="page-subtitle">
            Cases {currentUser?.corporateName || 'your firm'} allotted to you{loaded ? ` • ${pending} not added yet` : ''}
          </p>
        </div>
      </div>

      <div className="corp-tabs">
        {[['pending', 'Not added yet'], ['added', 'Added'], ['all', 'All']].map(([id, label]) => (
          <button key={id} type="button" className={`corp-tab${only === id ? ' corp-tab--active' : ''}`} onClick={() => setOnly(id)}>{label}</button>
        ))}
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search CNR, CC no., accused or court" />
      </div>

      {error && <p className="corp-error">{error}</p>}
      {loaded && shown.length === 0 && !error && <p className="corp-muted">Nothing here.</p>}

      <div className="corp-list">
        {visible.map(r => (
          <div key={r.id} className="corp-row">
            <div className="corp-row__main"><strong>{r.cnrNo}</strong><br /><span className="corp-muted">Allotted {r.allottedOn}</span></div>
            <div className="corp-row__main corp-muted">
              {[r.ccNo && `CC ${r.ccNo}`, r.courtName].filter(Boolean).join(' • ') || '—'}
              {r.accused && <><br />{r.accused}</>}
              {r.nextDate && <><br />Next hearing {r.nextDate}</>}
            </div>
            <div><span className={`corp-badge ${r.added ? 'corp-badge--ok' : ''}`}>{r.added ? 'Added' : 'Not added yet'}</span></div>
            <div className="corp-row__actions">
              {!r.added && <button type="button" className="btn-gold btn-outline--sm" onClick={() => openAddCase(r.cnrNo)}>Add case</button>}
            </div>
          </div>
        ))}
      </div>
      <SeeMore remaining={remaining} onClick={showMore} />
    </div>
  )
}
