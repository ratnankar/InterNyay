import { lazy } from 'react'
import { isChunkError, reloadOnce } from '../utils/chunkError'

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

// lazy() that survives a bad moment: a page file that fails to download is tried again (short pauses, so a blip on the connection
// is invisible). If it still fails the page is reloaded once to get the newest version, and only then is the error screen shown
function lazyPage(load) {
  return lazy(async () => {
    let lastError
    for (const pause of [0, 400, 1200]) {
      if (pause) await wait(pause)
      try {
        return await load()
      } catch (e) {
        lastError = e
        if (!isChunkError(e)) throw e
      }
    }
    if (reloadOnce()) return new Promise(() => {})
    throw lastError
  })
}

export const AuthPage = lazyPage(() => import('../components/auth/AuthPage'))
export const ChoosePlan = lazyPage(() => import('../components/auth/ChoosePlan'))
export const ChooseCourts = lazyPage(() => import('../components/auth/ChooseCourts'))
export const AppLayout = lazyPage(() => import('./AppLayout'))
export const Dashboard = lazyPage(() => import('../pages/Dashboard'))
export const Cases = lazyPage(() => import('../pages/Cases'))
export const Clients = lazyPage(() => import('../pages/Clients'))
export const TransactionHistory = lazyPage(() => import('../pages/TransactionHistory'))
export const Expenses = lazyPage(() => import('../pages/Expenses'))
export const NotificationsPage = lazyPage(() => import('../pages/NotificationsPage'))
export const Documents = lazyPage(() => import('../pages/Documents'))
export const MiscApplications = lazyPage(() => import('../pages/MiscApplications'))
export const LegalForms = lazyPage(() => import('../pages/LegalForms'))
export const TodoList = lazyPage(() => import('../pages/TodoList'))
export const CourtFeeCalculator = lazyPage(() => import('../pages/CourtFeeCalculator'))
export const QuickAccess = lazyPage(() => import('../pages/QuickAccess'))
export const JudgesOnLeave = lazyPage(() => import('../pages/JudgesOnLeave'))
export const ContactUs = lazyPage(() => import('../pages/ContactUs'))
export const Profile = lazyPage(() => import('../pages/Profile'))
export const MyPlan = lazyPage(() => import('../pages/MyPlan'))
export const Admin = lazyPage(() => import('../pages/Admin'))
export const FillFormPage = lazyPage(() => import('../pages/FillFormPage'))
