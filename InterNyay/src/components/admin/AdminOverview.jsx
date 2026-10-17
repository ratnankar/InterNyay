import { STATUS_COLORS } from '../../constants/data'

// Turn a year-month like 2026-03 into 'Mar 26'
function monthLabel(ym) {
  const [y, m] = String(ym).split('-').map(Number)
  if (!y || !m) return ym
  return `${new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short' })} ${String(y).slice(2)}`
}

// Horizontal bar chart card. Shows the top rows and adds the rest together as 'Others'
function BarList({ title, data, colors, limit = 8 }) {
  const rows = Object.entries(data || {})
  const shown = rows.slice(0, limit)
  const rest = rows.slice(limit).reduce((sum, [, n]) => sum + n, 0)
  if (rest > 0) shown.push(['Others', rest])

  const max = Math.max(1, ...shown.map(([, n]) => n))

  return (
    <div className="card admin-chart">
      <h3 className="admin-chart__title">{title}</h3>

      {shown.length === 0 ? (
        <p className="admin-chart__empty">No data yet</p>
      ) : shown.map(([label, n]) => (
        <div key={label} className="admin-bar">
          <span className="admin-bar__label" title={label}>{label}</span>
          <span className="admin-bar__track">
            <span
              className="admin-bar__fill"
              style={{ width: `${(n / max) * 100}%`, background: colors?.[label] }}
            />
          </span>
          <span className="admin-bar__count">{n}</span>
        </div>
      ))}
    </div>
  )
}

// Overview tab: count cards, bar charts and a 6 month chart of new cases and clients
export default function Overview({ stats, plans, newMessages, loading, onOpenTab }) {

  // Stats failed to load
  if (!stats && !loading) {
    return <p className="admin-chart__empty">Could not load the overview. Try refreshing.</p>
  }

  // Monthly figures, and the biggest value so the bars scale to it
  const monthly = stats?.monthly || []
  const monthMax = Math.max(1, ...monthly.flatMap(m => [m.cases, m.clients]))

  // Things the admin should look at; the block is hidden when there is nothing to do
  const attention = []
  if (newMessages > 0) {
    attention.push({ key: 'msgs', tab: 'contact', text: `${newMessages} new contact ${newMessages === 1 ? 'message' : 'messages'} waiting for a reply` })
  }
  if (plans?.length > 0 && plans.every(p => p.enabled === false || p.comingSoon)) {
    attention.push({ key: 'noopen', tab: 'plans', text: 'No plan is open for sign-up: every plan is disabled or marked Coming soon' })
  }
  ;(plans || []).filter(p => p.usersCount > 0 && (p.enabled === false || p.comingSoon)).forEach(p => {
    attention.push({
      key: `plan-${p.code}`, tab: 'plans',
      text: `${p.name} is ${p.enabled === false ? 'disabled' : 'marked Coming soon'} but ${p.usersCount} ${p.usersCount === 1 ? 'account is' : 'accounts are'} still on it`,
    })
  })

  return (
    <>
      {attention.length > 0 && (
        <div className="card admin-attention">
          <h3 className="admin-chart__title">Needs attention</h3>
          <ul className="admin-attention__list">
            {attention.map(a => (
              <li key={a.key}>
                <span>{a.text}</span>
                <button type="button" className="btn-outline" onClick={() => onOpenTab(a.tab)}>Open</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Count cards */}
      <div className="admin__stats">
        <Stat label="Advocates"        value={stats ? stats.users - stats.admins - (stats.associates || 0) : undefined} />
        <Stat label="Associates"       value={stats?.associates} />
        <Stat label="Admins"           value={stats?.admins} />
        {/* Keep showing the last known count while refreshing; the dash is only for the very first load */}
        <Stat label="Pricing plans"    value={loading && !plans?.length ? undefined : plans?.length} />
        <Stat label="Total cases"      value={stats?.totalCases} />
        <Stat label="Total clients"    value={stats?.totalClients} />
        <Stat label="Hearings · next 7 days" value={stats?.hearingsNext7Days} />
        <Stat label="Judges on the Judges List" value={stats?.totalJudges} />
        <Stat label="Judges on leave today"     value={stats?.judgesOnLeaveToday} />
        <Stat label="Bail Roster entries"       value={stats?.totalBailRosterEntries} />
        <Stat label="Duty Magistrate entries"   value={stats?.totalDutyMagistrateEntries} />
        <Stat label="Police stations"           value={stats?.totalPoliceStations} />
      </div>

      {/* Analytics charts */}
      <h2 className="admin-section-title">Analytics</h2>

      <div className="admin-analytics">
        <BarList title="Cases by status" data={stats?.casesByStatus} colors={STATUS_COLORS} />
        <BarList title="Cases by nature" data={stats?.casesByType} />
        <BarList title="Cases by court"  data={stats?.casesByCourt} />
        {/* Accounts on each plan, in the plan display order */}
        <BarList title="Accounts by plan" data={Object.fromEntries((plans || []).map(p => [p.name || p.code, p.usersCount ?? 0]))} />

        {/* Bars for new cases and clients in each of the last 6 months */}
        <div className="card admin-chart">
          <h3 className="admin-chart__title">New cases &amp; clients · last 6 months</h3>

          <div className="admin-months">
            {monthly.map(m => (
              <div key={m.month} className="admin-months__col">
                <div className="admin-months__bars">
                  <span
                    className="admin-months__bar admin-months__bar--cases"
                    style={{ height: `${(m.cases / monthMax) * 100}%` }}
                    title={`${m.cases} new case${m.cases === 1 ? '' : 's'}`}
                  >
                    {m.cases > 0 && <em>{m.cases}</em>}
                  </span>
                  <span
                    className="admin-months__bar admin-months__bar--clients"
                    style={{ height: `${(m.clients / monthMax) * 100}%` }}
                    title={`${m.clients} new client${m.clients === 1 ? '' : 's'}`}
                  >
                    {m.clients > 0 && <em>{m.clients}</em>}
                  </span>
                </div>
                <span className="admin-months__label">{monthLabel(m.month)}</span>
              </div>
            ))}
          </div>

          <div className="admin-months__legend">
            <span><i className="admin-months__dot admin-months__dot--cases" /> Cases</span>
            <span><i className="admin-months__dot admin-months__dot--clients" /> Clients</span>
          </div>
        </div>
      </div>
    </>
  )
}

// Count card, showing a dash when there is no value yet
function Stat({ label, value }) {
  return (
    <div className="stat-card">
      <p className="admin__stat-label">{label}</p>
      <p className="admin__stat-value">{value ?? '—'}</p>
    </div>
  )
}
