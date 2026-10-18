import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../../services/api'
import Dropdown from '../common/Dropdown'
import { useApp } from '../../context/AppContext'
import { getErrorMessage } from '../../utils/errorMessages'
import { formatContactDate } from '../../constants/contact'
import SearchInput from '../common/SearchInput'

const PAGE_SIZE = 25

// Event filter choices
const TYPE_FILTERS = [
  { value: 'ALL',          label: 'All events' },
  { value: 'LOGIN',        label: 'Sign-ins' },
  { value: 'LOGIN_FAILED', label: 'Failed sign-ins' },
  { value: 'LOGOUT',       label: 'Sign-outs' },
]

// App filter choices: the website or the InterNyay Calendar mobile app
const APP_FILTERS = [
  { value: 'ALL',      label: 'All apps' },
  { value: 'WEB',      label: 'Web app' },
  { value: 'CALENDAR', label: 'Calendar app' },
]

const APP_LABELS = { WEB: 'Web app', CALENDAR: 'Calendar app' }

const EVENT_LABELS = { LOGIN: 'Signed in', LOGIN_FAILED: 'Failed', LOGOUT: 'Signed out' }
const METHOD_LABELS = { PASSWORD: 'Password', GOOGLE: 'Google' }
const roleLabel = role => (role === 'ADVOCATE' ? 'Advocate' : role === 'ASSOCIATE' ? 'Associate' : role === 'ADMIN' ? 'Admin' : '—')

// Short "Chrome · Windows" text from the browser string, the full text shows on hover
function browserLabel(ua) {
  if (!ua) return '—'
  // System the browser reported by itself (added by the server), more reliable than the browser string
  const reported = /; platform=([A-Za-z0-9 ._-]+?)\s*$/.exec(ua)?.[1]
  // Browser the browser named itself (Brave, Samsung Internet ...), else worked out from the browser string
  const reportedBrowser = /; browser=([A-Za-z0-9 ._-]+?)(?= ;|\s*$)/.exec(ua)?.[1]
  const browser = reportedBrowser ? reportedBrowser
    : /SamsungBrowser\//.test(ua) ? 'Samsung Internet'
    : /Edg(A|iOS)?\//.test(ua) ? 'Edge'
    : /OPR\/|OPT\/|Opera/.test(ua) ? 'Opera'
    : /Vivaldi\//.test(ua) ? 'Vivaldi'
    : /YaBrowser\//.test(ua) ? 'Yandex'
    : /UCBrowser\//.test(ua) ? 'UC Browser'
    : /DuckDuckGo\//.test(ua) ? 'DuckDuckGo'
    : /MiuiBrowser\//.test(ua) ? 'Mi Browser'
    : /FxiOS\/|Firefox\//.test(ua) ? 'Firefox'
    : /CriOS\/|Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Browser'
  const os = reported && /android/i.test(reported) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : reported || ''
  return os ? `${browser} · ${os}` : browser
}

// Browser text for the website. The Calendar app has no browser on a phone (the request names the phone's HTTP library),
// so there it shows the phone system instead, and falls back to the browser text for the Calendar app's web version
function deviceLabel(r) {
  const ua = r.userAgent || ''
  if (r.app !== 'CALENDAR') return browserLabel(ua)
  if (/okhttp|Dalvik/i.test(ua)) return 'Calendar app · Android'
  if (/CFNetwork|Darwin/i.test(ua)) return 'Calendar app · iOS'
  if (!ua || /Expo|ReactNative/i.test(ua)) return 'Calendar app'
  return browserLabel(ua)
}

