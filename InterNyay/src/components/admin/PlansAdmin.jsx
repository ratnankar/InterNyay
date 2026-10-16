import { useEffect, useState } from 'react'
import api from '../../services/api'
import { useApp } from '../../context/AppContext'
import { getErrorMessage } from '../../utils/errorMessages'
import ErrorMessage from '../common/ErrorMessage'
import Dropdown from '../common/Dropdown'
import { discountPercent } from '../../constants/plans'
import useSessionState from '../../hooks/useSessionState'

// A blank price field is saved as no price (null), not as 0
const priceOrNull = v => (v === '' || v === null || v === undefined ? null : Number(v))

// Returns an error message when the discount price is not usable, otherwise ''
// (label is '' for the monthly price and 'yearly ' for the yearly one, only used in the messages)
function discountError(price, discountPrice, label = '') {
  if (discountPrice === '' || discountPrice === null || discountPrice === undefined) return ''
  if (Number(discountPrice) < 0) return `The ${label}discount price must be 0 or more, or left blank`
  if (price === '' || price === null || price === undefined || Number(price) <= 0) return `Enter a ${label}price before adding a ${label}discount price`
  if (Number(discountPrice) >= Number(price)) return `The ${label}discount price must be lower than the ${label}price`
  return ''
}

const PERIOD_FIELDS = {
  month: { price: 'priceMonthly', discount: 'discountPrice', free: 'freeMonthly' },
  year: { price: 'priceYearly', discount: 'discountPriceYearly', free: 'freeYearly' },
}
const isBlank = v => v === '' || v === null || v === undefined
const isZero = v => !isBlank(v) && Number(v) === 0
const hasPositivePrice = v => !isBlank(v) && Number(v) > 0

// A plan that is free for the year is free by the month too: whenever the yearly side turns free, the monthly side follows
function monthlyFreeToo(plan) {
  const m = PERIOD_FIELDS.month
  return { [m.free]: true, ...(hasPositivePrice(plan[m.price]) ? { [m.discount]: '0' } : {}) }
}

function freePatch(plan, period, checked) {
  const f = PERIOD_FIELDS[period]
  if (checked) {
    return {
      [f.free]: true,
      ...(hasPositivePrice(plan[f.price]) ? { [f.discount]: '0' } : {}),
      ...(period === 'year' ? monthlyFreeToo(plan) : {}),
    }
  }
  return { [f.free]: false, ...(isZero(plan[f.discount]) ? { [f.discount]: '' } : {}) }
}

function discountPatch(plan, period, value) {
  const f = PERIOD_FIELDS[period]
  if (isZero(value) && hasPositivePrice(plan[f.price])) {
    return { [f.discount]: value, [f.free]: true, ...(period === 'year' ? monthlyFreeToo(plan) : {}) }
  }
  if (isZero(plan[f.discount])) return { [f.discount]: value, [f.free]: false }
  return { [f.discount]: value }
}

function yearlyFreeError(plan) {
  return plan.freeYearly && !hasPositivePrice(plan.priceYearly) ? 'Enter a yearly price before making the yearly plan free' : ''
}

// Shows the automatically calculated discount for the values typed so far
function DiscountPreview({ price, discountPrice, label = 'Discount %' }) {
  const pct = discountPercent(price, discountPrice)
  return (
    <div className="form-group"><label className="form-label">{label}</label>
      <input className="form-input" readOnly tabIndex={-1} value={pct ? `${pct}% off` : '—'} title="Calculated automatically" /></div>
  )
}


// One tick box, same height as the inputs next to it
const Toggle = ({ checked, onChange, children, title, disabled = false }) => (
  <label className="plans-admin__free plans-admin__toggle" title={title}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} /> <span>{children}</span>
  </label>
)

