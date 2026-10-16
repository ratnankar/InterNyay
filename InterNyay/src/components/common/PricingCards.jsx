// Cards for the subscription plans, with a button to choose one and a Monthly / Yearly switch when plans have a yearly price;
// a plan marked comingSoon by the admin shows a "Coming soon" badge and a disabled button; its price is shown if the admin set one, otherwise a short placeholder;
// the plan the admin marked as mostPopular gets the "Most popular" badge
import { useState } from 'react'
import { hasPrice, isFreePlan, hasDiscount, discountPercent, hasYearlyPlans, periodFor, periodSuffix, MONTH, YEAR } from '../../constants/plans'

export default function PricingCards({ plans = [], currentCode, onSelect, cta = 'Choose plan', compact = false, busy = false }) {
  // Billing period picked with the switch (the switch only shows when some plan has a yearly price)
  const [billing, setBilling] = useState(MONTH)

  // Nothing to render until plans are loaded
  if (!plans.length) return null
  const showSwitch = hasYearlyPlans(plans)

  return (
    <>
    {showSwitch && (
      <div className="pricing-switch" role="group" aria-label="Billing period">
        <button type="button" className={billing === MONTH ? 'is-on' : ''} aria-pressed={billing === MONTH} onClick={() => setBilling(MONTH)}>Monthly</button>
        <button type="button" className={billing === YEAR ? 'is-on' : ''} aria-pressed={billing === YEAR} onClick={() => setBilling(YEAR)}>Yearly</button>
      </div>
    )}
    <div className={`pricing-grid${compact ? ' pricing-grid--compact' : ''}`} style={{ '--pricing-cols': plans.length }}>
      {plans.map(p => {
        // Marks the plan the user is already subscribed to and the plan the admin marked as most popular
        const isCurrent = currentCode === p.code
        const isFeatured = !isCurrent && !!p.mostPopular
        // Label for the associate limit (negative means unlimited)
        const seats = p.associateLimit < 0
          ? 'Unlimited associates'
          : p.associateLimit === 0 ? 'No associates' : `${p.associateLimit} associate${p.associateLimit === 1 ? '' : 's'}`
        const isComingSoon = !!p.comingSoon
        // Yearly is only used for plans that have a yearly price; the others keep showing their monthly price
        const period = periodFor(p, showSwitch ? billing : MONTH)
        const isYear = period === YEAR
        const isFree = isFreePlan(p, period)
        const price = isYear ? p.priceYearly : p.priceMonthly
        const offer = isYear ? p.discountPriceYearly : p.discountPrice
        const offerPercent = isYear ? p.discountPercentYearly : p.discountPercent
        // The price is shown whenever the admin set one; a blank price shows a placeholder instead of an empty gap
        const showPrice = hasPrice(p, period)
        // With a discount price the normal price is shown cut and the discount price is the one that stands out
        const discounted = showPrice && !isFree && hasDiscount(p, period)
        const freeOff = isFree && showPrice && Number(price) > 0
        const blankPriceText = isComingSoon ? 'Pricing soon' : 'Contact us'
        return (
          <div key={p.code} className={`pricing-card${isComingSoon ? ' pricing-card--soon' : ''}${isCurrent ? ' pricing-card--current' : ''}${isFeatured ? ' pricing-card--featured' : ''}`}>
            {isCurrent && <span className="pricing-card__badge pricing-card__badge--current">Current plan</span>}
            {isFeatured && !isComingSoon && <span className="pricing-card__badge">Most popular</span>}
            <div className="pricing-card__head">
              <h3 className="pricing-card__name">{p.name}</h3>
              <p className="pricing-card__tag">{p.tagline || '\u00A0'}</p>
            </div>
            <div className="pricing-card__price">
              {isFree ? (
                <>
                  {freeOff && (
                    <span className="pricing-card__price-old" aria-label={`Original price ₹${Number(price).toLocaleString('en-IN')}`}>
                      <del>₹{Number(price).toLocaleString('en-IN')}</del>
                    </span>
                  )}
                  Free
                </>
              ) : !showPrice ? <span className="pricing-card__price--tba">{blankPriceText}</span> : discounted ? (
                <>
                  <span className="pricing-card__price-old" aria-label={`Original price ₹${Number(price).toLocaleString('en-IN')}`}>
                    <del>₹{Number(price).toLocaleString('en-IN')}</del>
                  </span>
                  ₹{Number(offer).toLocaleString('en-IN')}<span>{periodSuffix(period)}</span>
                </>
              ) : <>₹{Number(price).toLocaleString('en-IN')}<span>{periodSuffix(period)}</span></>}
            </div>
            {discounted && (
              <div className="pricing-card__save">{offerPercent ?? discountPercent(price, offer)}% off</div>
            )}
            {freeOff && <div className="pricing-card__save">100% off</div>}
            <div className="pricing-card__seats">{seats}</div>
            <ul className="pricing-card__features">
              {(p.features || []).map((f, i) => <li key={i}>{f}</li>)}
            </ul>
            {isComingSoon && (
              <button type="button" className="lp-btn pricing-card__cta pricing-card__cta--outline pricing-card__cta--soon" disabled>
                Coming soon
              </button>
            )}
            {onSelect && !isCurrent && !isComingSoon && (
              <button type="button" className={`lp-btn pricing-card__cta ${isFeatured ? 'lp-btn--gold' : 'pricing-card__cta--outline'}`} disabled={busy} onClick={() => onSelect(p, period)}>
                {typeof cta === 'function' ? cta(p, period) : cta}
              </button>
            )}
          </div>
        )
      })}
    </div>
    </>
  )
}
