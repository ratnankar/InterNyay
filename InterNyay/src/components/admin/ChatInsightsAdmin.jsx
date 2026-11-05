import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import { getErrorMessage } from '../../utils/errorMessages'
import ErrorMessage from '../common/ErrorMessage'
import { useBusy, useBusyPath } from '../../utils/busyStore'

const RANGES = [7, 30, 90]
// How often the page asks the server how far the test questions are
const EVAL_POLL_MS = 2000
// Long questions and answers are cut to this many characters until the admin opens them
const CLIP_CHARS = 160

// How each run outcome the server records is shown. Anything not listed falls back to its own name
const OUTCOMES = {
  OK:              { label: 'Answered',         tone: 'ok' },
  EMPTY:           { label: 'Empty reply',      tone: 'warn' },
  TRUNCATED:       { label: 'Cut off',          tone: 'warn' },
  TOO_MANY_ROUNDS: { label: 'Too many lookups', tone: 'warn' },
  CANCELLED:       { label: 'Stopped by user',  tone: 'info' },
  UNAVAILABLE:     { label: 'AI unavailable',   tone: 'bad' },
  ERROR:           { label: 'Error',            tone: 'bad' },
}

// hearing_day_details -> Hearing day details
const friendly = name => {
  const text = String(name || '').replace(/_/g, ' ').trim().toLowerCase()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : ''
}

const outcomeInfo = code => OUTCOMES[code] || { label: friendly(code) || 'Unknown', tone: 'info' }

const when = value => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

const count = value => Number(value || 0).toLocaleString('en-IN')

function Stat({ value, label, hint }) {
  return (
    <div className="stat-card" title={hint}>
      <p className="admin__stat-label">{label}</p>
      <p className="admin__stat-value">{value}</p>
    </div>
  )
}

function Badge({ tone = 'info', children }) {
  return <span className={`chat-insights__badge chat-insights__badge--${tone}`}>{children}</span>
}

// Shows the start of a long text with a link to open the rest. Text that was not stored shows a dash
function Clip({ text, max = CLIP_CHARS }) {
  const [open, setOpen] = useState(false)
  if (!text) return <span className="chat-insights__muted" title="Not stored">—</span>
  if (text.length <= max) return <>{text}</>
  return (
    <>
      {open ? text : `${text.slice(0, max).trimEnd()}…`}
      {' '}
      <button type="button" className="chat-insights__more" onClick={() => setOpen(o => !o)}>
        {open ? 'Show less' : 'Show more'}
      </button>
    </>
  )
}

function Card({ title, note, actions, children }) {
  return (
    <section className="card chat-insights__card">
      <header className="chat-insights__card-head">
        <div>
          <h3 className="admin-chart__title">{title}</h3>
          {note && <p className="chat-insights__note">{note}</p>}
        </div>
        {actions && <div className="chat-insights__actions">{actions}</div>}
      </header>
      {children}
    </section>
  )
}

