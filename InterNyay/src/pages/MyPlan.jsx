import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import api, { plansApi } from '../services/api'
import PricingCards from '../components/common/PricingCards'
import { advocatePlans, isFreePlan, priceText } from '../constants/plans'
import { getErrorMessage } from '../utils/errorMessages'
import { CONTACT_CATEGORY_PLANS } from '../constants/contact'

// My Plan page: shows the current plan and lets the user request a plan change
export default function MyPlan() {
  // Loaded plan data, load failure flag and whether a request is being sent
  const { addToast, updateCurrentUser } = useApp()
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  const [sending, setSending] = useState(false)

  // Load the current plan, associate seat usage and available plans once on mount
  useEffect(() => {
    plansApi.mine().then(setData).catch(() => setFailed(true))
  }, [])

  // Send a plan change request to support through the contact API
  async function requestPlan(p, period) {
    // Ignore repeat clicks while a request is already being sent
    if (sending) return
    setSending(true)
    try {
      if (isFreePlan(p, period)) {
        const updated = await plansApi.select(p.code, period)
        setData(updated)
        updateCurrentUser({ planCode: updated.current.code })
        addToast(`You are now on the ${p.name} plan`)
        return
      }
      await api.contact.send({
        category: CONTACT_CATEGORY_PLANS,
        subject: `Plan change request: ${p.name}`,
        message: `I would like to switch to the ${p.name} plan${priceText(p, period)}. Please let me know the next steps.`,
      })
      addToast(`Request sent — we'll get back to you about the ${p.name} plan`)
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not send the request'), 'error')
    } finally {
      setSending(false)
    }
  }

  // Current plan and its associate seat limit (a negative limit means unlimited)
  const current = data?.current
  const limit = current ? (current.associateLimit < 0 ? 'Unlimited' : current.associateLimit) : ''

  return (
    <div>
      {/* Page title and subtitle */}
      <div className="page-header">
        <div>
          <h1 className="page-title">My Plan</h1>
          <p className="page-subtitle">Your current plan, associates and the plans you can switch to.</p>
        </div>
      </div>

      {/* Loading and error messages */}
      {!data && !failed && <p className="profile-note">Loading…</p>}
      {(failed || (data && !current)) && <p className="profile-note">Could not load your plan. Please try again later.</p>}

      {/* Current plan summary and the plans available to switch to */}
      {data && current && (
        <div className="card profile-card">
          <h3 className="section-title">Your Plan</h3>
          <p className="profile-note">
            You are on the <strong>{current.name}</strong> plan. Associates are covered by your plan —
            {' '}{data.associatesUsed} of {limit} associates used.
            Free plans switch instantly. For any other plan, send a request and we will contact you.
          </p>
          <PricingCards plans={advocatePlans(data.available || [])} currentCode={current.code} compact busy={sending} onSelect={requestPlan} cta={(p, period) => (isFreePlan(p, period) ? 'Switch to this plan' : 'Request this plan')} />
        </div>
      )}
    </div>
  )
}
