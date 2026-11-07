import { useState, useMemo } from 'react'
import Dropdown from '../components/common/Dropdown'
import Icon from '../components/common/Icon'
import useFeeRules from '../hooks/useFeeRules'
import useSessionState from '../hooks/useSessionState'
import { COURT_TYPES } from '../utils/courtFeesAct'

// Format a number as Indian rupees (paise only when present)
function fmt(n) {
  const x = Number(n)
  return '₹' + x.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(x) ? 0 : 2, maximumFractionDigits: 2 })
}

// Court Fee Calculator page: estimates the court fee under the Court Fees Act, 1870
export default function CourtFeeCalculator() {
  // Fee rules, fee scales and notes, as set by the admin
  const rules = useFeeRules()
  const { ruleOf, matterNeedsValue, chargeableValue, calcFee, consumerForum, jurisdictions, jurisdictionOf, usesJurisdiction } = rules
  // Selected case type, claim value and whether Calculate was clicked
  const [caseType,    setCaseType]    = useState('civil')
  const [claimValue,  setClaimValue]  = useState('')
  const [calculated,  setCalculated]  = useState(false)
  // State / Union Territory whose ad valorem table applies (remembered for the session; the first listed State is the default)
  const [stateKey,   setStateKey]   = useSessionState('fee_calc_state', '')

  // The fee rule of the chosen case type, whether it needs a claim value, and the claim value as a number
  const matter     = ruleOf(caseType)
  const needsValue = !!matter && matterNeedsValue(matter)
  const cv         = parseFloat(claimValue) || 0

  // The State chosen, and whether it matters for this case type (only ad valorem fees differ between States)
  const state      = jurisdictionOf(stateKey)
  const byState    = usesJurisdiction(matter)

  // Court fee for the chosen case type
  const courtFee   = useMemo(() => calcFee(matter, cv, state.key), [matter, cv, state, rules])
  const isReady    = !!matter && (!needsValue || cv > 0) && calculated

  // Hide the result so it must be calculated again after any input changes
  const reset = () => setCalculated(false)
  // Switching case type shows that type's fee rule
  const pickType = value => { setCaseType(value); reset() }

  return (
    <div>
      {/* Page title and subtitle */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Court Fee Calculator</h1>
          <p className="page-subtitle">Court fees under the Court Fees Act, 1870 (Schedules I and II)</p>
        </div>
      </div>

      {/* Left: inputs. Right: result and reference cards */}
      <div className="calculator__layout">
        {/* Input steps and the Calculate button */}
        <div className="calculator__left">

          <div className="card calc-step">
            {/* Step 1: choose the case type */}
            <p className="calc-step__label">Step 1 — Select Case Type</p>
            <div className="calc-type-grid">
              {COURT_TYPES.map(ct => (
                <button key={ct.value}
                  className={`calc-type-btn${caseType === ct.value ? ' calc-type-btn--active' : ''}`}
                  onClick={() => pickType(ct.value)}>
                  <div className="calc-type-btn__icon"><Icon name={ct.icon} /></div>
                  <p className="calc-type-btn__label">{ct.label}</p>
                  <p className="calc-type-btn__desc">{ct.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="card calc-step">
            {/* Step 2: the fee rule of the case type and the claim value (when needed) */}
            <p className="calc-step__label">Step 2 — Case Details</p>
            <div className="calc-details-grid">
              {/* State / Union Territory, for the fees that differ between States */}
              {byState && (
                <div>
                  <label className="form-label">State / Union Territory</label>
                  <Dropdown className="form-input" value={state.key}
                    onChange={e => { setStateKey(e.target.value); reset() }}>
                    {jurisdictions.map(j => <option key={j.key} value={j.key}>{j.label}</option>)}
                  </Dropdown>
                </div>
              )}

              {/* Claim value input, or a 'fixed fee' badge when no value is needed */}
              {!matter ? (
                <div>
                  <label className="form-label">Fee Type</label>
                  <div className="calc-fixed-badge">No fee set up for this case type</div>
                </div>
              ) : needsValue ? (
                <div>
                  <label className="form-label">{matter.valueLabel || 'Claim / Subject Matter Value (₹)'}</label>
                  <div className="form-input-wrap">
                    <span className="form-input-prefix">₹</span>
                    <input className="form-input form-input--prefix" type="number" min="0"
                      placeholder="e.g. 500000" value={claimValue}
                      onChange={e => { setClaimValue(e.target.value); reset() }} />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="form-label">Fee Type</label>
                  <div className="calc-fixed-badge">Fixed Fee (no claim value needed)</div>
                </div>
              )}
            </div>

            {/* Fee estimate, shown right under the case details with the Calculate button beside it */}
            <div className="calc-estimate">
              <div className="calc-estimate__info">
                <p className="calc-estimate__label">
                  Fee Estimate • {COURT_TYPES.find(c => c.value === caseType)?.label} • {byState ? state.label : 'Court Fees Act, 1870'}
                </p>
                {!isReady ? (
                  <p className="calc-estimate__hint">Fill in the details and click <strong>Calculate Court Fee</strong></p>
                ) : (
                  <>
                    <p className="calc-estimate__amount">{courtFee === 0 ? 'Nil' : fmt(courtFee)}</p>
                    <p className="calc-estimate__basis">
                      {matter.label}{matter.ref ? <> — {matter.ref}</> : null}
                      {needsValue && cv > 0 && matter.kind !== 'scale' && <> • on value of {fmt(chargeableValue(matter, cv))}</>}
                      {matter.mult > 1 && cv > 0 && <> ({matter.mult} × {fmt(cv)})</>}
                      {matter.kind === 'half' && <> • half of the ad valorem fee</>}
                      {caseType === 'consumer' && cv > 0 && <> • Forum by value: {consumerForum(cv)}</>}
                      {' • Court fees are not subject to GST.'}
                    </p>
                  </>
                )}
              </div>
              <button type="button" className="btn-gold calc-submit-btn calc-estimate__btn" disabled={!matter}
                onClick={() => setCalculated(true)}>
                Calculate Court Fee <Icon name="arrow-right" />
              </button>
            </div>
          </div>
        </div>

        {/* Right: notes and quick reference */}
        <div className="calculator__right">
          {/* Important notes card */}
          <div className="card calc-info-card">
            <p className="calc-info-card__title"><Icon name="pin" /> Important Notes</p>
            {[...(byState ? state.notes || [] : []), ...rules.notes].map((note, i) => (
              <div key={i} className="calc-info-card__note-row">
                <span className="calc-info-card__bullet">•</span>
                <p className="calc-info-card__note">{note}</p>
              </div>
            ))}
          </div>

          <div className="card calc-info-card">
            {/* Quick reference card */}
            <p className="calc-info-card__title"><Icon name="bolt" /> Quick Reference</p>
            <p className="calc-info-card__sub">Ad valorem fees for {state.label}</p>
            {rules.quickRefFor(state.key).map(([label, fee]) => (
              <div key={label} className="calc-quick-row">
                <p className="calc-quick-row__label">{label}</p>
                <p className="calc-quick-row__fee">{fee}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