// Price, discount and free tick for one billing period
function PricingRow({ title, unit, v, period, patch }) {
  const f = PERIOD_FIELDS[period]
  return (
    <div className="plans-admin__section">
      <h4 className="plans-admin__section-title">{title}</h4>
      <div className="plans-admin__grid plans-admin__grid--4">
        <div className="form-group"><label className="form-label">Price ({unit})</label>
          <input className="form-input" type="number" min="0" placeholder="Blank = no price" value={v[f.price] ?? ''}
            onChange={e => patch({ [f.price]: e.target.value })} /></div>
        <div className="form-group"><label className="form-label">Discount price ({unit})</label>
          <input className="form-input" type="number" min="0" placeholder="Blank = no discount" value={v[f.discount] ?? ''}
            onChange={e => patch(discountPatch(v, period, e.target.value))} /></div>
        <DiscountPreview price={v[f.price]} discountPrice={v[f.discount]} />
        <div className="form-group"><label className="form-label">Free</label>
          {/* The monthly plan cannot be switched off while the yearly plan is free: yearly free means monthly free */}
          <Toggle
            checked={!!v[f.free] || (period === 'month' && !!v.freeYearly)}
            disabled={period === 'month' && !!v.freeYearly}
            title={period === 'month' && v.freeYearly ? 'The yearly plan is free, so the monthly plan is free too' : undefined}
            onChange={e => patch(freePatch(v, period, e.target.checked))}>Free (100% off)</Toggle></div>
      </div>
    </div>
  )
}

// Fields shared by the "New plan" form and every plan card, laid out in the same groups
function PlanFields({ v, patch, isNew, canDisable }) {
  return (
    <>
      <div className="plans-admin__grid plans-admin__grid--3">
        {isNew && (
          <div className="form-group"><label className="form-label">Code</label>
            <input className="form-input" placeholder="GOLD" maxLength={30} autoFocus value={v.code}
              onChange={e => patch({ code: e.target.value.toUpperCase() })} /></div>
        )}
        <div className="form-group"><label className="form-label">Name</label>
          <input className="form-input" placeholder={isNew ? 'Gold' : undefined} value={v.name}
            onChange={e => patch({ name: e.target.value })} /></div>
        <div className="form-group"><label className="form-label">Associates</label>
          <input className="form-input" type="number" min="-1" value={v.associateLimit}
            onChange={e => patch({ associateLimit: e.target.value })} /></div>
        {!isNew && (
          <div className="form-group"><label className="form-label">Display order</label>
            <input className="form-input" type="number" value={v.sortOrder}
              onChange={e => patch({ sortOrder: e.target.value })} /></div>
        )}
      </div>

      <PricingRow title="Monthly price" unit="₹/month" v={v} period="month" patch={patch} />
      <PricingRow title="Yearly price" unit="₹/year" v={v} period="year" patch={patch} />

      <div className="form-group"><label className="form-label">Tagline</label>
        <input className="form-input" value={v.tagline || ''} onChange={e => patch({ tagline: e.target.value })} /></div>

      <div className="plans-admin__section">
        <h4 className="plans-admin__section-title">Visibility</h4>
        <div className="form-group"><label className="form-label">Shown to</label>
          <Dropdown searchable={false} className="form-input" value={v.audience || 'ADVOCATE'} onChange={e => patch({ audience: e.target.value })}>
            <option value="ADVOCATE">Advocates (landing page and My Plan)</option>
            <option value="BUSINESS">Business accounts only (hidden from advocates)</option>
            <option value="BOTH">Both advocates and business accounts</option>
          </Dropdown></div>
        <div className="plans-admin__grid plans-admin__grid--3 plans-admin__toggles">
          <Toggle checked={!!v.comingSoon} onChange={e => patch({ comingSoon: e.target.checked })}
            title="Not open for sign-up yet">Coming soon</Toggle>
          <Toggle checked={!!v.mostPopular} onChange={e => patch({ mostPopular: e.target.checked })}
            title="Shows the Most popular badge">Most popular</Toggle>
          {canDisable && (
            <Toggle checked={v.enabled === false} onChange={e => patch({ enabled: !e.target.checked })}
              title="Hidden from everyone, cannot be chosen or assigned">Disable this plan</Toggle>
          )}
        </div>
      </div>
    </>
  )
}

// Moves every advocate on one plan to another plan: Check shows who would move, then Move all confirms it
// One-line price shown on a collapsed plan card
function priceSummary(p) {
  if (p.freeMonthly || p.freeYearly) return 'Free'
  const raw = p.discountPrice !== '' && p.discountPrice != null ? p.discountPrice : p.priceMonthly
  if (raw === '' || raw == null) return 'Contact us'
  return Number(raw) <= 0 ? 'Free' : `₹${raw}/month`
}

