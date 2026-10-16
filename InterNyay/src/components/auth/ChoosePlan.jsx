import { useEffect, useState } from 'react'
import AuthBackdrop from './AuthBackdrop'
import { useApp } from '../../context/AppContext'
import api, { plansApi } from '../../services/api'
import PricingCards from '../common/PricingCards'
import { advocatePlans, isFreePlan, priceText } from '../../constants/plans'
import { getErrorMessage } from '../../utils/errorMessages'
import { CONTACT_CATEGORY_PLANS } from '../../constants/contact'
import { greetingName } from '../../utils/nameUtils'

// Plan selection screen shown once after a new advocate registers
export default function ChoosePlan() {
  const { currentUser, finishPlanPrompt, addToast, updateCurrentUser } = useApp()
  // Plans loaded from the backend (null while loading)
  const [plans, setPlans] = useState(null)
  const [currentCode, setCurrentCode] = useState(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  // Load the plans available to this user
  useEffect(() => {
    plansApi.mine().then(d => {
      setPlans(advocatePlans(d.available))
      setCurrentCode(d.current?.code ?? null)
    }).catch(() => setFailed(true))
  }, [])

  // Free plan: continue straight away. Paid plan: send a request to the InterNyay team through the contact form
  async function choose(p, period) {
    if (busy) return
    setBusy(true)
    try {
      if (isFreePlan(p, period)) {
        if (p.code !== currentCode) {
          const updated = await plansApi.select(p.code, period)
          updateCurrentUser({ planCode: updated.current.code })
        }
        addToast(`You're on the ${p.name} plan — welcome to InterNyay`)
        finishPlanPrompt()
        return
      }
      await api.contact.send({
        category: CONTACT_CATEGORY_PLANS,
        subject: `Plan request at sign-up: ${p.name}`,
        message: `I just registered and would like the ${p.name} plan${priceText(p, period)}. Please let me know the next steps.`,
      })
      addToast(`Request sent for the ${p.name} plan — you can start on Free meanwhile`)
      finishPlanPrompt()
    } catch (e) {
      addToast(getErrorMessage(e, isFreePlan(p, period) ? 'Could not switch the plan — you can try again from My Plan' : 'Could not send the request — you can try again from My Plan'), 'error')
    } finally {
      setBusy(false)
    }
  }

  // First name (with title, if any) used in the greeting
  const firstName = greetingName(currentUser?.name)

  // Header, plan cards and a "skip" button
  return (
    <div className="auth-page auth-page--plans">
      <AuthBackdrop />
      <div className="choose-plan">
        <div className="choose-plan__head">
          <span className="choose-plan__eyebrow">Choose your plan</span>
          <h1>{firstName ? `Welcome, ${firstName}!` : 'Welcome to InterNyay'}</h1>
          <p>Your account is ready. Pick the plan that fits your practice — you can change it any time from My Plan.</p>
        </div>

        {!plans && !failed && <p className="choose-plan__note">Loading plans…</p>}
        {failed && <p className="choose-plan__note">Could not load the plans. You can pick one later from My Plan.</p>}

        {plans && (
          <PricingCards
            plans={plans}
            onSelect={choose}
            busy={busy}
            cta={(p, period) => (isFreePlan(p, period) ? (p.code === currentCode ? 'Continue with Free' : 'Choose this plan') : 'Choose this plan')}
          />
        )}

        <div className="choose-plan__foot">
          <button type="button" className="skip-btn" onClick={finishPlanPrompt} disabled={busy}>
            <span className="skip-btn__label">{failed ? 'Continue to InterNyay' : 'Skip for now'}</span>
            {!failed && <span className="skip-btn__hint">Continue with Free</span>}
          </button>
        </div>
      </div>
    </div>
  )
}