function Table({ head, rows, empty }) {
  if (rows.length === 0) return <p className="chat-insights__muted">{empty}</p>
  return (
    <div className="chat-insights__table-wrap">
      <table className="chat-insights__table">
        <thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((cells, i) => <tr key={i}>{cells.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  )
}

// Horizontal bars, one row per item: [{ key, label, value, tone }]
function Bars({ items, empty }) {
  if (items.length === 0) return <p className="chat-insights__muted">{empty}</p>
  const max = Math.max(1, ...items.map(i => i.value))
  return (
    <div>
      {items.map(i => (
        <div key={i.key} className="admin-bar">
          <span className="admin-bar__label" title={i.label}>{i.label}</span>
          <span className="admin-bar__track">
            <span className={`admin-bar__fill${i.tone ? ` chat-insights__fill--${i.tone}` : ''}`} style={{ width: `${(i.value / max) * 100}%` }} />
          </span>
          <span className="admin-bar__count">{count(i.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function ChatInsightsAdmin() {
  const { addToast } = useApp()
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  // The latest test run as the server reports it (running, finished or stopped). It lives on the server, so a page
  // refresh shows the same progress again instead of a button that looks free while the run is still going
  const [evaluation, setEvaluation] = useState(null)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [reloadingNow, setReloading] = useState(false)
  // Calls the server is still running (also after a page refresh): starting/stopping a test run, reloading the library
  const evalCallRunning = useBusyPath('/admin/chat/eval')
  const reloading = reloadingNow || useBusy('POST', '/admin/chat/knowledge/reload')
  // How many passages the legal library holds and how many test questions exist (shown for information only)
  const [passages, setPassages] = useState(null)
  const [caseCount, setCaseCount] = useState(null)
  const mounted = useRef(true)
  // Only the newest request may fill the page, so quickly switching the period never shows older figures
  const requestId = useRef(0)
  const evaluating = starting || evalCallRunning || !!evaluation?.running

  const load = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const res = await api.admin.chat.insights(days)
      if (mounted.current && id === requestId.current) setData(res)
    } catch (e) {
      if (mounted.current && id === requestId.current) setError(getErrorMessage(e, 'Could not load the assistant insights'))
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false)
    }
  }, [days])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  // Picks up a run that is already going (or the last finished one) when the page opens, and the two counts
  useEffect(() => {
    let alive = true
    api.admin.chat.evalStatus()
      .then(res => { if (alive && res?.started) setEvaluation(res) })
      .catch(() => { /* no earlier run to show */ })
    api.admin.chat.knowledge()
      .then(res => { if (alive && typeof res?.passages === 'number') setPassages(res.passages) })
      .catch(() => { /* the count is only informative */ })
    api.admin.chat.evalCases()
      .then(res => { if (alive && Array.isArray(res)) setCaseCount(res.length) })
      .catch(() => { /* the count is only informative */ })
    return () => { alive = false }
  }, [])

  // While a run is going, ask for its progress every couple of seconds
  const running = !!evaluation?.running
  useEffect(() => {
    if (!running) return undefined
    let alive = true
    let failures = 0
    const timer = setInterval(async () => {
      try {
        const res = await api.admin.chat.evalStatus()
        failures = 0
        if (alive && res) setEvaluation(res)
      } catch {
        // A few missed answers are fine (slow network); keep asking
        failures += 1
        if (alive && failures >= 5) {
          setEvaluation(prev => (prev ? { ...prev, running: false, error: 'Lost contact with the server. Reload the page to see where the test run got to.' } : prev))
        }
      }
    }, EVAL_POLL_MS)
    return () => { alive = false; clearInterval(timer) }
  }, [running])

  // ids = only those test questions; nothing = all of them
  const runEval = async ids => {
    if (evaluating) return
    setStarting(true)
    try {
      const res = await api.admin.chat.runEval(ids)
      if (mounted.current && res) setEvaluation(res)
    } catch (e) {
      addToast(getErrorMessage(e, 'The test questions could not be started'), 'error')
    } finally {
      if (mounted.current) setStarting(false)
    }
  }

  const stopEval = async () => {
    setStopping(true)
    try {
      const res = await api.admin.chat.cancelEval()
      if (mounted.current && res) setEvaluation(res)
    } catch (e) {
      addToast(getErrorMessage(e, 'The test run could not be stopped'), 'error')
    } finally {
      if (mounted.current) setStopping(false)
    }
  }

  const reloadLibrary = async () => {
    setReloading(true)
    try {
      const res = await api.admin.chat.reloadKnowledge()
      if (mounted.current && typeof res?.passages === 'number') setPassages(res.passages)
      addToast(`Legal library reloaded: ${res?.passages ?? 0} passages`, 'success')
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not reload the legal library'), 'error')
    } finally {
      if (mounted.current) setReloading(false)
    }
  }

  if (loading && !data) return <p className="chat-insights__muted">Loading…</p>
  if (error && !data) {
    return (
      <>
        <ErrorMessage message={error} />
        <button type="button" className="btn-outline" onClick={load}>Try again</button>
      </>
    )
  }
  if (!data) return null

  const summary = data.summary || {}
  const outcomes = data.outcomes || {}
  const votes = data.votes || {}
  const total = summary.runs || 0
  const okShare = total ? Math.round(((outcomes.OK || 0) / total) * 100) : 0
  const voted = (votes.up || 0) + (votes.down || 0)
  const tokens = n => (n > 0 ? count(n) : '—')
  const tokenHint = 'Not recorded. Set CHAT_STREAM_USAGE=true if the AI provider reports token counts.'

  const outcomeBars = Object.entries(outcomes)
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => ({ key: code, label: outcomeInfo(code).label, value: n, tone: outcomeInfo(code).tone }))
  const toolBars = (data.topTools || []).map(t => ({ key: t.tool, label: friendly(t.tool), value: t.count }))

  const results = evaluation?.results || []
  const failedIds = results.filter(r => !r.passed && r.id).map(r => r.id)
  const evalBadge = !evaluation?.started
    ? <Badge>Not run yet</Badge>
    : evaluation.running
      ? <Badge tone="info">Running</Badge>
      : <Badge tone={evaluation.passed === evaluation.done && evaluation.done > 0 ? 'ok' : 'bad'}>
        {evaluation.passed ?? 0} of {evaluation.done ?? 0} passed{evaluation.cancelled ? ' · stopped early' : ''}
      </Badge>
  const progress = evaluation?.total ? Math.min(100, Math.round(((evaluation.done ?? 0) / evaluation.total) * 100)) : 0

  return (
    <div className={`chat-insights${loading ? ' chat-insights--busy' : ''}`} aria-busy={loading}>
      <div className="chat-insights__toolbar">
        <div className="chat-insights__range" role="group" aria-label="Period">
          {RANGES.map(r => (
            <button key={r} type="button" className={r === days ? 'btn-gold' : 'btn-outline'} aria-pressed={r === days} onClick={() => setDays(r)}>
              Last {r} days
            </button>
          ))}
        </div>
        <button type="button" className="btn-outline" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <>
          <ErrorMessage message={error} />
          <p className="chat-insights__muted">Showing the figures from the last successful load.</p>
        </>
      )}

      {total === 0 && (
        <p className="chat-insights__muted">Nobody has asked the assistant anything in the last {days} days.</p>
      )}

      <div className="admin__stats">
        <Stat value={count(total)} label="Questions answered" />
        <Stat value={total ? `${okShare}%` : '—'} label="Answered cleanly" />
        <Stat value={total ? `${summary.averageSeconds ?? 0}s` : '—'} label="Average time" />
        <Stat value={total ? (summary.averageRounds ?? 0) : '—'} label="Lookup rounds per answer" />
        <Stat value={count(votes.up)} label="Good answers" hint={voted ? `${Math.round(((votes.up || 0) / voted) * 100)}% of the ${count(voted)} votes` : 'No votes yet'} />
        <Stat value={count(votes.down)} label="Poor answers" />
        <Stat value={tokens(summary.promptTokens)} label="Prompt tokens" hint={summary.promptTokens > 0 ? undefined : tokenHint} />
        <Stat value={tokens(summary.completionTokens)} label="Answer tokens" hint={summary.completionTokens > 0 ? undefined : tokenHint} />
      </div>

      <div className="chat-insights__split">
        <Card title="How questions ended">
          <Bars items={outcomeBars} empty="No questions yet." />
        </Card>
        <Card title="Most used lookups" note="What the assistant looked up to answer">
          <Bars items={toolBars} empty="No lookups yet." />
        </Card>
      </div>

      <Card
        title="Test questions"
        note={caseCount != null ? `${caseCount} fixed questions that check the assistant still looks things up and answers correctly. Run them after changing the model or the prompt.` : 'Fixed questions that check the assistant still looks things up and answers correctly.'}
        actions={(
          <>
            {evalBadge}
            {evaluation?.running && (
              <button type="button" className="btn-outline" onClick={stopEval} disabled={stopping || evaluation.cancelled}>
                {stopping || evaluation.cancelled ? 'Stopping…' : 'Stop'}
              </button>
            )}
            {!evaluation?.running && failedIds.length > 0 && (
              <button type="button" className="btn-outline" onClick={() => runEval(failedIds)} disabled={evaluating}>
                Re-run failed ({failedIds.length})
              </button>
            )}
            <button type="button" className="btn-gold" onClick={() => runEval()} disabled={evaluating}>
              {evaluating ? (evaluation?.running ? 'Running…' : 'Starting…') : 'Run all'}
            </button>
          </>
        )}
      >
        {evaluation?.running && (
          <>
            <div className="chat-insights__progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <span style={{ width: `${progress}%` }} />
            </div>
            <p className="chat-insights__muted">
              {evaluation.done ?? 0} of {evaluation.total ?? 0} done, {evaluation.passed ?? 0} passed so far
              {evaluation.current ? `. Now asking: ${evaluation.current}` : ''}
            </p>
          </>
        )}
        {evaluation?.error && <ErrorMessage message={evaluation.error} />}
        {evaluation?.started ? (
          <Table
            head={['Result', 'Question', 'Tools used', 'Problems']}
            empty={evaluation.running ? 'The first answer will show here shortly.' : 'No test questions ran.'}
            rows={results.map(r => [
              <Badge key="r" tone={r.passed ? 'ok' : 'bad'}>{r.passed ? 'Pass' : 'Fail'}</Badge>,
              <>
                {r.question}
                {r.answer && (
                  <details className="chat-insights__details">
                    <summary>See the answer</summary>
                    <p>{r.answer}</p>
                  </details>
                )}
              </>,
              (r.tools || []).map(friendly).join(', ') || 'none',
              (r.problems || []).join('; ') || <span className="chat-insights__muted">—</span>,
            ])}
          />
        ) : (
          <p className="chat-insights__muted">No test run yet. Results stay here after a refresh.</p>
        )}
      </Card>

      <Card title="Poor answers" note={`Answers advocates marked as not helpful in the last ${days} days`}>
        <Table
          head={['When', 'Question', 'Answer', 'Note']}
          empty="No poor answers in this period."
          rows={(data.downvotes || []).map(d => [when(d.when), <Clip key="q" text={d.question} />, <Clip key="a" text={d.answer} />, d.note || <span key="n" className="chat-insights__muted">—</span>])}
        />
      </Card>

      <Card title="Failed or cut-off runs" note="Questions that ended without a full answer">
        <Table
          head={['When', 'What happened', 'Question']}
          empty="No failed runs in this period."
          rows={(data.failures || []).map(f => {
            const info = outcomeInfo(f.outcome)
            return [when(f.when), <Badge key="o" tone={info.tone}>{info.label}</Badge>, <Clip key="q" text={f.question} />]
          })}
        />
      </Card>

      <Card title="Answered without looking anything up" note="Worth a glance: the assistant may have answered from memory instead of from the records">
        <Table
          head={['When', 'Question']}
          empty="Nothing here."
          rows={(data.answeredWithoutLookup || []).map(f => [when(f.when), <Clip key="q" text={f.question} />])}
        />
      </Card>

      <Card
        title="Legal library"
        note={passages != null ? `${count(passages)} passages are loaded. After adding or editing the .md files, reload so the assistant uses them.` : 'After adding or editing the .md files, reload so the assistant uses them.'}
        actions={(
          <button type="button" className="btn-outline" onClick={reloadLibrary} disabled={reloading}>
            {reloading ? 'Reloading…' : 'Reload legal library'}
          </button>
        )}
      />
    </div>
  )
}
