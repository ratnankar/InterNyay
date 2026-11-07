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

// Rupee text for the case types table
const rupees = n => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })

// A blank number box is saved as "not set"; anything else must be a number
const numOrNull = v => (v === '' || v === null || v === undefined ? null : Number(v))

// Short description of what a case type charges
function feeSummary(f) {
  if (f.kind === 'fixed') return Number(f.amount) === 0 ? 'Nil' : `Fixed ${rupees(f.amount)}`
  if (f.kind === 'adv')   return 'Ad valorem scale'
  if (f.kind === 'half')  return 'Half of ad valorem'
  return SCALE_NAMES[f.scale] || 'Own fee scale'
}

// Admin screen for the court fee calculator: the fee of each case type, fee scales and notes
export default function FeeCalculatorAdmin() {
  const { addToast } = useApp()
  const [cfg, setCfg] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  // True for a few seconds right after a successful save, so "Saved" shows once and then goes away
  const [justSaved, setJustSaved] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [section, setSection] = useSessionState('admin_fee_section', 'types')
  // Case type rule in the editor (null when closed) and its error
  const [editing, setEditing] = useState(null)
  const [formError, setFormError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  // Previewing the rules being edited
  const [previewValue, setPreviewValue] = useState('')
  // The fee scale shown in the Fee scales tab (the State tables have hundreds of rows, so one is shown at a time)
  const [scaleName, setScaleName] = useState('adValoremDelhi')
  const quickRows = cfg?.quickRef || DEFAULT_CONFIG.quickRef

  // Load the saved rules
  const load = useCallback(() => {
    setLoadError('')
    api.admin.feeCalculator.get()
      .then(r => {
        const c = clone(r?.config || DEFAULT_CONFIG)
        if (!Array.isArray(c.caseTypes)) c.caseTypes = clone(DEFAULT_CONFIG.caseTypes)
        if (!Array.isArray(c.quickRef)) c.quickRef = clone(DEFAULT_CONFIG.quickRef)   // rules saved before Quick Reference was editable
        // Rules saved before the State tables existed get the built-in States and State scales
        if (!Array.isArray(c.jurisdictions) || !c.jurisdictions.length) c.jurisdictions = clone(DEFAULT_CONFIG.jurisdictions)
        c.scales = c.scales || {}
        Object.keys(DEFAULT_CONFIG.scales).forEach(k => { if (!c.scales[k]) c.scales[k] = clone(DEFAULT_CONFIG.scales[k]) })
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

  const typeRules = useMemo(() => COURT_TYPES.map(t => ({ t, i: (cfg?.caseTypes || []).findIndex(r => r.caseType === t.value) })), [cfg])

  const quickDrag = useDragReorder(quickRows.map((_, i) => i), (_start, finalKeys) => update(n => {
    const src = n.quickRef || clone(DEFAULT_CONFIG.quickRef)
    n.quickRef = finalKeys.map(k => src[Number(k)])
  }))
  const noteDrag = useDragReorder((cfg?.notes || []).map((_, i) => i), (_start, finalKeys) => update(n => {
    n.notes = finalKeys.map(k => n.notes[Number(k)])
  }))

  function saveRule() {
    const f = editing
    if (!f.label.trim()) return setFormError('Enter the fee name')
    if (f.kind === 'fixed' && (f.amount === '' || Number(f.amount) < 0)) return setFormError('Enter the fixed fee (0 for no fee)')
    if (f.mult !== '' && !(Number(f.mult) > 0)) return setFormError('The multiplier must be above 0, or left blank')
    const out = { caseType: f.caseType, label: f.label.trim(), kind: f.kind, ref: f.ref.trim() }
    if (f.kind === 'fixed') out.amount = Number(f.amount)
    if (f.kind === 'scale') out.scale = f.scale
    if (f.kind !== 'fixed') {
      if (f.mult !== '' && Number(f.mult) !== 1) out.mult = Number(f.mult)
      out.valueLabel = f.valueLabel.trim() || 'Claim / Subject Matter Value (₹)'
    }
    update(n => {
      const at = n.caseTypes.findIndex(r => r.caseType === f.caseType)
      if (at >= 0) n.caseTypes[at] = out
      else n.caseTypes.push(out)
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
    if (COURT_TYPES.some(t => !c.caseTypes.some(r => r.caseType === t.value))) return 'Every case type needs a fee'
    if (!c.jurisdictions.length) return 'Add at least one State'
    if (c.jurisdictions.some(j => !String(j.label).trim())) return 'Every State needs a name'
    if (c.jurisdictions.some(j => !c.scales[j.scale])) return 'Every State needs a fee scale'
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
    c.jurisdictions = c.jurisdictions.map(j => ({ key: j.key, label: String(j.label).trim(), scale: j.scale, notes: (j.notes || []).map(x => String(x).trim()).filter(Boolean) }))
    c.notes = c.notes.map(x => String(x).trim()).filter(Boolean)
    c.quickRef = (c.quickRef || []).map(r => {
      const o = { label: String(r.label || '').trim(), mode: r.mode === 'caseType' ? 'caseType' : 'adv' }
      const v = numOrNull(r.value)
      if (v !== null) o.value = v
      if (o.mode === 'caseType') o.caseType = r.caseType
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
  // Helpers for the States tab
  const setState = (i, patch) => update(n => { Object.assign(n.jurisdictions[i], patch) })
  const moveState = (i, dir) => update(n => { const j = n.jurisdictions; [j[i], j[i + dir]] = [j[i + dir], j[i]] })

  return (
    <div>
      <div className="admin__toolbar">
        {[['types', 'Case types'], ['states', 'States'], ['scales', 'Fee scales'], ['quick', 'Quick reference'], ['notes', 'Notes']].map(([id, label]) => (
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

      {section === 'types' && (
        <>
          <div className="admin__toolbar">
            <p className="admin__hint">Each case type has one fee. The calculator shows it as soon as the user picks the case type, asking for a claim value only when the fee depends on one.</p>
          </div>
          <div className="admin__table-wrap">
            <table className="admin__table">
              <thead><tr><th>Case type</th><th>Fee name</th><th>Fee</th><th>Reference</th><th /></tr></thead>
              <tbody>
                {typeRules.map(({ t, i }) => {
                  const f = i >= 0 ? cfg.caseTypes[i] : null
                  return (
                    <tr key={t.value}>
                      <td><strong>{t.label}</strong></td>
                      <td className="admin__multiline">{f ? f.label : <span className="admin__count">Not set</span>}</td>
                      <td>{f ? `${feeSummary(f)}${f.mult > 1 ? ` × ${f.mult} value` : ''}` : '—'}</td>
                      <td className="admin__multiline">{f?.ref || '—'}</td>
                      <td className="admin__actions">
                        <button type="button" className="btn-outline btn-outline--sm" onClick={() => {
                          setFormError('')
                          setEditing(f
                            ? { ...f, amount: f.amount ?? '', mult: f.mult ?? '', valueLabel: f.valueLabel || '', ref: f.ref || '', scale: f.scale || 'adValorem' }
                            : { caseType: t.value, label: '', kind: 'adv', amount: '', scale: 'adValorem', mult: '', valueLabel: '', ref: '' })
                        }}>Edit</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* States: which ad valorem scale each State / Union Territory of the calculator charges */}
      {section === 'states' && (
        <>
          <div className="admin__toolbar">
            <p className="admin__hint">
              The calculator lets the user pick one of these States for ad valorem fees (plaints, appeals, reviews). Each State uses one of the ad valorem
              fee scales (edited in Fee scales); its notes, one per line, are shown with the result. The first State is the default.
            </p>
            <button type="button" className="btn-gold" onClick={() => update(n => {
              n.jurisdictions.push({ key: makeKey('state', new Set(n.jurisdictions.map(x => x.key))), label: '', scale: 'adValorem', notes: [] })
            })}>+ Add State</button>
          </div>
          <div className="admin__table-wrap">
            <table className="admin__table">
              <thead><tr><th>State / Union Territory</th><th>Ad valorem scale</th><th>Notes (one per line)</th><th /></tr></thead>
              <tbody>
                {cfg.jurisdictions.map((j, i) => (
                  <tr key={j.key}>
                    <td>
                      <input className="form-input" value={j.label} onChange={e => setState(i, { label: e.target.value })} />
                      {i === 0 && <span className="admin__count">Default</span>}
                    </td>
                    <td>
                      <Dropdown className="form-input" value={j.scale} onChange={e => setState(i, { scale: e.target.value })}>
                        {Object.entries(SCALE_NAMES).filter(([k]) => k.startsWith('adValorem')).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </Dropdown>
                    </td>
                    <td>
                      <textarea className="form-input u-maxw-none" rows={3} value={(j.notes || []).join('\n')}
                        onChange={e => setState(i, { notes: e.target.value.split('\n') })} />
                    </td>
                    <td className="admin__actions">
                      <button type="button" className="btn-outline btn-outline--sm" disabled={i === 0} onClick={() => moveState(i, -1)} title="Move up">↑</button>
                      <button type="button" className="btn-outline btn-outline--sm" disabled={i === cfg.jurisdictions.length - 1} onClick={() => moveState(i, 1)} title="Move down">↓</button>
                      {cfg.jurisdictions.length > 1 && (
                        <button type="button" className="btn-outline btn-outline--sm btn-outline--danger" onClick={() => update(n => { n.jurisdictions.splice(i, 1) })}>Remove</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Fee scales: the value bands behind the ad valorem (one per State), consumer, probate and succession fees */}
      {section === 'scales' && (
        <>
          <div className="admin__toolbar">
            {Object.entries(SCALE_NAMES).map(([k, v]) => (
              <button type="button" key={k} className={scaleName === k ? 'btn-gold btn-outline--sm' : 'btn-outline btn-outline--sm'} onClick={() => setScaleName(k)}>{v}</button>
            ))}
          </div>
          <p className="admin__hint">
            Each band runs from the previous band's upper limit to its own. A band charges either a % of the whole value, a base fee plus an
            amount for every block of the given size (or part of one) above where the band starts, or just the base fee. The last band has no upper limit.
            In a State table every band is a flat fee for values up to its limit, and the last band adds the fee per block above the last listed value.
          </p>
          {Object.entries(SCALE_NAMES).filter(([name]) => name === scaleName).map(([name, label]) => {
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
            <strong>Try this scale</strong>
            <input className="form-input u-w-160" type="number" min="0" placeholder="Value (₹)" value={previewValue} onChange={e => setPreviewValue(e.target.value)} />
            <span className="admin__count">{pv > 0 ? `Fee: ${rupees(preview.feeOfScale(scaleName, pv))}` : 'Enter a value to see the fee'}</span>
          </div>
        </>
      )}

      {/* Quick Reference: example fees listed beside the calculator */}
      {section === 'quick' && (
        <>
          <div className="admin__toolbar">
            <p className="admin__hint">Example fees shown in the "Quick Reference" card. The fee is calculated from the rules above, so it always matches the calculator. Ad valorem rows are shown here for the first (default) State.</p>
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
                        <Dropdown className="form-input" value={r.mode === 'caseType' ? r.caseType : 'adv'}
                          onChange={e => {
                            const v = e.target.value
                            if (v === 'adv') set({ mode: 'adv', caseType: undefined })
                            else set({ mode: 'caseType', caseType: v })
                          }}>
                          <option value="adv">Ad valorem scale (civil suit)</option>
                          {COURT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </Dropdown>
                      </td>
                      <td><input className="form-input u-w-130" type="number" min="0" placeholder="if needed" value={r.value ?? ''} onChange={e => set({ value: e.target.value })} /></td>
                      <td>{shown ? <strong>{shown[1]}</strong> : <span className="admin__count">Case type not found</span>}</td>
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
            <p className="admin__hint">Notes are listed under "Important Notes" in the calculator, in this order, after the State's own notes (edited in the States tab).</p>
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

      {/* Case type fee editor */}
      {editing && (
        <ModalPortal>
          <div className="overlay" {...overlay}>
            <div className="modal modal--md" onClick={e => e.stopPropagation()}>
              <h3 className="section-title">Edit fee — {COURT_TYPES.find(t => t.value === editing.caseType)?.label}</h3>
              <div className="admin__form">
                <div className="form-group admin__form-group--full">
                  <label className="form-label">Fee name *</label>
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
                <button type="button" className="btn-gold" onClick={saveRule}>Done</button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}
