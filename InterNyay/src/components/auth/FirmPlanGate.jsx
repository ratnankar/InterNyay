import { useCallback, useEffect, useState } from 'react'
import AuthBackdrop from './AuthBackdrop'
import { useApp } from '../../context/AppContext'
import api, { plansApi } from '../../services/api'
import PricingCards from '../common/PricingCards'
import { isFreePlan, priceText } from '../../constants/plans'
import { getErrorMessage } from '../../utils/errorMessages'
import { CONTACT_CATEGORY_PLANS } from '../../constants/contact'
import { greetingName } from '../../utils/nameUtils'

// How often a signed-in firm's plan is checked again while the app is open (an admin may change it at any time)
const RECHECK_MS = 2 * 60 * 1000

// Wraps the app for a corporate firm: while the firm has no usable plan (none assigned yet, or the plan is disabled / coming soon)
// it shows the plan screen instead of the app. The backend refuses the firm's API calls in the same situations.
export default function FirmPlanGate({ children }) {
  const { currentUser, addToast, updateCurrentUser, handleLogout } = useApp()
  // Result of GET /plans/my: { accessBlocked, blockReason, current, available } (null until loaded)
  const [info, setInfo] = useState(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  // True after this firm sent a plan request in this session
  const [requested, setRequested] = useState(false)

  const load = useCallback(async () => {
    try {
      const d = await plansApi.mine()
      setInfo(d)
      setFailed(false)
      return d
    } catch {
      // The plan could not be checked (network): do not lock the firm out in the screen, the server still enforces the plan
      setFailed(true)
      return null
    }
  }, [])

  // Check on load, when the tab comes back into view, and every couple of minutes
  useEffect(() => {
    load()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(load, RECHECK_MS)
    return () => { document.removeEventListener('visibilitychange', onVisible); clearInterval(timer) }
  }, [load])

  async function checkAgain() {
    setChecking(true)
    const d = await load()
    setChecking(false)
    if (d?.accessBlocked) addToast('Your account is still waiting for a plan')
  }

  // Free plan: switch straight away. Paid plan: send a request to the InterNyay team, who assign it from the admin console
  async function choose(p, period) {
    if (busy) return
    setBusy(true)
    try {
      if (isFreePlan(p, period)) {
        const updated = await plansApi.select(p.code, period)
        updateCurrentUser({ planCode: updated.current?.code })
        setInfo(updated)
        addToast(`You're on the ${p.name} plan — welcome to InterNyay`)
        return
      }
      await api.contact.send({
        category: CONTACT_CATEGORY_PLANS,
        subject: `Corporate plan request: ${p.name}`,
        message: `I registered as a corporate firm and would like the ${p.name} plan${priceText(p, period)}. Please activate it on my account.`,
      })
      setRequested(true)
      addToast(`Request sent for the ${p.name} plan — the InterNyay team will activate it`)
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not complete this — please try again'), 'error')
    } finally {
      setBusy(false)
    }
  }

  // Plan is fine (or could not be checked): show the app
  if (failed || (info && !info.accessBlocked)) return children
  if (!info) {
    return (
      <div className="auth-page auth-page--plans">
        <AuthBackdrop />
        <div className="choose-plan"><p className="choose-plan__note">Loading…</p></div>
      </div>
    )
  }

  const firstName = greetingName(currentUser?.name)
  const unavailable = info.blockReason === 'PLAN_UNAVAILABLE'
  const plans = info.available || []

  return (
    <div className="auth-page auth-page--plans">
      <AuthBackdrop />
      <div className="choose-plan">
        <div className="choose-plan__head">
          <span className="choose-plan__eyebrow">{unavailable ? 'Plan on hold' : 'Choose your plan'}</span>
          <h1>{firstName ? `Welcome, ${firstName}!` : 'Welcome to InterNyay'}</h1>
          <p>
            {unavailable
              ? `The ${info.current?.name || 'plan'} on your account is not available right now, so your account is on hold. Choose an available plan below, or wait for the InterNyay team to update it.`
              : 'Your corporate account is ready. Your account opens as soon as a Corporate plan is active on it — choose one below, or the InterNyay team can assign it for you.'}
          </p>
        </div>

        {requested && (
          <p className="choose-plan__note">Request sent. You can use InterNyay as soon as the team activates your plan — use “Check again” after that.</p>
        )}

        {plans.length === 0 ? (
          <p className="choose-plan__note">No Corporate plan is open for sign-up right now. Please check again later or contact the InterNyay team.</p>
        ) : (
          <PricingCards
            plans={plans}
            currentCode={unavailable ? undefined : info.current?.code}
            onSelect={choose}
            busy={busy}
            cta={(p, period) => (isFreePlan(p, period) ? 'Start with this plan' : 'Request this plan')}
          />
        )}

        <div className="choose-plan__foot">
          <button type="button" className="skip-btn" onClick={checkAgain} disabled={checking || busy}>
            <span className="skip-btn__label">{checking ? 'Checking…' : 'Check again'}</span>
            <span className="skip-btn__hint">Already activated?</span>
          </button>
          <button type="button" className="skip-btn" onClick={handleLogout}>
            <span className="skip-btn__label">Sign out</span>
          </button>
        </div>
      </div>
    </div>
  )
}
