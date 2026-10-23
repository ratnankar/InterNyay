import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import { onLiveRefresh } from '../utils/liveRefresh'
import { useApp } from '../context/AppContext'
import useSessionState from '../hooks/useSessionState'
import api from '../services/api'
import JudgeCard from '../components/common/JudgeCard'
import SuccessorCourts from '../components/common/SuccessorCourts'
import DistrictPdfBar from '../components/common/DistrictPdfBar'
import DateChips from '../components/common/DateChips'
import ValidityCell from '../components/common/ValidityCell'
import ArchiveTree from '../components/common/ArchiveTree'
import SeeMore from '../components/common/SeeMore'
import SeeMoreList from '../components/common/SeeMoreList'
import useSeeMore from '../hooks/useSeeMore'
import useGroupedSeeMore from '../hooks/useGroupedSeeMore'
import {
  useCourts,
  useCourtSelection,
  hasNamedDistricts,
  getCourtNames,
  getDistricts,
  isOwnDistrict,
  isHighCourt,
} from '../constants/courts'
import usePoliceDirectory from '../hooks/usePoliceDirectory'
import {
  buildStationIndex,
  searchStations,
  districtOptions,
  buildSourceNote,
} from '../utils/policeDirectory'
import SuggestInput from '../components/common/SuggestInput'
import { nameSearchMatches, sameJudge } from '../utils/judgeMatch'
import SearchInput from '../components/common/SearchInput'
import PdfFrame from '../components/common/PdfFrame'
import { printPdfUrl } from '../utils/printPdf'
import { canEmbedPdf } from '../utils/pdfSupport'
import { CONSUMER_PECUNIARY_OPTIONS, DRT_AMOUNT_OPTIONS } from '../constants/jurisdiction'
import { useDrtJurisdiction, useConsumerJurisdiction } from '../hooks/useJurisdictionDirectory'
import {
  buildDrtModel,
  buildConsumerModel,
  findDrtTribunalByStation,
  findConsumerCommissionByStation,
  mapsLink,
  telLink,
} from '../utils/jurisdiction'

import Icon from '../components/common/Icon'
import { getErrorMessage } from '../utils/errorMessages'

const rosterIssuedDate = row => row.issuedOn

// Placeholder rows shown while data loads
function LoadingRows() {
  return (
    <div className="qa-skeleton-wrap">
      {[1,2,3].map(i => <div key={i} className="qa-skeleton-row" />)}
    </div>
  )
}

// Error message with a Retry button
function ErrorState({ message, onRetry }) {
  return (
    <div className="qa-error-state">
      <span><Icon name="warning" /> {message || 'Failed to load data.'}</span>
      <button type="button" className="qa-retry-btn" onClick={onRetry}>Retry</button>
    </div>
  )
}

