import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../../services/api'
import { useApp } from '../../context/AppContext'
import { getErrorMessage } from '../../utils/errorMessages'
import useOverlayClose from '../../hooks/useOverlayClose'
import useDragReorder from '../../hooks/useDragReorder'
import Dropdown from '../common/Dropdown'
import {
  COURT_TYPES, FEE_KINDS, SCALE_NAMES, DEFAULT_CONFIG, buildFeeRules,
} from '../../utils/courtFeesAct'
import { confirmDialog } from '../../utils/confirmDialog'
import ModalPortal from '../../components/common/ModalPortal'
import useSessionState from '../../hooks/useSessionState'

// Copy of a config so edits never touch the loaded one or the built-in defaults
const clone = o => JSON.parse(JSON.stringify(o))

// Rupee text for the filings table
const rupees = n => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })

// A blank number box is saved as "not set"; anything else must be a number
const numOrNull = v => (v === '' || v === null || v === undefined ? null : Number(v))

// Short description of what a filing charges
function feeSummary(f) {
  if (f.kind === 'fixed') return Number(f.amount) === 0 ? 'Nil' : `Fixed ${rupees(f.amount)}`
  if (f.kind === 'adv')   return 'Ad valorem scale'
  if (f.kind === 'half')  return 'Half of ad valorem'
  return SCALE_NAMES[f.scale] || 'Own fee scale'
}

// Lowercase letters, digits and underscores from a name, kept unique among the filings of its case type
function makeKey(label, taken) {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'filing'
  let key = base, n = 2
  while (taken.has(key)) key = `${base}_${n++}`
  return key
}

// Blank filing form for a case type
const emptyFiling = caseType => ({ caseType, key: '', label: '', kind: 'adv', amount: '', scale: 'adValorem', mult: '', valueLabel: '', ref: '', isNew: true })