// Admin view of who signed in, failed to sign in or signed out, newest first
// With user (id and email) it shows that account's activity only, as used in the popup on an account's profile
export default function LoginLogAdmin({ user = null }) {
  const { addToast } = useApp()

  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [type, setType]       = useState('ALL')
  const [app, setApp]         = useState('ALL')
  const [search, setSearch]   = useState('')
  const [query, setQuery]     = useState('')
  const [page, setPage]       = useState(0)

  // Only the newest request may update the screen
  const latest = useRef(0)

  // Search text is sent 350 ms after typing stops
  useEffect(() => {
    const t = setTimeout(() => { setQuery(search.trim()); setPage(0) }, 350)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    const id = ++latest.current
    setLoading(true)
    try {
      const res = await api.admin.loginLogs.list({
        type: type === 'ALL' ? undefined : type,
        app: app === 'ALL' ? undefined : app,
        q: query || undefined,
        userId: user?.id,
        email: user?.email,
        page,
        size: PAGE_SIZE,
      })
      if (id === latest.current) setData(res)
    } catch (e) {
      if (id === latest.current) addToast(getErrorMessage(e, 'Could not load the login activity'), 'error')
    } finally {
      if (id === latest.current) setLoading(false)
    }
  }, [type, app, query, page, user, addToast])

  useEffect(() => { load() }, [load])

  const rows = data?.items || []
  const totalPages = data?.totalPages || 0

  return (
    <>
      {/* Last 24 hours */}
      {!user && <div className="loginlog__summary">
        <span><strong>{data ? data.logins24h : '—'}</strong> sign-ins in the last 24 hours</span>
        <span className={data && data.failed24h > 0 ? 'loginlog__failed' : undefined}>
          <strong>{data ? data.failed24h : '—'}</strong> failed attempts in the last 24 hours
        </span>
      </div>}

      <div className="admin__toolbar loginlog__toolbar">
        {!user && <SearchInput placeholder="Search email or IP address…" value={search} onChange={setSearch} />}

        <Dropdown
          className="form-input"
          value={type}
          onChange={e => { setType(e.target.value); setPage(0) }}
          aria-label="Filter by event"
        >
          {TYPE_FILTERS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Dropdown>

        <Dropdown
          className="form-input"
          value={app}
          onChange={e => { setApp(e.target.value); setPage(0) }}
          aria-label="Filter by app"
        >
          {APP_FILTERS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Dropdown>

        <button className="btn-outline" onClick={load} disabled={loading}>Refresh</button>

        <span className="admin__count">
          {loading && !data ? 'Loading…' : `${data ? data.totalElements : 0} record${data?.totalElements === 1 ? '' : 's'}`}
        </span>
      </div>

      <div className="admin__table-wrap">
        <table className="admin__table loginlog__table">
          <thead>
            <tr>
              <th>When</th><th>Event</th><th>Email</th><th>Account</th>
              <th>App</th><th>Method</th><th>IP address</th><th>Browser / device</th><th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan={9} className="admin__empty">No records</td></tr>
            )}

            {rows.map(r => (
              <tr key={r.id}>
                <td>{formatContactDate(r.createdAt)}</td>
                <td>
                  <span className={`admin__pill loginlog__pill loginlog__pill--${String(r.eventType).toLowerCase()}`}>
                    {EVENT_LABELS[r.eventType] || r.eventType}
                  </span>
                </td>
                <td>{r.email || '—'}</td>
                <td>{roleLabel(r.role)}</td>
                <td>{APP_LABELS[r.app] || APP_LABELS.WEB}</td>
                <td>{METHOD_LABELS[r.method] || '—'}</td>
                <td>{r.ipAddress || '—'}</td>
                <td title={r.userAgent || ''}>{deviceLabel(r)}</td>
                <td>{r.failureReason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pages */}
      {totalPages > 1 && (
        <div className="loginlog__pager">
          <button className="btn-outline btn-outline--sm" disabled={page <= 0 || loading} onClick={() => setPage(p => p - 1)}>
            Previous
          </button>
          <span>Page {page + 1} of {totalPages}</span>
          <button className="btn-outline btn-outline--sm" disabled={page + 1 >= totalPages || loading} onClick={() => setPage(p => p + 1)}>
            Next
          </button>
        </div>
      )}

      <p className="loginlog__note">
        Entries are kept for {data?.retentionDays || 180} days and then deleted automatically. A sign-out is only recorded
        when the person uses the Sign Out button on the web app; closing the browser or an expired session is not shown, and the
        Calendar app (view only) records sign-ins and failed sign-ins only.
      </p>
    </>
  )
}
