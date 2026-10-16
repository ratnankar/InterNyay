// Plans an advocate can choose: plans marked as coming soon and business-only plans are left out (audience BOTH stays)
// (the backend already hides business plans from advocates, this is a second safety net)
export function advocatePlans(plans = []) {
  return (plans || []).filter(p => !p.comingSoon && p.audience !== 'BUSINESS')
}

// Billing periods: 'month' (default) or 'year'
export const MONTH = 'month'
export const YEAR = 'year'

// Plan field names for a billing period
const priceKey = period => (period === YEAR ? 'priceYearly' : 'priceMonthly')
const discountKey = period => (period === YEAR ? 'discountPriceYearly' : 'discountPrice')

// True when a plan has a price set (a blank price comes from the backend as null, and Number(null) would wrongly read as 0)
export function hasPrice(plan, period = MONTH) {
  const v = plan?.[priceKey(period)]
  return v !== null && v !== undefined && v !== ''
}

// True when at least one plan has a yearly price, so the Monthly / Yearly switch is worth showing
export function hasYearlyPlans(plans = []) {
  return (plans || []).some(p => !p.comingSoon && hasPrice(p, YEAR) && Number(p.priceYearly) > 0)
}

// The billing period that actually applies to a plan: yearly only when it has a yearly price, otherwise monthly
export function periodFor(plan, wanted = MONTH) {
  return wanted === YEAR && hasPrice(plan, YEAR) && Number(plan.priceYearly) > 0 ? YEAR : MONTH
}

// "/month" or "/year"
export const periodSuffix = period => (period === YEAR ? '/year' : '/month')

// Discount percentage worked out from the price and the discount price (whole percent).
// Returns 0 when there is no valid discount, so it is safe to call with blank form values.
export function discountPercent(price, discountPrice) {
  if (price === '' || price === null || price === undefined) return 0
  if (discountPrice === '' || discountPrice === null || discountPrice === undefined) return 0
  const p = Number(price)
  const d = Number(discountPrice)
  if (!(p > 0) || !(d >= 0) || d >= p) return 0
  return Math.round(((p - d) * 100) / p)
}

// True when a plan has a discount price that is lower than its price
export function hasDiscount(plan, period = MONTH) {
  return hasPrice(plan, period) && discountPercent(plan[priceKey(period)], plan[discountKey(period)]) > 0
}

// The price a customer actually pays: the discount price when there is one, else the normal price
function effectivePrice(plan, period = MONTH) {
  return hasDiscount(plan, period) ? Number(plan[discountKey(period)]) : Number(plan[priceKey(period)])
}

// Price wording for plan request messages: a blank price must not read as 0.
// With period 'year' it quotes the yearly price when the plan has one, otherwise the monthly price.
export function priceText(plan, period = MONTH) {
  const used = periodFor(plan, period)
  if (isFreePlan(plan, used)) return ' (Free)'
  if (!hasPrice(plan)) return ''
  return ` (₹${effectivePrice(plan, used).toLocaleString('en-IN')}${periodSuffix(used)})`
}

// A plan that is free for the year is free by the month too, so the yearly flag counts for both periods
export function isFreePlan(plan, period = MONTH) {
  if (!plan) return false
  if (period === YEAR) return !!plan.freeYearly
  return !!plan.freeMonthly || !!plan.freeYearly || (hasPrice(plan) && Number(plan.priceMonthly) === 0)
}