// Admin screen for the court fee calculator: filings, fee scales and notes
export default function FeeCalculatorAdmin() {
  const { addToast } = useApp()
  const [cfg, setCfg] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  // True for a few seconds right after a successful save, so "Saved" shows once and then goes away
  const [justSaved, setJustSaved] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [section, setSection] = useSessionState('admin_fee_section', 'filings')
  const [caseType, setCaseType] = useState('civil')
  // Filing in the editor (null when closed) and its error
  const [editing, setEditing] = useState(null)
  const [formError, setFormError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  // Previewing the rules being edited
  const [previewValue, setPreviewValue] = useState('')
  const quickRows = cfg?.quickRef || DEFAULT_CONFIG.quickRef

  // Load the saved rules
  const load = useCallback(() => {
    setLoadError('')
    api.admin.feeCalculator.get()
      .then(r => {
        const c = clone(r?.config || DEFAULT_CONFIG)
        if (!Array.isArray(c.quickRef)) c.quickRef = clone(DEFAULT_CONFIG.quickRef)   // rules saved before Quick Reference was editable
        setCfg(c)
        setDirty(false)
      })
      .catch(e => setLoadError(getErrorMessage(e, 'Could not load the fee rules')))
  }, [])
  useEffect(load, [load])

  const closeEditor = useCallback(() => setEditing(null), [])
  const overlay = useOverlayClose(closeEditor, { backdrop: false })

  // Applies a change to the working copy
  useEffect(() => {
    if (!justSaved) return
    const t = setTimeout(() => setJustSaved(false), 3000)
    return () => clearTimeout(t)
  }, [justSaved])

  const update = fn => { setCfg(c => { const n = clone(c); fn(n); return n }); setDirty(true); setJustSaved(false) }

  const filings = useMemo(() => (cfg?.filings || []), [cfg])
  const shown = filings.map((f, i) => ({ f, i })).filter(x => x.f.caseType === caseType)

  // Press and hold the grip of a row and drag it to any place; the order is applied once, when released
  const filingDrag = useDragReorder(shown.map(x => x.f.key), (_start, finalKeys) => update(n => {
    const same = n.filings.map((f, idx) => idx).filter(idx => n.filings[idx].caseType === caseType)
    const byKey = new Map(same.map(idx => [n.filings[idx].key, n.filings[idx]]))
    if (finalKeys.length !== same.length || finalKeys.some(k => !byKey.has(k))) return
    same.forEach((idx, pos) => { n.filings[idx] = byKey.get(finalKeys[pos]) })
  }))
  const quickDrag = useDragReorder(quickRows.map((_, i) => i), (_start, finalKeys) => update(n => {
    const src = n.quickRef || clone(DEFAULT_CONFIG.quickRef)
    n.quickRef = finalKeys.map(k => src[Number(k)])
  }))
  const noteDrag = useDragReorder((cfg?.notes || []).map((_, i) => i), (_start, finalKeys) => update(n => {
    n.notes = finalKeys.map(k => n.notes[Number(k)])
  }))

  // Moves a filing up or down among the filings of its case type
  function move(i, dir) {
    update(n => {
      const same = n.filings.map((f, idx) => idx).filter(idx => n.filings[idx].caseType === n.filings[i].caseType)
      const pos = same.indexOf(i), target = same[pos + dir]
      if (target === undefined) return
      ;[n.filings[i], n.filings[target]] = [n.filings[target], n.filings[i]]
    })
  }

  async function removeFiling(i) {
    const f = filings[i]
    if (!await confirmDialog(`Remove "${f.label}" from the calculator?`)) return
    update(n => { n.filings.splice(i, 1) })
  }

  // Saves the filing in the editor into the working copy
  function saveFiling() {
    const f = editing
    if (!f.label.trim()) return setFormError('Enter the filing name')
    if (f.kind === 'fixed' && (f.amount === '' || Number(f.amount) < 0)) return setFormError('Enter the fixed fee (0 for no fee)')
    if (f.mult !== '' && !(Number(f.mult) > 0)) return setFormError('The multiplier must be above 0, or left blank')
    const out = { caseType: f.caseType, key: f.key, label: f.label.trim(), kind: f.kind, ref: f.ref.trim() }
    if (f.kind === 'fixed') out.amount = Number(f.amount)
    if (f.kind === 'scale') out.scale = f.scale
    if (f.kind !== 'fixed') {
      if (f.mult !== '' && Number(f.mult) !== 1) out.mult = Number(f.mult)
      out.valueLabel = f.valueLabel.trim() || 'Claim / Subject Matter Value (₹)'
    }
    update(n => {
      if (f.isNew) {
        out.key = makeKey(out.label, new Set(n.filings.filter(x => x.caseType === f.caseType).map(x => x.key)))
        n.filings.push(out)
      } else {
        n.filings[f.index] = out
      }
    })
    setEditing(null)
  }

  // Band and forum editing helpers
  const setBand = (scale, i, patch) => update(n => { Object.assign(n.scales[scale].slabs[i], patch) })
  const addBand = scale => update(n => {
    const s = n.scales[scale].slabs
    s.splice(s.length - 1, 0, { upTo: '', base: '', stepSize: '', stepFee: '', percent: '' })
  })
  const removeBand = (scale, i) => update(n => { n.scales[scale].slabs.splice(i, 1) })

  // Checks the rules before sending them, returns an error text or ''
  function problem(c) {
    for (const [name, label] of Object.entries(SCALE_NAMES)) {
      const slabs = c.scales[name].slabs
      let prev = 0
      for (let i = 0; i < slabs.length - 1; i++) {
        const up = numOrNull(slabs[i].upTo)
        if (up === null || !(up > prev)) return `${label}: each band's upper limit must be a number above the previous band's`
        prev = up
      }
    }
    let prev = 0
    for (let i = 0; i < c.forums.length - 1; i++) {
      const up = numOrNull(c.forums[i].upTo)
      if (up === null || !(up > prev)) return 'Consumer forums: each upper limit must be a number above the previous one'
      prev = up
    }
    if (c.forums.some(f => !String(f.label).trim())) return 'Every consumer forum needs a name'
    return ''
  }

  // Cleans blank number boxes into proper values and saves to the server
  async function save() {
    const c = clone(cfg)
    Object.values(c.scales).forEach(s => {
      s.maxFee = numOrNull(s.maxFee)
      if (s.maxFee === null) delete s.maxFee
      s.slabs = s.slabs.map((b, i) => {
        const o = { upTo: i === s.slabs.length - 1 ? null : numOrNull(b.upTo) }
        ;['base', 'stepSize', 'stepFee', 'percent'].forEach(k => { const v = numOrNull(b[k]); if (v !== null) o[k] = v })
        return o
      })
    })
    c.forums = c.forums.map((f, i) => ({ upTo: i === c.forums.length - 1 ? null : numOrNull(f.upTo), label: String(f.label).trim() }))
    c.notes = c.notes.map(x => String(x).trim()).filter(Boolean)
    c.quickRef = (c.quickRef || []).map(r => {
      const o = { label: String(r.label || '').trim(), mode: r.mode === 'filing' ? 'filing' : 'adv' }
      const v = numOrNull(r.value)
      if (v !== null) o.value = v
      if (o.mode === 'filing') { o.caseType = r.caseType; o.key = r.key }
      return o
    }).filter(r => r.label)
    const err = problem(c)
    if (err) return addToast(err, 'error')
    setSaving(true)
    try {
      const r = await api.admin.feeCalculator.save(c)
      setCfg(clone(r.config)); setDirty(false); setJustSaved(true)
      addToast('Fee calculator saved', 'success')
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not save the fee rules'), 'error')
    } finally { setSaving(false) }
  }

  // Throws away the saved rules so the built-in Court Fees Act defaults apply
  async function reset() {
    setSaving(true)
    try {
      const r = await api.admin.feeCalculator.reset()
      setCfg(clone(r?.config || DEFAULT_CONFIG)); setDirty(false); setJustSaved(false); setConfirmReset(false)
      addToast('Fee calculator reset to the Court Fees Act defaults', 'success')
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not reset the fee rules'), 'error')
    } finally { setSaving(false) }
  }

  if (loadError) return (
    <p className="admin__hint admin__hint--error">{loadError} <button type="button" className="btn-outline btn-outline--sm" onClick={load}>Retry</button></p>
  )
  if (!cfg) return <p className="admin__hint">Loading…</p>

  // Rules as the calculator will use them, for the preview
  const preview = buildFeeRules(cfg)
  const pv = Number(previewValue) || 0

  return (
    <div>
      <div className="admin__toolbar">
        {[['filings', 'Filings'], ['scales', 'Fee scales'], ['quick', 'Quick reference'], ['notes', 'Notes']].map(([id, label]) => (
          <button type="button" key={id} className={section === id ? 'btn-gold' : 'btn-outline'} onClick={() => setSection(id)}>{label}</button>
        ))}
        <span className="admin__count">
          {dirty ? 'Unsaved changes' : justSaved ? 'Saved' : ''}
        </span>
        <button type="button" className="btn-gold" onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save changes'}</button>
        {confirmReset ? (
          <>
            <span className="admin__count">Replace all rules with the Court Fees Act defaults?</span>
            <button type="button" className="btn-outline btn-outline--sm btn-outline--danger" onClick={reset} disabled={saving}>Yes, reset</button>
            <button type="button" className="btn-outline btn-outline--sm" onClick={() => setConfirmReset(false)}>No</button>
          </>
        ) : (
          <button type="button" className="btn-outline" onClick={() => setConfirmReset(true)} disabled={saving}>Reset to defaults</button>
        )}
      </div>

      {/* Filings: what can be picked in the calculator, per case type */}
      {section === 'filings' && (
        <>
          <div className="admin__toolbar">
            {COURT_TYPES.map(t => (
              <button type="button" key={t.value} className={caseType === t.value ? 'btn-gold btn-outline--sm' : 'btn-outline btn-outline--sm'}
                onClick={() => setCaseType(t.value)}>
                {t.label} ({filings.filter(f => f.caseType === t.value).length})
              </button>
            ))}
            <button type="button" className="btn-gold" onClick={() => { setFormError(''); setEditing(emptyFiling(caseType)) }}>+ Add filing</button>
          </div>
          <div className="admin__table-wrap">
            <table className="admin__table">
              <thead><tr><th>Filing</th><th>Fee</th><th>Reference</th><th /></tr></thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={4} className="admin__empty">No filings for this case type</td></tr>}
                {filingDrag.ordered(shown, x => x.f.key).map(({ f, i }, pos) => (
                  <tr key={f.key} ref={filingDrag.rowRef(f.key)} style={filingDrag.rowStyle(f.key)}>
                    <td className="admin__multiline"><strong>{f.label}</strong></td>
                    <td>{feeSummary(f)}{f.mult > 1 ? ` × ${f.mult} value` : ''}</td>
                    <td className="admin__multiline">{f.ref || '—'}</td>
                    <td className="admin__actions">
                      <span {...filingDrag.gripProps(f.key)} style={{ ...filingDrag.gripProps(f.key).style, fontSize: 18, lineHeight: 1, padding: '0 6px' }}>⠿</span>
                      <button type="button" className="btn-outline btn-outline--sm" disabled={pos === 0} onClick={() => move(i, -1)} title="Move up">↑</button>
                      <button type="button" className="btn-outline btn-outline--sm" disabled={pos === shown.length - 1} onClick={() => move(i, 1)} title="Move down">↓</button>
                      <button type="button" className="btn-outline btn-outline--sm" onClick={() => { setFormError(''); setEditing({ ...f, index: i, amount: f.amount ?? '', mult: f.mult ?? '', valueLabel: f.valueLabel || '', ref: f.ref || '', scale: f.scale || 'adValorem' }) }}>Edit</button>
                      <button type="button" className="btn-outline btn-outline--sm btn-outline--danger" onClick={() => removeFiling(i)}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Fee scales: the value bands behind the ad valorem, consumer, probate and succession fees */}
      {section === 'scales' && (
        <>
          <p className="admin__hint">
            Each band runs from the previous band's upper limit to its own. A band charges either a % of the whole value, a base fee plus an
            amount for every block of the given size (or part of one) above where the band starts, or just the base fee. The last band has no upper limit.
          </p>
          {Object.entries(SCALE_NAMES).map(([name, label]) => {
            const s = cfg.scales[name]
            return (
              <div key={name} className="u-mb-24">
                <div className="admin__toolbar">
                  <strong>{label}</strong>
                  <label className="admin__count">Maximum fee (₹, optional)
                    <input className="form-input u-w-110 u-ml-8" type="number" min="0" value={s.maxFee ?? ''}
                      onChange={e => update(n => { n.scales[name].maxFee = e.target.value })} />
                  </label>
                  <button type="button" className="btn-outline btn-outline--sm" onClick={() => addBand(name)}>+ Add band</button>
                </div>
                <div className="admin__table-wrap">
                  <table className="admin__table">
                    <thead><tr><th>Up to (₹)</th><th>Base fee (₹)</th><th>Block size (₹)</th><th>Fee per block (₹)</th><th>% of value</th><th /></tr></thead>
                    <tbody>
                      {s.slabs.map((b, i) => {
                        const last = i === s.slabs.length - 1
                        const cell = (k, w = 110) => (
                          <input className="form-input" type="number" min="0" step="any" style={{ width: w }} value={b[k] ?? ''}
                            onChange={e => setBand(name, i, { [k]: e.target.value })} />
                        )
                        return (
                          <tr key={i}>
                            <td>{last ? <span className="admin__count">No limit</span> : cell('upTo', 130)}</td>
                            <td>{cell('base')}</td><td>{cell('stepSize')}</td><td>{cell('stepFee')}</td><td>{cell('percent', 80)}</td>
                            <td className="admin__actions">
                              {s.slabs.length > 1 && !last && <button type="button" className="btn-outline btn-outline--sm btn-outline--danger" onClick={() => removeBand(name, i)}>Remove</button>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

          <div className="admin__toolbar"><strong>Consumer forum by value</strong>
            <button type="button" className="btn-outline btn-outline--sm" onClick={() => update(n => n.forums.splice(n.forums.length - 1, 0, { upTo: '', label: '' }))}>+ Add forum</button>
          </div>
          <div className="admin__table-wrap">
            <table className="admin__table">
              <thead><tr><th>Up to (₹)</th><th>Forum</th><th /></tr></thead>
              <tbody>
                {cfg.forums.map((f, i) => {
                  const last = i === cfg.forums.length - 1
                  return (
                    <tr key={i}>
                      <td>{last ? <span className="admin__count">No limit</span> :
                        <input className="form-input u-w-130" type="number" min="0" value={f.upTo ?? ''} onChange={e => update(n => { n.forums[i].upTo = e.target.value })} />}</td>
                      <td><input className="form-input" value={f.label} onChange={e => update(n => { n.forums[i].label = e.target.value })} /></td>
                      <td className="admin__actions">{cfg.forums.length > 1 && !last && <button type="button" className="btn-outline btn-outline--sm btn-outline--danger" onClick={() => update(n => n.forums.splice(i, 1))}>Remove</button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Quick check of the ad valorem scale as edited (before saving) */}
          <div className="admin__toolbar u-mt-24">
            <strong>Try the ad valorem scale</strong>
            <input className="form-input u-w-160" type="number" min="0" placeholder="Value (₹)" value={previewValue} onChange={e => setPreviewValue(e.target.value)} />
            <span className="admin__count">{pv > 0 ? `Fee: ${rupees(preview.adValorem(pv))}` : 'Enter a value to see the fee'}</span>
          </div>
        </>
      )}

      {/* Quick Reference: example fees listed beside the calculator */}
      {section === 'quick' && (
        <>
          <div className="admin__toolbar">
            <p className="admin__hint">Example fees shown in the "Quick Reference" card. The fee is calculated from the rules above, so it always matches the calculator.</p>
            <button type="button" className="btn-gold" onClick={() => update(n => { n.quickRef = [...(n.quickRef || DEFAULT_CONFIG.quickRef), { label: '', mode: 'adv', value: '' }] })}>+ Add row</button>
          </div>
          <div className="admin__table-wrap">
            <table className="admin__table">
              <thead><tr><th>Label</th><th>Fee of</th><th>On value (₹)</th><th>Shows</th><th /></tr></thead>
              <tbody>
                {quickRows.length === 0 && <tr><td colSpan={5} className="admin__empty">No rows</td></tr>}
                {quickDrag.ordered(quickRows.map((r, i) => ({ r, i })), x => x.i).map(({ r, i }) => {
                  const set = patch => update(n => { n.quickRef = n.quickRef || clone(DEFAULT_CONFIG.quickRef); Object.assign(n.quickRef[i], patch) })
                  const shown = preview.quickRef.find(x => x[0] === r.label)
                  return (
                    <tr key={i} ref={quickDrag.rowRef(i)} style={quickDrag.rowStyle(i)}>
                      <td><input className="form-input" value={r.label} onChange={e => set({ label: e.target.value })} /></td>
                      <td>
                        <Dropdown className="form-input" value={r.mode === 'filing' ? `${r.caseType}/${r.key}` : 'adv'}
                          onChange={e => {
                            const v = e.target.value
                            if (v === 'adv') set({ mode: 'adv', caseType: undefined, key: undefined })
                            else { const [ct, ...k] = v.split('/'); set({ mode: 'filing', caseType: ct, key: k.join('/') }) }
                          }}>
                          <option value="adv">Ad valorem scale (civil suit)</option>
                          {filings.map(f => (
                            <option key={`${f.caseType}/${f.key}`} value={`${f.caseType}/${f.key}`}>
                              {COURT_TYPES.find(t => t.value === f.caseType)?.label}: {f.label}
                            </option>
                          ))}
                        </Dropdown>
                      </td>
                      <td><input className="form-input u-w-130" type="number" min="0" placeholder="if needed" value={r.value ?? ''} onChange={e => set({ value: e.target.value })} /></td>
                      <td>{shown ? <strong>{shown[1]}</strong> : <span className="admin__count">Filing not found</span>}</td>
                      <td className="admin__actions">
                        <span {...quickDrag.gripProps(i)} style={{ ...quickDrag.gripProps(i).style, fontSize: 18, lineHeight: 1, padding: '0 6px' }}>⠿</span>
                        <button type="button" className="btn-outline btn-outline--sm" disabled={i === 0} onClick={() => update(n => { n.quickRef = n.quickRef || clone(DEFAULT_CONFIG.quickRef); [n.quickRef[i - 1], n.quickRef[i]] = [n.quickRef[i], n.quickRef[i - 1]] })}>↑</button>
                        <button type="button" className="btn-outline btn-outline--sm" disabled={i === quickRows.length - 1} onClick={() => update(n => { n.quickRef = n.quickRef || clone(DEFAULT_CONFIG.quickRef); [n.quickRef[i + 1], n.quickRef[i]] = [n.quickRef[i], n.quickRef[i + 1]] })}>↓</button>
                        <button type="button" className="btn-outline btn-outline--sm btn-outline--danger" onClick={() => update(n => { n.quickRef = n.quickRef || clone(DEFAULT_CONFIG.quickRef); n.quickRef.splice(i, 1) })}>Remove</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Notes shown beside the calculator result */}
      {section === 'notes' && (
        <>
          <div className="admin__toolbar">
            <p className="admin__hint">Notes are listed under "Important Notes" in the calculator, in this order.</p>
            <button type="button" className="btn-gold" onClick={() => update(n => { n.notes.push('') })}>+ Add note</button>
          </div>
          {cfg.notes.length === 0 && <p className="admin__empty">No notes</p>}
          {noteDrag.ordered(cfg.notes.map((note, i) => ({ note, i })), x => x.i).map(({ note, i }) => (
            <div key={i} ref={noteDrag.rowRef(i)} style={noteDrag.rowStyle(i)} className="admin__toolbar u-items-start">
              <span {...noteDrag.gripProps(i)} style={{ ...noteDrag.gripProps(i).style, fontSize: 18, lineHeight: 1, padding: '6px 6px 0' }}>⠿</span>
              <textarea className="form-input u-flex-1 u-maxw-none" rows={2} value={note}
                onChange={e => update(n => { n.notes[i] = e.target.value })} />
              <button type="button" className="btn-outline btn-outline--sm" disabled={i === 0} onClick={() => update(n => { [n.notes[i - 1], n.notes[i]] = [n.notes[i], n.notes[i - 1]] })}>↑</button>
              <button type="button" className="btn-outline btn-outline--sm" disabled={i === cfg.notes.length - 1} onClick={() => update(n => { [n.notes[i + 1], n.notes[i]] = [n.notes[i], n.notes[i + 1]] })}>↓</button>
              <button type="button" className="btn-outline btn-outline--sm btn-outline--danger" onClick={() => update(n => { n.notes.splice(i, 1) })}>Remove</button>
            </div>
          ))}
        </>
      )}

      {/* Filing editor */}
      {editing && (
        <ModalPortal>
          <div className="overlay" {...overlay}>
            <div className="modal modal--md" onClick={e => e.stopPropagation()}>
              <h3 className="section-title">{editing.isNew ? 'Add filing' : 'Edit filing'} — {COURT_TYPES.find(t => t.value === editing.caseType)?.label}</h3>
              <div className="admin__form">
                <div className="form-group admin__form-group--full">
                  <label className="form-label">Filing name *</label>
                  <input className="form-input" value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Fee type</label>
                  <Dropdown className="form-input" value={editing.kind} onChange={e => setEditing({ ...editing, kind: e.target.value })}>
                    {FEE_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </Dropdown>
                </div>
                {editing.kind === 'fixed' && (
                  <div className="form-group">
                    <label className="form-label">Fixed fee (₹) *</label>
                    <input className="form-input" type="number" min="0" step="any" value={editing.amount} onChange={e => setEditing({ ...editing, amount: e.target.value })} />
                  </div>
                )}
                {editing.kind === 'scale' && (
                  <div className="form-group">
                    <label className="form-label">Fee scale</label>
                    <Dropdown className="form-input" value={editing.scale} onChange={e => setEditing({ ...editing, scale: e.target.value })}>
                      {Object.entries(SCALE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Dropdown>
                  </div>
                )}
                {editing.kind !== 'fixed' && (
                  <>
                    <div className="form-group admin__form-group--full">
                      <label className="form-label">Label of the value the user enters</label>
                      <input className="form-input" placeholder="e.g. Amount claimed (₹)" value={editing.valueLabel} onChange={e => setEditing({ ...editing, valueLabel: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Value multiplier (optional)</label>
                      <input className="form-input" type="number" min="0" step="any" placeholder="e.g. 10 for maintenance" value={editing.mult} onChange={e => setEditing({ ...editing, mult: e.target.value })} />
                    </div>
                  </>
                )}
                <div className="form-group admin__form-group--full">
                  <label className="form-label">Reference (section / article)</label>
                  <input className="form-input" placeholder="e.g. Sch. II, Art. 17(vi)" value={editing.ref} onChange={e => setEditing({ ...editing, ref: e.target.value })} />
                </div>
              </div>
              {formError && <p className="admin__hint admin__hint--error">{formError}</p>}
              <div className="form-actions">
                <button type="button" className="btn-outline" onClick={closeEditor}>Cancel</button>
                <button type="button" className="btn-gold" onClick={saveFiling}>Done</button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}
