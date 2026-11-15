// Wraps a page route with the plan and role rules that used to live in the big page switch.
import { Navigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import usePlanFeatures from '../hooks/usePlanFeatures'
import TransactionAccessGate from '../components/auth/TransactionAccessGate'

// Pages that depend on a plan feature: key is the page name, value is the feature flag checked with can()
const PAGE_FEATURE = {
  transactions: 'transactions', expenses: 'office_expenses', documents: 'documents', miscapps: 'documents',
  forms: 'legal_forms', calculator: 'court_fee_calculator', corporate: 'corporate',
}

// Shown in place of a page when the user's plan does not include that feature
function UpgradeNotice() {
  return (
    <div className="upgrade-notice">
      <h2 className="upgrade-notice__title">Not included in your plan</h2>
      <p className="upgrade-notice__text">
        This feature isn't part of your current plan. See My Plan, or contact us to upgrade.
      </p>
    </div>
  )
}

export default function PageGate({ id, children }) {
  const { isAssociate, transactionsUnlocked, currentUser } = useApp()
  const { can } = usePlanFeatures()

  // Only a corporate account sees the corporate view, only a hired advocate sees the allotted cases
  if (id === 'corporate' && (isAssociate || currentUser?.corporateId)) return <Navigate to="/dashboard" replace />
  if (id === 'allotted' && !currentUser?.corporateId) return <Navigate to="/dashboard" replace />
  // Associates don't get the transactions page
  if (isAssociate && id === 'transactions') return <Navigate to="/dashboard" replace />
  if (PAGE_FEATURE[id] && !can(PAGE_FEATURE[id])) return <UpgradeNotice />
  // Transactions need an extra unlock (PIN check) before they are shown
  if (id === 'transactions' && !transactionsUnlocked) return <TransactionAccessGate />
  return children
}
