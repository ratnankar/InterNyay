// Main app layout: sidebar on the left, the current page (the matched child route) on the right,
// and every global modal mounted once so any page can open them through context state.
import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import ErrorBoundary from '../components/common/ErrorBoundary'
import { useApp } from '../context/AppContext'
import usePlanFeatures from '../hooks/usePlanFeatures'
import Sidebar from '../components/layout/Sidebar'
import AddCaseModal from '../components/modals/AddCaseModal'
import AddClientModal from '../components/modals/AddClientModal'
import UploadDocModal from '../components/modals/UploadDocModal'
import UploadClientDocModal from '../components/modals/UploadClientDocModal'
import UploadAdvocateDocModal from '../components/modals/UploadAdvocateDocModal'
import UploadEvidenceModal from '../components/modals/UploadEvidenceModal'
import RenameDocModal from '../components/modals/RenameDocModal'
import ClientDetailModal from '../components/modals/ClientDetailModal'
import InvoiceModal from '../components/modals/InvoiceModal'
import TransactionDrawer from '../components/modals/TransactionDrawer'
import EditFeeModal from '../components/modals/EditFeeModal'
import NextHearingModal from '../components/modals/NextHearingModal'
import DocPreviewModal from '../components/common/DocPreviewModal'
import ImportantNotificationPopup from '../components/common/ImportantNotificationPopup'
import ChatWidget from '../components/chat/ChatWidget'

// Renders the chat assistant only when the user's plan includes it
function ChatGate() {
  const { can } = usePlanFeatures()
  return can('chat_assistant') ? <ChatWidget /> : null
}

export default function AppLayout() {
  const { isAdmin, isAssociate } = useApp()
  const { pathname } = useLocation()
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    const previous = meta?.getAttribute('content')
    meta?.setAttribute('content', '#ffffff')
    return () => { if (meta && previous) meta.setAttribute('content', previous) }
  }, [])
  return (
    <div className="app-shell">
      <Sidebar />
      <main className={`app-main${!isAdmin ? ' app-main--chat' : ''}`}>
        {/* A crash in one page shows a Try again panel here and keeps the sidebar; moving to another page tries again by itself */}
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      {/* Global modals live here so any page can open them through context state. A crash in one of them hides it, not the page */}
      <ErrorBoundary fallback={null} resetKey={pathname}>
      <AddCaseModal />
      <AddClientModal />
      <UploadDocModal />
      <UploadClientDocModal />
      <UploadAdvocateDocModal />
      <UploadEvidenceModal />
      <RenameDocModal />
      <ClientDetailModal />
      {/* Fee and invoice screens are hidden from associates */}
      {!isAssociate && (
        <>
          <TransactionDrawer />
          <InvoiceModal />
        </>
      )}
      <EditFeeModal />
      <NextHearingModal />
      <DocPreviewModal />
      <ImportantNotificationPopup />
      {/* Chat assistant is for advocates only, not the admin console */}
      {!isAdmin && <ChatGate />}
      </ErrorBoundary>
    </div>
  )
}