// Label for a plan in a list: its name, with the code added only when another plan has the same name
function planLabel(p, plans) {
  return plans.filter(x => x.name === p.name).length > 1 ? `${p.name} (${p.code})` : p.name
}

function MovePlanUsers({ plans, onMoved }) {
  const { addToast } = useApp()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Changing either plan clears the earlier check
  const pick = (setter) => (e) => { setter(e.target.value); setPreview(null); setError('') }
  const nameOf = code => plans.find(p => p.code === code)?.name || code

  async function run(dryRun) {
    if (busy) return
    if (!from || !to) return setError('Choose both plans')
    if (from === to) return setError('Choose two different plans')
    setBusy(true)
    setError('')
    try {
      const res = await api.admin.plans.migrate({ fromCode: from, toCode: to, dryRun })
      if (dryRun) {
        setPreview(res)
      } else {
        setPreview(null)
        addToast(`${res.moved} ${res.moved === 1 ? 'account' : 'accounts'} moved from ${nameOf(from)} to ${nameOf(to)}`
          + (res.skipped.length ? `, ${res.skipped.length} left as they are` : ''))
        onMoved?.()
      }
    } catch (e) {
      setError(getErrorMessage(e, 'Could not move the accounts'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="plans-admin__card">
      <h3 className="u-mt-0">Move all accounts to another plan</h3>
      <p className="admin__hint">
        Switches every advocate on one plan to another plan in one go. Check first to see who would move.
        Advocates with more associates than the new plan allows stay on their old plan and are listed.
      </p>
      <div className="plans-admin__grid plans-admin__grid--2">
        <div className="form-group"><label className="form-label">From plan</label>
          <Dropdown searchable={false} className="form-input" value={from} onChange={pick(setFrom)}>
            <option value="">Select a plan</option>
            {plans.map(p => <option key={p.code} value={p.code}>{planLabel(p, plans)}</option>)}
          </Dropdown></div>
        <div className="form-group"><label className="form-label">To plan</label>
          <Dropdown searchable={false} className="form-input" value={to} onChange={pick(setTo)}>
            <option value="">Select a plan</option>
            {plans.filter(p => p.code !== from && p.enabled !== false && !p.comingSoon)
              .map(p => <option key={p.code} value={p.code}>{planLabel(p, plans)}</option>)}
          </Dropdown></div>
      </div>

      {preview && (
        <div className="plans-admin__section">
          <p className="u-m-0">
            <strong>{preview.moved}</strong> of {preview.total} {preview.total === 1 ? 'account' : 'accounts'} on {nameOf(preview.fromCode)} will
            move to {nameOf(preview.toCode)}.
          </p>
          {preview.skipped.length > 0 && (
            <>
              <p className="admin__hint">These {preview.skipped.length === 1 ? 'account stays' : 'accounts stay'} on {nameOf(preview.fromCode)}:</p>
              <ul className="plans-admin__preview-list">
                {preview.skipped.map(u => <li key={u.id}>{u.name} ({u.email}): {u.reason}</li>)}
              </ul>
            </>
          )}
        </div>
      )}

      <ErrorMessage message={error} />
      <div className="plans-admin__actions">
        <button type="button" className="btn-outline" onClick={() => run(true)} disabled={busy || !from || !to}>
          {busy && !preview ? 'Checking…' : 'Check'}
        </button>
        {preview && preview.moved > 0 && (
          <button type="button" className="btn-gold" onClick={() => run(false)} disabled={busy}>
            {busy ? 'Moving…' : `Move ${preview.moved} ${preview.moved === 1 ? 'account' : 'accounts'}`}
          </button>
        )}
      </div>
    </div>
  )
}

// Admin screen for editing the subscription plans
export default function PlansAdmin() {
  const { addToast } = useApp()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  // Catalog of app features a plan can unlock
  const [catalog, setCatalog] = useState({})

  // The "Add plan" form: null while closed, otherwise the fields being typed
  const [adding, setAdding] = useState(null)
  const [addError, setAddError] = useState('')
  const [creating, setCreating] = useState(false)
  // Plan cards that are expanded, by code; cards start collapsed so the page stays short
  const [openCodes, setOpenCodes] = useSessionState('admin_plans_open', {})
  const toggleOpen = code => {
    setOpenCodes(o => ({ ...o, [code]: !o[code] }))
    // Collapsing a card also cancels a half-finished "Remove plan" confirmation on it
    setConfirmId(null)
  }
  // Plan waiting for a "Yes, remove" click, and the one being removed
  const [confirmId, setConfirmId] = useState(null)
  const [removingId, setRemovingId] = useState(null)
  // Plan the accounts of the plan being removed are moved to
  const [moveTo, setMoveTo] = useState('')

  // Plans are listed by their display order; plans with the same order keep the order they came in
  const bySortOrder = list => [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  // Loads the plans (also used to refresh the account counts after a move)
  const loadPlans = () => api.admin.plans.list()
    .then(list => setPlans(bySortOrder(list.map(p => ({ ...p, featuresText: (p.features || []).join('\n') })))))
    .catch(e => addToast(getErrorMessage(e, 'Could not load plans'), 'error'))
    .finally(() => setLoading(false))

  // Load the feature catalog and the plans once on mount
  useEffect(() => {
    api.admin.plans.catalog().then(setCatalog).catch(() => {})
    loadPlans()
  }, [])

  // Merges changes into one plan in local state
  const change = (code, patch) => setPlans(ps => ps.map(p => (p.code === code ? { ...p, ...patch } : p)))

  // Two plans are shown to the same people when their audience is the same or either one is BOTH
  const sameAudience = (a, b) => {
    const x = a || 'ADVOCATE'
    const y = b || 'ADVOCATE'
    return x === y || x === 'BOTH' || y === 'BOTH'
  }

  // After a plan becomes "Most popular", the other plans shown to the same people lose the badge (the backend does the same)
  const clearOtherPopular = saved => setPlans(ps => ps.map(x =>
    x.id !== saved.id && x.mostPopular && sameAudience(x.audience, saved.audience)
      ? { ...x, mostPopular: false } : x))

  // Saves one plan to the backend and refreshes it from the response
  async function save(p) {
    const dErr = discountError(p.priceMonthly, p.discountPrice) || discountError(p.priceYearly, p.discountPriceYearly, 'yearly ')
    if (dErr) return addToast(dErr, 'error')
    const fErr = yearlyFreeError(p)
    if (fErr) return addToast(fErr, 'error')
    try {
      const saved = await api.admin.plans.update(p.id, {
        name: p.name,
        tagline: p.tagline || '',
        priceMonthly: priceOrNull(p.priceMonthly),
        discountPrice: priceOrNull(p.discountPrice),
        priceYearly: priceOrNull(p.priceYearly),
        discountPriceYearly: priceOrNull(p.discountPriceYearly),
        comingSoon: !!p.comingSoon,
        freeMonthly: !!p.freeMonthly,
        freeYearly: !!p.freeYearly,
        enabled: p.enabled !== false,
        audience: p.audience || 'ADVOCATE',
        mostPopular: !!p.mostPopular,
        associateLimit: Number(p.associateLimit),
        features: p.featuresText.split('\n'),
        featureKeys: p.featureKeys ?? Object.keys(catalog),
        sortOrder: Number(p.sortOrder),
      })
      change(p.code, { ...saved, usersCount: p.usersCount, featuresText: (saved.features || []).join('\n') })
      // A changed display order moves the card to its new position
      setPlans(bySortOrder)
      // Only one plan per audience keeps the Most popular badge, so the others lose it here as well
      if (saved.mostPopular) clearOtherPopular(saved)
      addToast(`${saved.name} plan saved`)
    } catch (e) {
      addToast(getErrorMessage(e, 'Save failed'), 'error')
    }
  }

  // Opens the Add plan form with empty fields (an already open form keeps what was typed)
  const openAdd = () => {
    setAdding(a => a ?? { code: '', name: '', priceMonthly: '', discountPrice: '', priceYearly: '', discountPriceYearly: '', comingSoon: false, freeMonthly: false, freeYearly: false, enabled: true, audience: 'ADVOCATE', mostPopular: false, associateLimit: '0', tagline: '' })
    setAddError('')
  }

  // Creates the plan, then shows it as a normal card so its features can be set right away
  async function create() {
    if (creating) return

    const code = adding.code.trim()
    if (!code) return setAddError('Enter a plan code, for example GOLD')
    if (!adding.name.trim()) return setAddError('Enter a name for the plan')
    if (adding.priceMonthly !== '' && Number(adding.priceMonthly) < 0) return setAddError('Price must be 0 or more, or left blank')
    if (adding.priceYearly !== '' && Number(adding.priceYearly) < 0) return setAddError('Yearly price must be 0 or more, or left blank')
    const dErr = discountError(adding.priceMonthly, adding.discountPrice) || discountError(adding.priceYearly, adding.discountPriceYearly, 'yearly ')
    if (dErr) return setAddError(dErr)
    const fErr = yearlyFreeError(adding)
    if (fErr) return setAddError(fErr)
    if (adding.associateLimit === '' || Number(adding.associateLimit) < -1) return setAddError('Associates must be -1 (unlimited), 0 or more')

    setCreating(true)
    setAddError('')

    try {
      const saved = await api.admin.plans.create({
        code,
        name: adding.name.trim(),
        tagline: adding.tagline.trim(),
        priceMonthly: priceOrNull(adding.priceMonthly),
        discountPrice: priceOrNull(adding.discountPrice),
        priceYearly: priceOrNull(adding.priceYearly),
        discountPriceYearly: priceOrNull(adding.discountPriceYearly),
        comingSoon: !!adding.comingSoon,
        freeMonthly: !!adding.freeMonthly,
        freeYearly: !!adding.freeYearly,
        enabled: adding.enabled !== false,
        audience: adding.audience,
        mostPopular: !!adding.mostPopular,
        associateLimit: Number(adding.associateLimit),
        features: [],
        featureKeys: [],
        // One after the highest display order, so the new plan always lands at the end
        sortOrder: plans.reduce((m, x) => Math.max(m, Number(x.sortOrder) || 0), 0) + 1,
      })
      setPlans(ps => [...ps, { ...saved, featuresText: (saved.features || []).join('\n') }]
        .map(x => (saved.mostPopular && x.id !== saved.id && x.mostPopular && sameAudience(x.audience, saved.audience)
          ? { ...x, mostPopular: false } : x)))
      setAdding(null)
      setOpenCodes(o => ({ ...o, [saved.code]: true }))
      addToast(`${saved.name} plan added. Set its features on its card at the end of the list and save.`)
      // The new card is the last one in the list: bring it into view
      setTimeout(() => document.getElementById(`plan-${saved.code}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
    } catch (e) {
      setAddError(getErrorMessage(e, 'Could not add the plan'))
    } finally {
      setCreating(false)
    }
  }

  // Opens the remove confirmation for a plan
  const askRemove = p => { setConfirmId(p.id); setMoveTo('') }

  // Removes a plan. Advocates on it are first moved to the chosen plan; the backend refuses the last plan left
  async function remove(p) {
    if (removingId) return
    if (p.usersCount > 0 && !moveTo) return addToast('Choose a plan to move its accounts to', 'error')

    setRemovingId(p.id)
    try {
      await api.admin.plans.remove(p.id, p.usersCount > 0 ? moveTo : undefined)
      setPlans(ps => ps.filter(x => x.id !== p.id))
      setConfirmId(null)
      addToast(p.usersCount > 0 ? `${p.name} plan removed, its accounts moved to ${plans.find(x => x.code === moveTo)?.name || moveTo}` : `${p.name} plan removed`)
      if (p.usersCount > 0) loadPlans()
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not remove the plan'), 'error')
      setConfirmId(null)
    } finally {
      setRemovingId(null)
    }
  }

  // Loading placeholder
  if (loading) return <p>Loading plans…</p>

  return (
    <div className="plans-layout">
      {/* Add plan sits in the empty space to the right of the plan cards */}
      <div className="plans-layout__side">
        <button type="button" className="btn-gold plans-layout__add" onClick={openAdd}>+ Add plan</button>
      </div>
      <div className="plans-admin">
        {/* New plan form, opened by the Add plan button; the plan is added last */}
        {adding && (
          <div className="plans-admin__card plans-admin__card--new">
            <h3 className="u-mt-0">New plan</h3>
            <PlanFields v={adding} patch={patch => setAdding(a => ({ ...a, ...patch }))} isNew canDisable />
            <p className="admin__hint u-m-0" >
              The code cannot be changed later. After adding, set the features and unlocked app features on the new card and save.
            </p>
            <ErrorMessage message={addError} />
            <div className="plans-admin__actions">
              <button type="button" className="btn-outline" onClick={() => setAdding(null)} disabled={creating}>Cancel</button>
              <button type="button" className="btn-gold" onClick={create} disabled={creating}>{creating ? 'Adding…' : 'Add plan'}</button>
            </div>
          </div>
        )}

        {/* One editable card per plan */}
        {plans.map(p => (
          <div className="plans-admin__card" key={p.code} id={`plan-${p.code}`}>
            <div className="plans-admin__head">
              {/* Click the title to expand or collapse the card */}
              <button type="button" className="plans-admin__toggle-head" onClick={() => toggleOpen(p.code)}
                aria-expanded={!!openCodes[p.code]} aria-controls={`plan-body-${p.code}`}>
                <span className="plans-admin__chevron" aria-hidden="true">▸</span>
                <h3 className="u-m-0">{p.code}{p.enabled === false ? ' (disabled)' : ''}</h3>
                <span className="plans-admin__summary">
                  {p.name} · {priceSummary(p)} · {p.usersCount ?? 0} {p.usersCount === 1 ? 'account' : 'accounts'}
                  {p.comingSoon ? ' · Coming soon' : ''}{p.mostPopular ? ' · Most popular' : ''}
                </span>
              </button>
              {/* Every plan can be removed except the last one left; the button only shows once the card is expanded */}
              {openCodes[p.code] && plans.length > 1 && (confirmId === p.id ? (
                <div className="plans-admin__confirm">
                  <span>
                    {p.usersCount > 0
                      ? `${p.usersCount} ${p.usersCount === 1 ? 'account is' : 'accounts are'} on the ${p.name} plan. Move them to:`
                      : `Remove the ${p.name} plan?`}
                  </span>
                  {p.usersCount > 0 && (
                    <Dropdown searchable={false} className="form-input" value={moveTo} onChange={e => setMoveTo(e.target.value)}>
                      <option value="">Select a plan</option>
                      {plans.filter(x => x.code !== p.code && x.enabled !== false && !x.comingSoon)
                        .map(x => <option key={x.code} value={x.code}>{planLabel(x, plans)}</option>)}
                    </Dropdown>
                  )}
                  <button type="button" className="btn-outline" onClick={() => setConfirmId(null)} disabled={removingId === p.id}>Cancel</button>
                  <button type="button" className="btn-danger" onClick={() => remove(p)} disabled={removingId === p.id}>
                    {removingId === p.id ? 'Removing…' : (p.usersCount > 0 ? 'Move and remove' : 'Yes, remove')}
                  </button>
                </div>
              ) : (
                <button type="button" className="btn-outline btn-outline--danger" onClick={() => askRemove(p)}>Remove plan</button>
              ))}
            </div>
            {openCodes[p.code] && (
              <div className="plans-admin__body" id={`plan-body-${p.code}`}>
              <PlanFields v={p} patch={patch => change(p.code, patch)} canDisable />

              {/* Features shown on the plan card, one per line */}
              <div className="form-group"><label className="form-label">Features (one per line)</label>
                <textarea className="form-input" rows={6} value={p.featuresText} onChange={e => change(p.code, { featuresText: e.target.value })} /></div>

              {/* Checkboxes for which app features this plan unlocks */}
              <div className="form-group"><label className="form-label">Unlocked app features (what this plan can actually use)</label>
                <div className="plans-admin__checks">
                  {Object.entries(catalog).map(([key, label]) => {
                    const on = p.featureKeys == null || p.featureKeys.includes(key)
                    return (
                      <label key={key}><input type="checkbox" checked={on} onChange={e => {
                        const cur = p.featureKeys ?? Object.keys(catalog)
                        change(p.code, { featureKeys: e.target.checked ? [...cur, key] : cur.filter(k => k !== key) })
                      }} /> {label}</label>
                    )
                  })}
                </div>
              </div>

              {/* Saves this plan only, kept at the right edge of the card */}
              <div className="plans-admin__actions">
                <button type="button" className="btn-gold" onClick={() => save(p)}>Save Plan</button>
              </div>
            </div>
            )}
          </div>
        ))}

        {/* Move-all sits after the plan cards */}
        <MovePlanUsers plans={plans} onMoved={loadPlans} />
      </div>
    </div>
  )
}