// Court buttons, plus a second row of district buttons when the selected court has named districts
function CourtFilter({ court, setCourt, district, setDistrict, withAll = false }) {
  const { courtNames, hierarchy } = useCourts()
  return (
    <div className="qa-court-filter">
      <div className="qa-filter-row">
        {withAll && (
          <button
            className={`qa-filter-btn${court === 'All' ? ' active' : ''}`}
            onClick={() => {
              setCourt('All')
              setDistrict('All')
            }}
          >All</button>
        )}
        {courtNames.map(c => (
          <button
            key={c}
            className={`qa-filter-btn${court === c ? ' active' : ''}`}
            onClick={() => {
              // Picking a court resets the district to that court's first option
              setCourt(c)
              setDistrict(hierarchy[c][0])
            }}
          >{c}</button>
        ))}
      </div>

      {court !== 'All' && hasNamedDistricts(court) && (
        <div className="qa-filter-row qa-filter-row--sub">
          {hierarchy[court].map(d => (
            <button
              key={d}
              className={`qa-filter-btn qa-filter-btn--sub${district === d ? ' active' : ''}`}
              onClick={() => setDistrict(d)}
            >{d}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// Judges list order and grouping: building, then floor, then court number
const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
// "Ground" and "Basement" come before the numbered floors; a floor with no number goes last
function floorRank(floor) {
  const f = String(floor || '').trim().toLowerCase()
  if (!f) return 1000
  if (/basement|lower ground/.test(f)) return -1
  if (/ground|^g$/.test(f)) return 0
  const n = f.match(/\d+/)
  return n ? Number(n[0]) : 999
}
// Position of a court complex or district in the court table, so the groups follow the table order
const rankIn = (list, v) => { const i = list.indexOf(v); return i < 0 ? 9999 : i }
// Sort by court, district, building (no building last), floor, court number, then the judge's name
function sortByPlace(list) {
  const courts = getCourtNames()
  return [...list].sort((a, b) => {
    const ba = (a.building || '').trim(), bb = (b.building || '').trim()
    return rankIn(courts, a.court) - rankIn(courts, b.court)
      || natural.compare(a.court || '', b.court || '')
      || rankIn(getDistricts(a.court), a.district) - rankIn(getDistricts(b.court), b.district)
      || natural.compare(a.district || '', b.district || '')
      || (!ba !== !bb ? (ba ? -1 : 1) : 0)
      || natural.compare(ba, bb)
      || floorRank(a.floor) - floorRank(b.floor)
      || natural.compare(a.courtRoomNo || '~', b.courtRoomNo || '~')
      || natural.compare(a.name || '', b.name || '')
  })
}
// Keys that tell a group's court, district and place apart
const courtKey = j => j.court || ''
const districtKey = j => `${courtKey(j)}|${j.district || ''}`
const placeKey = j => `${districtKey(j)}|${(j.building || '').trim()}`
// Cut a sorted list into court > district > building groups
function buildTree(list) {
  const courts = []
  list.forEach(j => {
    let c = courts[courts.length - 1]
    if (!c || c.key !== courtKey(j)) { c = { key: courtKey(j), name: j.court || '', districts: [] }; courts.push(c) }
    let d = c.districts[c.districts.length - 1]
    if (!d || d.key !== districtKey(j)) { d = { key: districtKey(j), name: j.district || '', court: j.court || '', places: [] }; c.districts.push(d) }
    let pl = d.places[d.places.length - 1]
    if (!pl || pl.key !== placeKey(j)) { pl = { key: placeKey(j), building: (j.building || '').trim(), items: [] }; d.places.push(pl) }
    pl.items.push(j)
  })
  return courts
}
const GROUP_HEADING = {
  court: { Tag: 'h3', className: 'place-group__court' },
  district: { Tag: 'h4', className: 'place-group__district' },
  place: { Tag: 'h5', className: 'place-group__building' },
}

function GroupHeader({ level, open, onToggle, count, nested, children }) {
  const { Tag, className } = GROUP_HEADING[level]
  return (
    <Tag className={nested ? `${className} place-group__building--nested` : className}>
      <button type="button" className="place-group__toggle" aria-expanded={open} onClick={onToggle}>
        <span className="place-group__arrow" aria-hidden="true">{open ? '▲' : '▼'}</span>
        <span>{children}</span>
        <span className="place-group__count">{count}</span>
      </button>
    </Tag>
  )
}

// Quick Access: judges list for the selected court and district, with search
function JudgesList({ initialQuery, jumpName }) {
  const { court, setCourt, district, setDistrict, ready } = useCourtSelection()
  const [query,     setQuery]     = useState(initialQuery || '')
  // Coming from "View in Judges List": look in every court, since the judge may sit in a court other than the preferred one
  useEffect(() => {
    if (!jumpName) return
    setCourt('All')
    setDistrict('All')
  }, [jumpName, setCourt, setDistrict])
  const [judges,    setJudges]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  // Show only the courts that have no judge at present
  const [vacantOnly, setVacantOnly] = useState(false)
  // Keys of the groups the user has closed
  const [closedList, setClosedList] = useSessionState('quick_judges_closed', [])
  const closed = useMemo(() => new Set(closedList), [closedList])
  const toggleGroup = key => setClosedList(list => (list.includes(key) ? list.filter(k => k !== key) : [...list, key]))

  // Load judges from the API for the selected court and district
  // silent = a quiet background refresh: no spinner, and a failure keeps what is on screen
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(null) }
    try {
      const result = await api.judgesList.list({
        court: court !== 'All' ? court : undefined,
        district: district !== 'All' ? district : undefined,
      })
      setJudges(Array.isArray(result) ? result : result.content || [])
    } catch (e) { if (!silent) setError(getErrorMessage(e, "We couldn't load the judges list. Please try again.")) }
    finally { if (!silent) setLoading(false) }
  }, [court, district])

  useEffect(() => { if (ready) fetchData() }, [fetchData, ready])
  useEffect(() => onLiveRefresh(() => { if (ready) fetchData(true) }), [fetchData, ready])

  // Filter loaded judges by the search text across name, designation, court room and other fields
  const vacantCount = useMemo(() => judges.filter(j => j.vacant).length, [judges])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = sortByPlace(vacantOnly ? judges.filter(j => j.vacant) : judges)
    if (!q) return pool
    // Untouched name from "View in Judges List": only that judge, by the same rules as the leave matching
    if (jumpName && query === jumpName) return pool.filter(j => !j.vacant && sameJudge(jumpName, j.name))
    return pool.filter(j =>
      [j.vacant ? 'vacant no judge' : j.name, j.designation, j.courtRoomNo, j.building, j.floor, j.jurisdiction, j.courtReaderName, j.courtEmail, j.vcMeetingId]
        .filter(Boolean)
        .some(v => v.toLowerCase().includes(q))
      // Names also match whatever the title, spelling of the dots or word order ("Ms. Kanika Handa", "handa kanika")
      || (!j.vacant && nameSearchMatches(query, j.name))
    )
  }, [judges, query, vacantOnly, jumpName])

  // Number of judges per group over the whole list, not only the part shown so far
  const counts = useMemo(() => {
    const m = new Map()
    visible.forEach(j => [courtKey(j), districtKey(j), placeKey(j)].forEach(k => m.set(k, (m.get(k) || 0) + 1)))
    return m
  }, [visible])
  // A search opens every group, so a match is never hidden in a closed one
  const searching = query.trim() !== ''
  const isOpen = key => searching || !closed.has(key)
  const groupKeys = useMemo(() => [...counts.keys()], [counts])
  const anyOpen = groupKeys.some(k => !closed.has(k))
  const toggleAll = () => setClosedList(anyOpen ? groupKeys : [])
  // Court and district levels show only when the filter is "All"
  const showCourtLevel = court === 'All'
  const showDistrictLevel = district === 'All'
  const judgeClosed = j => {
    if (searching) return false
    if (showCourtLevel && closed.has(courtKey(j))) return true
    if (showDistrictLevel && j.district && !isOwnDistrict(j.court, j.district) && closed.has(districtKey(j))) return true
    return !!(j.building || '').trim() && closed.has(placeKey(j))
  }
  const { shown, remaining, showMore, step: nextStep } = useGroupedSeeMore(visible, {
    runOf: placeKey,
    isClosed: judgeClosed,
    step: 24,
    resetKey: `${court}|${district}|${query}|${vacantOnly}`,
  })

  return (
    <div>
      {/* Court and district filters */}
      <CourtFilter court={court} setCourt={setCourt} district={district} setDistrict={setDistrict} withAll />

      {/* PDF of the judges list for this district */}
      <DistrictPdfBar section="JUDGES_LIST" district={district} />

      {/* Search box */}
      <div className="card search-card">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search by name, designation, court number or jurisdiction"
        />
      </div>

      {/* Vacant courts (no judge between two transfers), shown only when there are any */}
      {(vacantCount > 0 || vacantOnly) && (
        <div className="qa-filter-row">
          <button type="button" className={`qa-filter-btn${vacantOnly ? ' active' : ''}`} onClick={() => setVacantOnly(v => !v)}>
            Vacant courts ({vacantCount})
          </button>
        </div>
      )}

      {/* Open or close every group at once */}
      {!loading && !error && visible.length > 0 && !searching && (
        <div className="place-groups__bar">
          <button type="button" className="btn-outline btn-outline--sm" onClick={toggleAll}>
            {anyOpen ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      )}

      {/* Show loading rows, an error with retry, an empty message or the judge cards */}
      {loading ? <LoadingRows /> : error ? <ErrorState message={error} onRetry={() => fetchData()} /> :
        visible.length === 0
          ? <p className="qa-empty">No judges found.</p>
          : (
            <>
              <div className="place-groups">
                {buildTree(shown).map((c, ci) => {
                  const courtOpen = !showCourtLevel || isOpen(c.key)
                  return (
                    <section className="place-group" key={c.key || ci}>
                      {showCourtLevel && (
                        <GroupHeader level="court" open={courtOpen} count={counts.get(c.key)} onToggle={() => toggleGroup(c.key)}>
                          {!c.name ? 'Court not stated' : isHighCourt(c.name) ? c.name : `${c.name} Court`}
                        </GroupHeader>
                      )}
                      {courtOpen && c.districts.map(d => {
                        const own = isOwnDistrict(d.court, d.name)
                        const withDistrict = showDistrictLevel && !own && d.name
                        const districtOpen = !withDistrict || isOpen(d.key)
                        return (
                          <Fragment key={d.key}>
                            {withDistrict && (
                              <GroupHeader level="district" open={districtOpen} count={counts.get(d.key)} onToggle={() => toggleGroup(d.key)}>
                                {d.name} District
                              </GroupHeader>
                            )}
                            {districtOpen && d.places.map(pl => {
                              const hasPlace = !!pl.building
                              const placeOpen = !hasPlace || isOpen(pl.key)
                              return (
                                <Fragment key={pl.key}>
                                  {hasPlace && (
                                    <GroupHeader level="place" nested={!!withDistrict} open={placeOpen} count={counts.get(pl.key)} onToggle={() => toggleGroup(pl.key)}>
                                      {pl.building}
                                    </GroupHeader>
                                  )}
                                  {placeOpen && (
                                    <div className="judge-grid place-group__grid">
                                      {pl.items.map(j => <JudgeCard key={j.id} judge={j} />)}
                                    </div>
                                  )}
                                </Fragment>
                              )
                            })}
                          </Fragment>
                        )
                      })}
                    </section>
                  )
                })}
              </div>
              <SeeMore remaining={remaining} onClick={showMore} step={nextStep} />
            </>
          )
      }
    </div>
  )
}

// Name and designation of a link judge, or a dash when there is none
function LinkCell({ judge }) {
  if (!judge) return <span className="qa-muted">—</span>

  return (
    <div className="qa-linkcell">
      <span className="qa-linkcell__name">{judge.name}</span>
      {judge.designation && <span className="qa-subtext">{judge.designation}</span>}
    </div>
  )
}

// Quick Access: bail roster table for the selected court and district
function BailRoster() {
  const { court, setCourt, district, setDistrict, ready } = useCourtSelection()
  const [roster,    setRoster]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  // Load the bail roster from the API for the selected court and district
  // silent = a quiet background refresh: no spinner, and a failure keeps what is on screen
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(null) }
    try {
      const result = await api.bailRoster.list({
        court: court !== 'All' ? court : undefined,
        district: district !== 'All' ? district : undefined,
      })
      setRoster(Array.isArray(result) ? result : result.content || [])
    } catch (e) { if (!silent) setError(getErrorMessage(e, "We couldn't load the bail roster. Please try again.")) }
    finally { if (!silent) setLoading(false) }
  }, [court, district])

  useEffect(() => { if (ready) fetchData() }, [fetchData, ready])
  useEffect(() => onLiveRefresh(() => { if (ready) fetchData(true) }), [fetchData, ready])

  return (
    <div>
      {/* Court and district filters */}
      <CourtFilter court={court} setCourt={setCourt} district={district} setDistrict={setDistrict} />

      {/* PDF of the bail roster for this district */}
      <DistrictPdfBar section="BAIL_ROSTER" district={district} />

      {/* Show loading rows, an error with retry, an empty message or the roster by year and month */}
      {loading ? <LoadingRows /> : error ? <ErrorState message={error} onRetry={() => fetchData()} /> :
        roster.length === 0
          ? <p className="qa-empty">No bail roster entries found.</p>
          : (
            <ArchiveTree
              stateKey={`qa_bail_${district}`}
              items={roster}
              getDate={rosterIssuedDate}
              renderItems={monthItems => (
                <SeeMoreList items={monthItems} step={25}>
                {shown => (
                <div className="qa-table-wrap">
                  <table className="qa-table">
                    <thead>
                      <tr>
                        <th>Name of Judicial Officer</th>
                        <th>Police Station &amp; Investigation Agencies</th>
                        <th>Link 1 Judicial Officer</th>
                        <th>Link 2 Judicial Officer</th>
                        <th>Valid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map(b => (
                        <tr key={b.id}>
                          <td className="qa-cell-multiline">
                            {(b.judicialOfficers || []).length > 0
                              ? b.judicialOfficers.map(j => (
                                  <div key={j.id}>
                                    <strong>{j.name}</strong>
                                    {j.designation && <span className="qa-subtext">{j.designation}</span>}
                                  </div>
                                ))
                              : <strong>{b.judicialOfficersText}</strong>}
                          </td>
                          <td className="qa-cell-multiline">{b.policeStationAgencies || '—'}</td>
                          <td><LinkCell judge={b.linkOneJudge} /></td>
                          <td><LinkCell judge={b.linkTwoJudge} /></td>
                          <td><ValidityCell entry={b} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}
                </SeeMoreList>
              )}
            />
          )
      }
    </div>
  )
}

// Quick Access: duty magistrate table for the selected court and district
function DutyMagistrate() {
  const { court, setCourt, district, setDistrict, ready } = useCourtSelection()
  const [roster,    setRoster]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  // Load duty magistrates from the API for the selected court and district
  // silent = a quiet background refresh: no spinner, and a failure keeps what is on screen
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(null) }
    try {
      const result = await api.dutyMagistrate.list({
        court: court !== 'All' ? court : undefined,
        district: district !== 'All' ? district : undefined,
      })
      setRoster(Array.isArray(result) ? result : result.content || [])
    } catch (e) { if (!silent) setError(getErrorMessage(e, "We couldn't load the duty magistrate list. Please try again.")) }
    finally { if (!silent) setLoading(false) }
  }, [court, district])

  useEffect(() => { if (ready) fetchData() }, [fetchData, ready])
  useEffect(() => onLiveRefresh(() => { if (ready) fetchData(true) }), [fetchData, ready])

  return (
    <div>
      {/* Court and district filters */}
      <CourtFilter court={court} setCourt={setCourt} district={district} setDistrict={setDistrict} />

      {/* PDF of the duty magistrate list for this district */}
      <DistrictPdfBar section="DUTY_MAGISTRATE" district={district} />

      {/* Show loading rows, an error with retry, an empty message or the roster by year and month */}
      {loading ? <LoadingRows /> : error ? <ErrorState message={error} onRetry={() => fetchData()} /> :
        roster.length === 0
          ? <p className="qa-empty">No duty magistrate entries found.</p>
          : (
            <ArchiveTree
              stateKey={`qa_duty_${district}`}
              items={roster}
              getDate={rosterIssuedDate}
              renderItems={monthItems => (
                <SeeMoreList items={monthItems} step={25}>
                {shown => (
                <div className="qa-table-wrap">
                  <table className="qa-table">
                    <thead>
                      <tr>
                        <th>Court No.</th><th>Judge Name</th><th>Designation</th>
                        <th>Working Days</th><th>Holidays</th><th>Valid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map(m => (
                        <tr key={m.id}>
                          <td>{m.courtRoomNo || '—'}</td>
                          <td><strong>{m.judgeName}</strong></td>
                          <td>{m.designation || '—'}</td>
                          <td><DateChips value={m.workingDay} tone="work" /></td>
                          <td><DateChips value={m.holiday} tone="holiday" /></td>
                          <td><ValidityCell entry={m} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}
                </SeeMoreList>
              )}
            />
          )
      }
    </div>
  )
}

// Quick Access: pick a year to view the court calendar PDF
function CourtCalendar() {
  const [years, setYears] = useState([])
  const [yearsLoading, setYearsLoading] = useState(true)
  const [yearsError, setYearsError] = useState('')
  const [year, setYear] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Load the years that have a calendar uploaded
  const loadYears = useCallback(async (silent = false) => {
    if (!silent) { setYearsLoading(true); setYearsError('') }
    try {
      const res = await api.courtCalendar.list()
      const list = Array.isArray(res) ? res : []
      setYears([...new Set(list.map(c => c.year))].sort((a, b) => b - a))
    } catch (e) {
      if (!silent) setYearsError(getErrorMessage(e, 'Could not load available calendar years.'))
    } finally {
      if (!silent) setYearsLoading(false)
    }
  }, [])

  useEffect(() => { loadYears() }, [loadYears])
  useEffect(() => onLiveRefresh(() => loadYears(true)), [loadYears])

  // Free the PDF blob URL when it changes or the page closes
  useEffect(() => {
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl) }
  }, [pdfUrl])

  // Download the PDF for the chosen year and show it, releasing the previous one
  const openYear = useCallback(async (y) => {
    setYear(y)
    setLoading(true)
    setError('')
    setPdfUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    try {
      const blob = await api.courtCalendar.get(y)
      setPdfUrl(URL.createObjectURL(blob))
    } catch (e) {
      setError(getErrorMessage(e, `No calendar PDF found for ${y}.`))
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div>
      {/* Years loading, years error, no calendar uploaded, or the list of year buttons */}
      {yearsLoading && <p className="qa-empty">Loading available years…</p>}

      {!yearsLoading && yearsError && (
        <ErrorState message={yearsError} onRetry={() => loadYears()} />
      )}

      {!yearsLoading && !yearsError && years.length === 0 && (
        <p className="qa-empty">No court calendar has been uploaded yet.</p>
      )}

      {!yearsLoading && !yearsError && years.length > 0 && (
        <>
          <p className="qa-empty u-mb-16">
            Select a year to open the court calendar PDF.
          </p>

          <div className="qa-year-select">
            {years.map(y => (
              <button
                key={y}
                className={`qa-year-btn${year === y && !error ? ' active' : ''}`}
                onClick={() => openYear(y)}
                disabled={loading}
              >
                <span className="qa-year-btn__icon"><Icon name="calendar" /></span>
                {y}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Opening message and error while the PDF loads */}
      {loading && <p className="qa-empty">Opening {year} calendar…</p>}
      {error && <ErrorState message={error} onRetry={() => openYear(year)} />}

      {/* PDF viewer with a toolbar */}
      {pdfUrl && !loading && !error && (
        <div className="qa-calendar-viewer">
          <div className="qa-calendar-viewer__toolbar">
            <span className="qa-calendar-viewer__label"><Icon name="calendar" /> {year} Court Calendar</span>
            <div className="qa-calendar-viewer__actions">
              <button type="button"
                className="btn-outline btn-outline--sm"
                onClick={() => printPdfUrl(pdfUrl)}
                title="Print"
              >
                <Icon name="print" /> Print
              </button>
              {canEmbedPdf() && (
                <button type="button"
                  className="btn-outline btn-outline--sm"
                  onClick={() => window.open(pdfUrl, '_blank', 'noopener')}
                  title="Open in a new tab"
                >
                  <Icon name="copy" /> New tab
                </button>
              )}
              {/* Download the PDF */}
              <a
                className="btn-outline btn-outline--sm"
                href={pdfUrl}
                download={`court-calendar-${year}.pdf`}
              >
                <Icon name="download" /> Download
              </a>
            </div>
          </div>
          {/* Whole PDF shown at full length on the page (scrolls with the page on every device) */}
          <PdfFrame
            url={pdfUrl}
            title={`${year} Court Calendar`}
            fullLength
          />
        </div>
      )}
    </div>
  )
}

// Label and value line, with the value as a phone or email link when a type is given
function ContactLine({ label, value, type }) {
  if (!value || value === '—') return null
  let inner = value
  if (type === 'tel') {
    const first = String(value).split(/[·/,]/)[0].trim().replace(/\s/g, '')
    inner = <a className="qa-link" href={`tel:${first}`}>{value}</a>
  } else if (type === 'mail') {
    inner = <a className="qa-link" href={`mailto:${value}`}>{value}</a>
  }
  return (
    <p className="qa-pd-line">
      <span className="qa-pd-line__label">{label}</span>
      <span className="qa-pd-line__value">{inner}</span>
    </p>
  )
}

// Block with a badge, title and contact lines for one police officer or office
function OfficerBlock({ tone, badge, title, office }) {
  if (!office) return null
  return (
    <div className={`qa-pd-officer qa-pd-officer--${tone}`}>
      <div className="qa-pd-officer__head">
        <span className={`qa-pd-badge qa-pd-badge--${tone}`}>{badge}</span>
        <span className="qa-pd-officer__title">{title || office.post}</span>
      </div>
      <ContactLine label="Office" value={office.address} />
      <ContactLine label="Phone"  value={office.phone} type="tel" />
      <ContactLine label="E-mail" value={office.email} type="mail" />
    </div>
  )
}

// Collapsible card for one police station with the SHO and senior officer contacts
function StationCard({ entry, cawHq, expanded, onToggle }) {
  // Station address, with the PIN code added when present
  const addr = [entry.stationAddress, entry.stationPin && `Delhi – ${entry.stationPin}`]
    .filter(Boolean).join(', ')

  return (
    <div className={`qa-pd-card${expanded ? ' qa-pd-card--open' : ''}`}>
      <button type="button" className="qa-pd-card__head" onClick={onToggle}>
        <div className="qa-avatar qa-avatar--navy"><Icon name="shield" /></div>
        <div className="qa-pd-card__titles">
          <p className="qa-row__primary">PS {entry.station}</p>
          <p className="qa-row__secondary">
            {entry.district} District · {entry.subDivision} Sub-Division
          </p>
        </div>
        <span className="qa-card__arrow">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Station details shown only when the card is open */}
      {expanded && (
        <div className="qa-pd-card__body">
          {/* SHO contact details */}
          {(addr || entry.stationPhone || entry.stationEmail) && (
            <div className="qa-pd-officer qa-pd-officer--plain">
              <div className="qa-pd-officer__head">
                <span className="qa-pd-badge qa-pd-badge--plain">SHO</span>
                <span className="qa-pd-officer__title">SHO, Police Station {entry.station}</span>
              </div>
              <ContactLine label="Address" value={addr} />
              <ContactLine label="Phone"   value={entry.stationPhone} type="tel" />
              <ContactLine label="E-mail"  value={entry.stationEmail} type="mail" />
            </div>
          )}

          {/* DCP, any additional DCPs, ACP and CAW officers */}
          <OfficerBlock tone="navy" badge="DCP"  title={entry.dcp.post} office={entry.dcp} />

          {entry.addlDcp.map(a => (
            <OfficerBlock key={a.post} tone="slate" badge="Additional DCP" title={a.post} office={a} />
          ))}

          <OfficerBlock tone="gold" badge="ACP"  title={entry.acp.post} office={entry.acp} />
          <OfficerBlock tone="rose" badge="CAW"  title={entry.caw.post} office={entry.caw} />

          {/* CAW headquarters, shown only when it has details */}
          {(cawHq?.post || cawHq?.address) && (
            <div className="qa-pd-officer qa-pd-officer--rose">
              <div className="qa-pd-officer__head">
                <span className="qa-pd-badge qa-pd-badge--rose">CAW HQ</span>
                <span className="qa-pd-officer__title">{cawHq.post}</span>
              </div>
              <ContactLine label="Office" value={cawHq.address} />
              {cawHq.note && <p className="qa-pd-hqnote">{cawHq.note}</p>}
            </div>
          )}

          {/* District, range and district headquarters */}
          <p className="qa-pd-foot">
            {entry.district} District · {entry.range} · District HQ: {entry.hq}
          </p>
        </div>
      )}
    </div>
  )
}

// Quick Access: search police stations and see officer contact details
function PoliceDirectory() {
  const { directory, loading, error, reload } = usePoliceDirectory()

  const [query,      setQuery]      = useSessionState('qa_police_query', '')
  const [districtId, setDistrictId] = useSessionState('qa_police_district', 'all')
  const [openKey,    setOpenKey]    = useSessionState('qa_police_open', null)

  const chooseDistrict = id => { setDistrictId(id); setOpenKey(null) }

  // Station index, district choices and search results
  const index   = useMemo(() => buildStationIndex(directory), [directory])
  // District options and the stations matching the search
  const options = useMemo(() => districtOptions(directory), [directory])
  const results = useMemo(
    () => searchStations(index, query, districtId),
    [index, query, districtId]
  )
  const stationsStep = 30
  const { visible: shown, remaining: stationsRemaining, showMore: showMoreStations, step: showMoreStationsStep } =
    useSeeMore(results, `${query}|${districtId}`, stationsStep, openKey ? results.findIndex(r => r.key === openKey) + 1 : 0)

  // Show an error with retry, a loading message or an empty message until the directory loads
  if (!directory) {
    return error
      ? (
        <p className="qa-empty">
          {error}{' '}
          <button type="button" className="qa-filter-btn" onClick={reload}>Retry</button>
        </p>
      )
      : <p className="qa-empty">{loading ? 'Loading police directory…' : 'No police directory available.'}</p>
  }

  // Directory loaded but has no stations
  if (index.length === 0) {
    return (
      <p className="qa-empty">
        The police directory is empty. An administrator can add police stations from
        Admin → Police Directory.
      </p>
    )
  }

  return (
    <div className="qa-pd">
      {/* Search box */}
      <div className="card search-card">
        <SearchInput
          value={query}
          onChange={v => { setQuery(v); setOpenKey(null) }}
          placeholder="Search by police station — e.g. Saket, Kalkaji, Tilak Nagar, 110017"
        />
      </div>

      {/* District filter buttons */}
      <div className="qa-filter-row">
        {options.map(d => (
          <button
            key={d.id}
            className={`qa-filter-btn${districtId === d.id ? ' active' : ''}`}
            onClick={() => chooseDistrict(d.id)}
          >{d.name}</button>
        ))}
      </div>

      {/* Result count */}
      <div className="qa-section-header">
        <span className="qa-dot qa-dot--navy" />
        <span>
          {results.length} police station{results.length !== 1 ? 's' : ''}
          {query ? ` matching “${query}”` : ''}
        </span>
      </div>

      {/* Station cards, one per result, only one open at a time */}
      {results.length === 0
        ? <p className="qa-empty">No police station matches that search.</p>
        : shown.map(e => (
            <StationCard
              key={e.key}
              entry={e}
              cawHq={directory.cawHeadquarter}
              expanded={openKey === e.key}
              onToggle={() => setOpenKey(openKey === e.key ? null : e.key)}
            />
          ))}

      {/* Load the next page of stations */}
      <SeeMore remaining={stationsRemaining} onClick={showMoreStations} step={showMoreStationsStep} />

      {/* Note about where the data comes from */}
      <p className="qa-pd-note">{buildSourceNote(directory)}</p>
    </div>
  )
}

// Jurisdiction categories shown as buttons
const JURISDICTION_CATEGORIES = [
  { id: 'consumer', icon: 'cart', label: 'Consumer Court Jurisdiction' },
  { id: 'drt',       icon: 'court', label: 'DRT Jurisdiction'            },
  { id: 'civil',     icon: 'scale', label: 'Civil Court Jurisdiction'    },
  { id: 'criminal',  icon: 'lock', label: 'Criminal Jurisdiction'       },
]

// Buttons to choose the jurisdiction category
function JurisdictionCategoryPicker({ category, setCategory }) {
  return (
    <div className="qa-jur-cats">
      {JURISDICTION_CATEGORIES.map(c => (
        <button
          key={c.id}
          className={`qa-jur-cat${category === c.id ? ' active' : ''}`}
          onClick={() => setCategory(c.id)}
        >
          <span className="qa-jur-cat__icon"><Icon name={c.icon} duotone /></span>
          <span>{c.label}</span>
        </button>
      ))}
    </div>
  )
}

// Placeholder for categories that have no data yet
function JurisdictionComingSoon({ label }) {
  return (
    <p className="qa-empty">
      {label} jurisdiction data hasn't been added yet — check back soon.
    </p>
  )
}

// Table of Debts Recovery Tribunals, with optional serial number and amount columns and a highlighted row
function DrtTable({ rows, highlightId, showSno = true, showAmount = true }) {
  // Show the rows a page at a time, keeping the highlighted tribunal visible
  const highlightAt = highlightId ? rows.findIndex(r => r.tribunal.id === highlightId) + 1 : 0
  const { visible, remaining, showMore, step: nextStep } = useSeeMore(rows, rows.length, 25, highlightAt)

  return (
    <>
    <div className="qa-table-wrap">
      <table className="qa-table">
        <thead>
          <tr>
            {showSno && <th>S. No.</th>}
            <th>Name of Debts Recovery Tribunal</th>
            <th>Location</th>
            {showAmount && <th>Amount of Debt</th>}
            <th>Phone Number</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(row => (
            <tr
              key={row.sno}
              className={highlightId && row.tribunal.id === highlightId ? 'qa-table-row--highlight' : undefined}
            >
              {showSno && <td>{row.sno}</td>}
              <td className="qa-cell-multiline"><strong>{row.name}</strong></td>
              <td className="qa-cell-multiline">
                <span className="qa-loc-cell">
                  {row.location}
                  <a
                    className="qa-loc-icon"
                    href={mapsLink(row.location)}
                    target="_blank"
                    rel="noreferrer"
                    title="Open location in Google Maps"
                    aria-label="Open location in Google Maps"
                  >
                    <Icon name="pin-map" />
                  </a>
                </span>
              </td>
              {showAmount && <td className="qa-cell-multiline">{row.amount}</td>}
              <td className="qa-cell-multiline">
                {row.phone && <a className="qa-link" href={telLink(row.phone)}>{row.phone}</a>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <SeeMore remaining={remaining} onClick={showMore} step={nextStep} />
    </>
  )
}

// Show the error, loading or empty message for a jurisdiction directory, or nothing once data is ready
function JurisdictionState({ directory, loading, error, reload, empty, emptyText }) {
  if (!directory) {
    return error
      ? <ErrorState message={error} onRetry={reload} />
      : loading ? <LoadingRows /> : null
  }
  if (empty) return <p className="qa-empty">{emptyText}</p>
  return null
}

// Quick Access: find the right Debts Recovery Tribunal by debt amount and police station
function DrtJurisdiction() {
  const { directory, loading, error, reload } = useDrtJurisdiction()
  // Benches and tribunals arranged for the DRT view
  const model = useMemo(() => buildDrtModel(directory), [directory])
  const [amountChoice, setAmountChoice] = useSessionState('qa_drt_amount', null)
  const [station,      setStation]      = useSessionState('qa_drt_station', '')
  const [result,       setResult]       = useSessionState('qa_drt_result', null)

  const found = result && result !== 'notfound'

  // Choosing an amount clears the station, and for the high amount shows the high value tribunal straight away
  const chooseAmount = id => {
    setAmountChoice(id)
    setStation('')
    setResult(id === 'gte100' && model.highValue ? { tribunal: model.highValue, note: model.highValue.note } : null)
  }

  // Typing in the station box clears the previous result
  const changeStation = value => {
    setStation(value)
    setResult(null)
  }

  // Look up the tribunal for the entered police station
  const submitStation = () => {
    const match = findDrtTribunalByStation(model, station)
    setResult(match
      ? { tribunal: match, note: `${station.trim()} falls under ${match.districtsLabel}.` }
      : 'notfound')
  }

  // Clear the amount, station and result
  const reset = () => {
    setAmountChoice(null); setStation(''); setResult(null)
  }

  // Show loading, error or empty state instead of the finder when there is no data
  const stateView = JurisdictionState({
    directory, loading, error, reload,
    empty: model.isEmpty,
    emptyText: 'DRT jurisdiction data has not been added yet.',
  })
  if (stateView) return stateView

  return (
    <div className="qa-jur-flow">
      {/* Search by amount and jurisdiction */}
      <div className="qa-jur-search">
        <p className="qa-section-header">
          <span><Icon name="search" /> Search by Amount of Debt &amp; Jurisdiction</span>
        </p>
        <div className="qa-jur-step">
          <label className="form-label">Amount of Debt</label>
          <div className="qa-jur-cats">
            {DRT_AMOUNT_OPTIONS.map(o => (
              <button
                key={o.id}
                className={`qa-jur-cat${amountChoice === o.id ? ' active' : ''}`}
                onClick={() => chooseAmount(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lower amount: ask for the police station to find the tribunal */}
        {amountChoice === 'lt100' && (
          <div className="qa-jur-step">
            <label className="form-label">Jurisdiction</label>
            <div className="qa-jur-search-row">
              <div className="qa-jur-search-row__input">
                <SuggestInput
                  value={station}
                  onChange={changeStation}
                  options={model.stationOptions}
                  placeholder="Start typing a police station — e.g. Saket, Kalkaji, Model Town"
                />
              </div>
              <button type="button"
                className="btn-gold qa-jur-search-row__btn"
                disabled={!station.trim()}
                onClick={submitStation}
              >
                Find Tribunal <Icon name="arrow-right" />
              </button>
            </div>
            {/* Shown when the station isn't in either DRT list */}
            {result === 'notfound' && (
              <p className="qa-empty qa-mt-sm">
                “{station.trim()}” doesn't match a police station in either DRT jurisdiction list.
                Check the spelling, or pick a suggestion from the list.
              </p>
            )}
          </div>
        )}

        {/* Matching tribunal, with a button to start over */}
        {found && (
          <div className="qa-jur-result">
            <DrtTable
              rows={model.rows.filter(r => r.tribunal.id === result.tribunal.id)}
              highlightId={result.tribunal.id}
              showSno={false}
              showAmount={false}
            />
            <div className="form-actions qa-mt-md">
              <button type="button" className="btn-outline" onClick={reset}>Start Over</button>
            </div>
          </div>
        )}
      </div>

      {/* Full list of tribunals from the gazette notification */}
      <p className="qa-section-header">
        <span>Gazette Notification — Debts Recovery Tribunal Jurisdiction, Delhi</span>
      </p>
      <DrtTable rows={model.rows} />

      {/* Appellate tribunal details */}
      {model.appellate && (
        <>
          <p className="qa-section-header qa-mt-lg">
            <span>Debts Recovery Appellate Tribunal</span>
          </p>
          <div className="qa-drat-card">
            <p className="qa-drat-card__name"><strong>{model.appellate.name}</strong></p>
            <p className="qa-drat-card__line">
              <span className="qa-loc-cell">
                {model.appellate.location}
                <a
                  className="qa-loc-icon"
                  href={mapsLink(model.appellate.location)}
                  target="_blank"
                  rel="noreferrer"
                  title="Open location in Google Maps"
                  aria-label="Open location in Google Maps"
                >
                  <Icon name="pin-map" />
                </a>
              </span>
            </p>
            {model.appellate.phone && (
              <p className="qa-drat-card__line">
                <a className="qa-link" href={telLink(model.appellate.phone)}>{model.appellate.phone}</a>
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// Table of District Consumer Commissions with a maps link for each address
function ConsumerCommissionTable({ rows, highlightId, showSno = true }) {
  // Show the rows a page at a time, keeping the highlighted commission visible
  const highlightAt = highlightId ? rows.findIndex(r => r.id === highlightId) + 1 : 0
  const { visible, remaining, showMore, step: nextStep } = useSeeMore(rows, rows.length, 25, highlightAt)

  return (
    <>
    <div className="qa-table-wrap">
      <table className="qa-table">
        <thead>
          <tr>
            {showSno && <th>S. No.</th>}
            <th>District Consumer Commission</th>
            <th>Address</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(row => (
            <tr
              key={row.id}
              className={highlightId && row.id === highlightId ? 'qa-table-row--highlight' : undefined}
            >
              {showSno && <td>{row.sno}</td>}
              <td className="qa-cell-multiline"><strong>{row.name}</strong></td>
              <td className="qa-cell-multiline">
                <span className="qa-loc-cell">
                  {row.location}
                  <a
                    className="qa-loc-icon"
                    href={mapsLink(row.location)}
                    target="_blank"
                    rel="noreferrer"
                    title="Open location in Google Maps"
                    aria-label="Open location in Google Maps"
                  >
                    <Icon name="pin-map" />
                  </a>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <SeeMore remaining={remaining} onClick={showMore} step={nextStep} />
    </>
  )
}

// Card for a single commission (state or national) with a maps link
function ConsumerCommissionCard({ commission }) {
  return (
    <div className="qa-drat-card">
      <p className="qa-drat-card__name"><strong>{commission.name}</strong></p>
      <p className="qa-drat-card__line">
        <span className="qa-loc-cell">
          {commission.location}
          <a
            className="qa-loc-icon"
            href={mapsLink(commission.location)}
            target="_blank"
            rel="noreferrer"
            title="Open location in Google Maps"
            aria-label="Open location in Google Maps"
          >
            <Icon name="pin-map" />
          </a>
        </span>
      </p>
    </div>
  )
}

// Quick Access: find the right Consumer Commission by claim value and police station
function ConsumerJurisdiction() {
  const { directory, loading, error, reload } = useConsumerJurisdiction()
  // Consumer commissions arranged for the consumer view
  const model = useMemo(() => buildConsumerModel(directory), [directory])
  const [pecuniary, setPecuniary] = useSessionState('qa_consumer_pecuniary', null)
  const [station,   setStation]   = useSessionState('qa_consumer_station', '')
  const [result,    setResult]    = useSessionState('qa_consumer_result', null)

  const found = result && result !== 'notfound'

  // Up to 1 crore needs a police station. 1 to 10 crore goes to the State commission and above 10 crore to the National commission
  const choosePecuniary = id => {
    setPecuniary(id)
    setStation('')
    if (id === '1to10' && model.state)          setResult({ commission: model.state })
    else if (id === 'above10' && model.national) setResult({ commission: model.national })
    else                                          setResult(null)
  }

  // Typing in the station box clears the previous result
  const changeStation = value => {
    setStation(value)
    setResult(null)
  }

  // Look up the district commission for the entered police station
  const submitStation = () => {
    const match = findConsumerCommissionByStation(model, station)
    setResult(match
      ? { commission: match, note: `${station.trim()} falls under ${match.name}.` }
      : 'notfound')
  }

  // Clear the choice, station and result
  const reset = () => {
    setPecuniary(null); setStation(''); setResult(null)
  }

  // Show loading, error or empty state instead of the finder when there is no data
  const stateView = JurisdictionState({
    directory, loading, error, reload,
    empty: model.isEmpty,
    emptyText: 'Consumer commission jurisdiction data has not been added yet.',
  })
  if (stateView) return stateView

  return (
    <div className="qa-jur-flow">
      {/* Search by claim value and jurisdiction */}
      <div className="qa-jur-search">
        <p className="qa-section-header">
          <span><Icon name="search" /> Search by Pecuniary Jurisdiction &amp; Jurisdiction</span>
        </p>
        <div className="qa-jur-step">
          <label className="form-label">Pecuniary Jurisdiction Limit</label>
          <div className="qa-jur-cats">
            {CONSUMER_PECUNIARY_OPTIONS.map(o => (
              <button
                key={o.id}
                className={`qa-jur-cat${pecuniary === o.id ? ' active' : ''}`}
                onClick={() => choosePecuniary(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lowest limit: ask for the police station to find the district commission */}
        {pecuniary === 'upto1' && (
          <div className="qa-jur-step">
            <label className="form-label">Jurisdiction</label>
            <div className="qa-jur-search-row">
              <div className="qa-jur-search-row__input">
                <SuggestInput
                  value={station}
                  onChange={changeStation}
                  options={model.stationOptions}
                  placeholder="Start typing a police station — e.g. Kalkaji, Hauz Khas, Rohini"
                />
              </div>
              <button type="button"
                className="btn-gold qa-jur-search-row__btn"
                disabled={!station.trim()}
                onClick={submitStation}
              >
                Find Commission <Icon name="arrow-right" />
              </button>
            </div>
            {/* Shown when the station isn't in any district commission's area */}
            {result === 'notfound' && (
              <p className="qa-empty qa-mt-sm">
                “{station.trim()}” doesn't match a police station in any District Commission's jurisdiction.
                Check the spelling, or pick a suggestion from the list.
              </p>
            )}
          </div>
        )}

        {/* Matching commission, with a button to start over */}
        {found && (
          <div className="qa-jur-result">
            {result.commission.kind === 'DISTRICT'
              ? <ConsumerCommissionTable rows={[result.commission]} highlightId={result.commission.id} showSno={false} />
              : <ConsumerCommissionCard commission={result.commission} />}
            <div className="form-actions qa-mt-md">
              <button type="button" className="btn-outline" onClick={reset}>Start Over</button>
            </div>
          </div>
        )}
      </div>

      {/* All district commissions */}
      <p className="qa-section-header">
        <span>District Consumer Disputes Redressal Commissions, Delhi</span>
      </p>
      <ConsumerCommissionTable rows={model.districts} />

      {/* State commission */}
      {model.state && (
        <>
          <p className="qa-section-header qa-mt-lg">
            <span>Delhi State Consumer Commission (SCDRC)</span>
          </p>
          <ConsumerCommissionCard commission={model.state} />
        </>
      )}

      {/* National commission */}
      {model.national && (
        <>
          <p className="qa-section-header qa-mt-lg">
            <span>National Consumer Commission (NCDRC)</span>
          </p>
          <ConsumerCommissionCard commission={model.national} />
        </>
      )}
    </div>
  )
}

// Quick Access: pick a jurisdiction category. Civil and criminal have no data yet
function FindJurisdiction() {
  const [category, setCategory] = useSessionState('qa_jurisdiction_category', 'consumer')

  return (
    <div>
      <JurisdictionCategoryPicker category={category} setCategory={setCategory} />
      {category === 'consumer' && <ConsumerJurisdiction />}
      {category === 'drt'      && <DrtJurisdiction />}
      {category === 'civil'    && <JurisdictionComingSoon label="Civil Court" />}
      {category === 'criminal' && <JurisdictionComingSoon label="Criminal" />}
    </div>
  )
}

// Quick Access cards: id, icon, title and subtitle for each section
const MENU_ITEMS = [
  { id: 'list',         icon: 'scale',  label: 'Judges List',            subtitle: 'Complete bench directory – all courts' },
  { id: 'successor',    icon: 'bank',   label: 'Successor Courts',       subtitle: 'Court history — court, district, building' },
  { id: 'bail',         icon: 'gavel',  label: 'Bail Roster',            subtitle: 'Court-wise bail hearing schedule'      },
  { id: 'magistrate',   icon: 'bank',  label: 'Duty Magistrate Roster', subtitle: 'Duty & emergency magistrates'          },
  { id: 'calendar',     icon: 'calendar',  label: 'Court Calendar',         subtitle: 'Yearly court calendar — pick a year'   },
  { id: 'police',       icon: 'shield',  label: 'Police Directory',       subtitle: 'DCP, ACP & CAW — search by police station' },
  { id: 'jurisdiction', icon: 'pin-map',  label: 'Find Jurisdiction',      subtitle: 'Consumer, DRT, Civil & Criminal jurisdiction' },
]

// Quick Access page: a card for each section, the chosen one opens in a panel below
export default function QuickAccess() {
  const { judgeLeaveJumpQuery, setJudgeLeaveJumpQuery } = useApp()
  const [active, setActive] = useSessionState('qa_active', null)
  const [judgeQuery, setJudgeQuery] = useState('')
  const selected = MENU_ITEMS.find(m => m.id === active)

  useEffect(() => {
    if (!active || !window.matchMedia('(max-width: 640px)').matches) return
    document.querySelector('.qa-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [active])

  // Open the judges list pre-filled with this judge's name
  const jumpToJudge = name => {
    setJudgeQuery(name)
    setActive('list')
  }

  // When another page asks to jump to a judge, open the list for them and clear the request
  useEffect(() => {
    if (!judgeLeaveJumpQuery) return
    jumpToJudge(judgeLeaveJumpQuery)
    setJudgeLeaveJumpQuery(null)
  }, [judgeLeaveJumpQuery])

  return (
    <div>
      {/* Page title */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Quick Access</h1>
          <p className="page-subtitle">Delhi District Courts — rosters &amp; duty schedules</p>
        </div>
      </div>

      {/* Section cards, clicking the open one closes it */}
      <div className="qa-cards">
        {MENU_ITEMS.map(item => (
          <button key={item.id}
            className={`qa-card${active === item.id ? ' qa-card--active' : ''}`}
            onClick={() => {
              setJudgeQuery('')
              setActive(active === item.id ? null : item.id)
            }}
          >
            <span className="qa-card__icon"><Icon name={item.icon} duotone /></span>
            <div>
              <p className="qa-card__label">{item.label}</p>
              <p className="qa-card__sub">{item.subtitle}</p>
            </div>
            <span className="qa-card__arrow">{active === item.id ? '▲' : '▼'}</span>
          </button>
        ))}
      </div>

      {/* Panel for the open section, with its title and a close button */}
      {active && (
        <div className="qa-panel card">
          <div className="qa-panel__header">
            <span className="qa-panel__icon"><Icon name={selected.icon} /></span>
            <div>
              <h2 className="qa-panel__title">{selected.label}</h2>
              <p className="qa-panel__sub">{selected.subtitle}</p>
            </div>
            <button type="button" className="qa-close" onClick={() => setActive(null)}><Icon name="close" /></button>
          </div>
          {/* Content of the open section */}
          <div className="qa-panel__body">
            {active === 'list'       && <JudgesList initialQuery={judgeQuery} jumpName={judgeQuery} />}
            {active === 'successor'  && <SuccessorCourts />}
            {active === 'bail'       && <BailRoster />}
            {active === 'magistrate' && <DutyMagistrate />}
            {active === 'calendar'   && <CourtCalendar />}
            {active === 'police'     && <PoliceDirectory />}
            {active === 'jurisdiction' && <FindJurisdiction />}
          </div>
        </div>
      )}
    </div>
  )
}