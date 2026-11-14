import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '../services/api'
import Dropdown from '../components/common/Dropdown'
import SearchInput from '../components/common/SearchInput'
import SeeMore from '../components/common/SeeMore'
import useSeeMore from '../hooks/useSeeMore'
import { confirmDialog } from '../utils/confirmDialog'

const TABS = [
  { id: 'advocates',  label: 'Advocates' },
  { id: 'allot',      label: 'Allot cases' },
  { id: 'allotments', label: 'Allotments' },
]

const EMPTY_FORM = { name: '', email: '', phone: '', barNo: '', password: '' }

// Corporate view for a firm on a corporate plan: create accounts for the hired advocates, allot cases to them in bulk from your MIS spreadsheets
// and see who holds which case
export default function CorporateFirm() {
  const [tab, setTab] = useState('advocates')
  const [advocates, setAdvocates] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  const loadAdvocates = useCallback(() => {
    return api.corporate.advocates()
      .then(r => { setAdvocates(r || []); setError('') })
      .catch(e => setError(e.message || 'Could not load the advocates'))
      .finally(() => setLoaded(true))
  }, [])
  useEffect(() => { loadAdvocates() }, [loadAdvocates])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Corporate</h1>
          <p className="page-subtitle">Create accounts for your hired advocates and allot cases to them in bulk from your MIS spreadsheets</p>
        </div>
      </div>

      <div className="corp-tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            className={`corp-tab${tab === t.id ? ' corp-tab--active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {error && tab === 'advocates' && <p className="corp-error">{error}</p>}

      {tab === 'advocates'  && <AdvocatesTab advocates={advocates} loaded={loaded} reload={loadAdvocates} />}
      {tab === 'allot'      && <AllotTab advocates={advocates} onDone={loadAdvocates} />}
      {tab === 'allotments' && <AllotmentsTab advocates={advocates} />}
    </div>
  )
}

// Hired advocate accounts: create, deactivate / activate, reset the password
function AdvocatesTab({ advocates, loaded, reload }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState({ error: '', ok: '' })
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))

  const create = async () => {
    setBusy(true); setMsg({ error: '', ok: '' })
    try {
      const row = await api.corporate.createAdvocate(form)
      setForm(EMPTY_FORM)
      setMsg({ error: '', ok: `Account created for ${row.name}. Share the email and password with the advocate.` })
      await reload()
    } catch (e) {
      setMsg({ error: e.message || 'Could not create the account', ok: '' })
    } finally { setBusy(false) }
  }

  const toggle = async a => {
    const ok = await confirmDialog({
      message: a.active
        ? `Deactivate ${a.name}? They will not be able to sign in until you activate the account again.`
        : `Activate ${a.name}?`,
      confirmLabel: a.active ? 'Deactivate' : 'Activate',
      danger: a.active,
    })
    if (!ok) return
    try { await api.corporate.setActive(a.id, !a.active); await reload() }
    catch (e) { setMsg({ error: e.message || 'Could not change the account', ok: '' }) }
  }

  const resetPassword = async a => {
    const password = window.prompt(`New password for ${a.name}`)
    if (!password) return
    try {
      await api.corporate.resetPassword(a.id, password)
      setMsg({ error: '', ok: `Password changed for ${a.name}.` })
    } catch (e) { setMsg({ error: e.message || 'Could not change the password', ok: '' }) }
  }

  return (
    <>
      <div className="card corp-card">
        <p className="corp-card__title">Add an advocate</p>
        <div className="corp-grid">
          <div><label className="form-label">Name *</label>
            <input className="form-input" value={form.name} onChange={set('name')} /></div>
          <div><label className="form-label">Email *</label>
            <input className="form-input" type="email" value={form.email} onChange={set('email')} autoComplete="off" /></div>
          <div><label className="form-label">Phone</label>
            <input className="form-input" value={form.phone} onChange={set('phone')} /></div>
          <div><label className="form-label">Bar registration no.</label>
            <input className="form-input" value={form.barNo} onChange={set('barNo')} /></div>
          <div><label className="form-label">Password *</label>
            <input className="form-input" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" /></div>
        </div>
        <div className="corp-actions">
          <button type="button" className="btn-gold" disabled={busy || !form.name.trim() || !form.email.trim() || !form.password}
            onClick={create}>{busy ? 'Creating…' : 'Create advocate account'}</button>
        </div>
        {msg.error && <p className="corp-error">{msg.error}</p>}
        {msg.ok && <p className="corp-ok">{msg.ok}</p>}
      </div>

      <div className="card corp-card">
        <p className="corp-card__title">Your advocates ({advocates.length})</p>
        {loaded && advocates.length === 0 && <p className="corp-muted">No advocate accounts yet. Add one above.</p>}
        <div className="corp-list">
          {advocates.map(a => (
            <div key={a.id} className="corp-row">
              <div className="corp-row__main"><strong>{a.name}</strong><br /><span className="corp-muted">{a.email}</span></div>
              <div className="corp-row__main corp-muted">{[a.phone, a.barNo].filter(Boolean).join(' • ') || '—'}</div>
              <div>
                <span className={`corp-badge ${a.active ? 'corp-badge--ok' : 'corp-badge--off'}`}>{a.active ? 'Active' : 'Deactivated'}</span>{' '}
                <span className="corp-muted">{a.allotted} allotted</span>
              </div>
              <div className="corp-row__actions">
                <button type="button" className="btn-outline btn-outline--sm" onClick={() => resetPassword(a)}>Reset password</button>
                <button type="button" className="btn-outline btn-outline--sm" onClick={() => toggle(a)}>{a.active ? 'Deactivate' : 'Activate'}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// Upload the MIS spreadsheets (.xlsx) and give every case found in them to one advocate in one go
function AllotTab({ advocates, onDone }) {
  const active = advocates.filter(a => a.active)
  const [advocateId, setAdvocateId] = useState('')
  const [files, setFiles] = useState([])
  const [skipClosed, setSkipClosed] = useState(true)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const input = useRef(null)

  const add = list => {
    const sheets = Array.from(list || []).filter(f => /\.(xlsx|xls|csv)$/i.test(f.name))
    setFiles(prev => {
      const seen = new Set(prev.map(f => `${f.name}:${f.size}`))
      return [...prev, ...sheets.filter(f => !seen.has(`${f.name}:${f.size}`))]
    })
  }

  const submit = async () => {
    setBusy(true); setError(''); setResult(null)
    try {
      const r = await api.corporate.allot(advocateId, files, skipClosed)
      setResult(r); setFiles([])
      onDone()
    } catch (e) {
      setError(e.message || 'Could not allot the cases')
    } finally { setBusy(false) }
  }

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

  return (
    <div className="card corp-card">
      <p className="corp-card__title">Allot cases from your MIS spreadsheets</p>
      <p className="corp-muted">
        Every sheet with a CNR column (CNR NO, CNRNO, CRN NO, CRN NUMBER) is read, and each case in it is given to the advocate you choose.
        Rows without a CNR number are listed in the result, because a case is added by its CNR number.
      </p>

      <div style={{ margin: '1rem 0' }}>
        <label className="form-label">Allot to *</label>
        <Dropdown className="form-input" value={advocateId} onChange={e => setAdvocateId(e.target.value)}>
          <option value="">Select an advocate</option>
          {active.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Dropdown>
        {advocates.length > 0 && active.length === 0 && <p className="corp-muted">All your advocate accounts are deactivated.</p>}
      </div>

      <div className={`corp-drop${over ? ' corp-drop--over' : ''}`} role="button" tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') input.current?.click() }}
        onDragOver={e => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); add(e.dataTransfer.files) }}>
        <p style={{ margin: 0 }}><strong>Drop the .xlsx MIS sheets here</strong> or click to choose them</p>
        <input ref={input} type="file" multiple hidden
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={e => { add(e.target.files); e.target.value = '' }} />
      </div>

      {files.length > 0 && (
        <ul className="corp-files">
          {files.map(f => (
            <li key={`${f.name}:${f.size}`}>
              <span>{f.name} <span className="corp-muted">({(f.size / 1048576).toFixed(1)} MB)</span></span>
              <button type="button" className="btn-outline btn-outline--sm"
                onClick={() => setFiles(prev => prev.filter(x => x !== f))}>Remove</button>
            </li>
          ))}
        </ul>
      )}

      <label className="corp-check">
        <input type="checkbox" checked={skipClosed} onChange={e => setSkipClosed(e.target.checked)} />
        <span>Leave out disposed and withdrawn cases</span>
      </label>

      <div className="corp-actions">
        <button type="button" className="btn-gold" disabled={busy || !advocateId || files.length === 0} onClick={submit}>
          {busy ? 'Reading the sheets and allotting…' : `Allot ${plural(files.length || 0, 'spreadsheet')}`}
        </button>
      </div>
      {error && <p className="corp-error">{error}</p>}

      {result && (
        <div className="corp-result">
          <div className="corp-stats">
            <div className="corp-stat"><strong>{result.allotted}</strong><span>newly allotted</span></div>
            <div className="corp-stat"><strong>{result.moved}</strong><span>moved from another advocate</span></div>
            <div className="corp-stat"><strong>{result.unchanged}</strong><span>already with {result.advocateName}</span></div>
            <div className="corp-stat"><strong>{result.duplicates}</strong><span>repeated CNR in the sheet</span></div>
            <div className="corp-stat corp-stat--warn"><strong>{result.skipped + result.failedFiles}</strong><span>not allotted</span></div>
          </div>
          {result.files.map((f, i) => (
            <div key={`${f.fileName}-${i}`} className="corp-result__file">
              <strong>{f.fileName}</strong>
              {f.error
                ? <div className="corp-error">{f.error}</div>
                : <>
                    <div className="corp-muted">
                      {plural(f.rows, 'case row')} read from {f.sheets.join(', ')}: {f.allotted} new, {f.moved} moved, {f.unchanged} already
                      allotted, {f.duplicates} repeated, {f.skipped} not allotted
                    </div>
                    {f.movedExamples.length > 0 && <div className="corp-muted">Moved, for example: {f.movedExamples.join(', ')}</div>}
                    {f.skips.map(k => (
                      <details key={k.reason} className="corp-skip">
                        <summary>{k.count} • {k.reason}</summary>
                        <ul>{k.examples.map(x => <li key={x}>{x}</li>)}</ul>
                        {k.count > k.examples.length && <span className="corp-muted">…and {k.count - k.examples.length} more</span>}
                      </details>
                    ))}
                  </>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Every allotted case: who holds it, the sheet it came from, whether the advocate has added it, move or take it back
function AllotmentsTab({ advocates }) {
  const [rows, setRows] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [advocateId, setAdvocateId] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(() => {
    const params = {}
    if (advocateId) params.advocateId = advocateId
    if (search.trim()) params.search = search.trim()
    return api.corporate.allotments(params)
      .then(r => { setRows(r || []); setError('') })
      .catch(e => setError(e.message || 'Could not load the allotments'))
      .finally(() => setLoaded(true))
  }, [advocateId, search])
  // The search waits a moment after typing stops
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  const { visible, remaining, showMore } = useSeeMore(rows, `${advocateId}|${search}`, 30)

  const downloadSheet = async r => {
    try { await api.corporate.downloadSheet(r.sheetId, r.sheetName || 'mis.xlsx') }
    catch (e) { setError(e.message || 'Could not download the spreadsheet') }
  }

  const move = async (r, id) => {
    if (!id || Number(id) === r.advocateId) return
    try { await api.corporate.reassign(r.id, Number(id)); await load() }
    catch (e) { setError(e.message || 'Could not move the case') }
  }
  const remove = async r => {
    const ok = await confirmDialog({ message: `Remove ${r.cnrNo} from ${r.advocateName}? A case the advocate already added stays in their list.` })
    if (!ok) return
    try { await api.corporate.remove(r.id); await load() }
    catch (e) { setError(e.message || 'Could not remove the allotment') }
  }

  const counts = useMemo(() => ({ added: rows.filter(r => r.added).length }), [rows])

  return (
    <div className="card corp-card">
      <p className="corp-card__title">Allotments ({rows.length})</p>
      <div className="corp-grid">
        <SearchInput value={search} onChange={setSearch} placeholder="Search CNR, CC no., accused, court or advocate" />
        <Dropdown className="form-input" value={advocateId} onChange={e => setAdvocateId(e.target.value)}>
          <option value="">All advocates</option>
          {advocates.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Dropdown>
      </div>
      {rows.length > 0 && <p className="corp-muted">{counts.added} of {rows.length} already added by the advocates</p>}
      {error && <p className="corp-error">{error}</p>}
      {loaded && rows.length === 0 && !error && <p className="corp-muted">No allotted cases found.</p>}

      <div className="corp-list" style={{ marginTop: '0.75rem' }}>
        {visible.map(r => (
          <div key={r.id} className="corp-row">
            <div className="corp-row__main">
              <strong>{r.cnrNo}</strong><br />
              <span className="corp-muted">{[r.ccNo && `CC ${r.ccNo}`, r.courtName, r.accused].filter(Boolean).join(' • ') || `Allotted ${r.allottedOn}`}</span>
              {r.nextDate && <><br /><span className="corp-muted">Next hearing {r.nextDate}</span></>}
            </div>
            <div>
              <Dropdown className="form-input" value={r.advocateId} onChange={e => move(r, e.target.value)}>
                {advocates.filter(a => a.active || a.id === r.advocateId)
                  .map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Dropdown>
            </div>
            <div>
              <span className={`corp-badge ${r.added ? 'corp-badge--ok' : ''}`}>{r.added ? 'Added by advocate' : 'Not added yet'}</span>
            </div>
            <div className="corp-row__actions">
              {r.sheetId && <button type="button" className="btn-outline btn-outline--sm" onClick={() => downloadSheet(r)}>Sheet</button>}
              <button type="button" className="btn-outline btn-outline--sm" onClick={() => remove(r)}>Remove</button>
            </div>
          </div>
        ))}
      </div>
      <SeeMore remaining={remaining} onClick={showMore} />
    </div>
  )
}
