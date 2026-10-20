import { Fragment } from 'react'
import SeeMore from '../common/SeeMore'
import useSessionState from '../../hooks/useSessionState'
import useGroupedSeeMore from '../../hooks/useGroupedSeeMore'
import { isHighCourt, buildingWithFloor } from '../../constants/courts'

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

// Orders entries court, then building (no building last), then court no. (1, 2, 10 — not 1, 10, 2)
export function sortByPlace(entries) {
  return [...entries].sort((a, b) =>
    collator.compare(a.court || '', b.court || '')
    || collator.compare(a.district || '', b.district || '')
    || (a.building ? 0 : 1) - (b.building ? 0 : 1)
    || collator.compare(a.building || '', b.building || '')
    || collator.compare(a.courtRoomNo || '', b.courtRoomNo || ''))
}

// Cards grouped court wise (Saket Court), then district wise (South District), then building wise, then court no. wise.
// The court, district and building headings open and close; what the admin closed is remembered for the session
// (storageKey), and Collapse all / Expand all sit above the groups.
// entries: [{ key, court, district, building, floor, courtRoomNo, node }] already sorted with sortByPlace.
// byCourt = false (one court picked in the filter) leaves out the court level and starts at the districts.
// A district heading is drawn for every district court that has a district; high courts have none and go straight to the buildings.
// Entries without a court (a judge who holds none) go in a last group named by emptyLabel.
export default function PlaceGroupedGrid({ entries: allEntries, byCourt = true, emptyLabel = 'No court', footer, storageKey = 'place_groups', step, resetKey = '' }) {
  const [closed, setClosed] = useSessionState(`admin_${storageKey}_closed`, [])
  const isClosed = id => closed.includes(id)
  const toggle = id => setClosed(list => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]))

  const idsOf = e => {
    const courtKey = byCourt ? (e.court || '') : 'all'
    const named = !!e.court && !isHighCourt(e.court) && !!e.district
    const dKey = named ? e.district : ''
    const bKey = e.court ? (e.building || '') : ''
    return {
      courtId: byCourt ? `c:${courtKey}` : '',
      districtId: named ? `d:${courtKey}|${dKey}` : '',
      buildingId: e.court ? `b:${courtKey}|${dKey}|${bKey}` : '',
      runId: `${courtKey}|${dKey}|${bKey}`,
    }
  }
  const entryClosed = e => {
    const { courtId, districtId, buildingId } = idsOf(e)
    return [courtId, districtId, buildingId].some(id => id && isClosed(id))
  }

  const totals = {}
  allEntries.forEach(e => {
    const { courtId, districtId, buildingId } = idsOf(e)
    ;[courtId, districtId, buildingId].forEach(id => { if (id) totals[id] = (totals[id] || 0) + 1 })
  })

  const { shown: entries, remaining, showMore, step: nextStep } = useGroupedSeeMore(allEntries, {
    runOf: e => idsOf(e).runId,
    isClosed: entryClosed,
    step,
    resetKey,
  })

  const groups = []
  entries.forEach(e => {
    const courtKey = byCourt ? (e.court || '') : 'all'
    let g = groups[groups.length - 1]
    if (!g || g.key !== courtKey) {
      g = {
        key: courtKey,
        id: `c:${courtKey}`,
        title: !byCourt ? '' : e.court ? (isHighCourt(e.court) ? e.court : `${e.court} Court`) : emptyLabel,
        districts: [],
        count: totals[`c:${courtKey}`] || 0,
      }
      groups.push(g)
    }

    // District level: every district court row that has a district
    const named = !!e.court && !isHighCourt(e.court) && !!e.district
    const dKey = named ? e.district : ''
    let d = g.districts[g.districts.length - 1]
    if (!d || d.key !== dKey) {
      d = { key: dKey, id: `d:${courtKey}|${dKey}`, title: named ? `${e.district} District` : '', buildings: [], count: totals[`d:${courtKey}|${dKey}`] || 0 }
      g.districts.push(d)
    }

    const bKey = e.court ? (e.building || '') : ''
    let b = d.buildings[d.buildings.length - 1]
    if (!b || b.key !== bKey) {
      b = { key: bKey, id: `b:${courtKey}|${dKey}|${bKey}`, title: e.court ? (e.building ? buildingWithFloor(e.building, '') : 'Building not set') : '', items: [], count: totals[`b:${courtKey}|${dKey}|${bKey}`] || 0 }
      d.buildings.push(b)
    }
    b.items.push(e)
  })

  // Every heading that can be closed, for Collapse all
  const allIds = Object.keys(totals).filter(id => !(id === 'c:all'))
  const anyOpen = allIds.some(id => !isClosed(id))

  return (
    <div className="place-groups">
      {allIds.length > 0 && (
        <div className="place-groups__bar">
          <button type="button" className="btn-outline btn-outline--sm" onClick={() => setClosed(anyOpen ? allIds : [])}>
            {anyOpen ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      )}

      {groups.map(g => {
        const courtOpen = !g.title || !isClosed(g.id)
        return (
          <section className="place-group" key={g.key || 'none'}>
            {g.title && (
              <h3 className="place-group__court">
                <button type="button" className="place-group__toggle" aria-expanded={courtOpen} onClick={() => toggle(g.id)}>
                  <span className="place-group__arrow" aria-hidden="true">{courtOpen ? '▲' : '▼'}</span>
                  {g.title}
                  <span className="place-group__count">{g.count}</span>
                </button>
              </h3>
            )}

            {courtOpen && g.districts.map(d => {
              const districtOpen = !d.title || !isClosed(d.id)
              return (
                <Fragment key={d.key || 'none'}>
                  {d.title && (
                    <h4 className="place-group__district">
                      <button type="button" className="place-group__toggle" aria-expanded={districtOpen} onClick={() => toggle(d.id)}>
                        <span className="place-group__arrow" aria-hidden="true">{districtOpen ? '▲' : '▼'}</span>
                        {d.title}
                        <span className="place-group__count">{d.count}</span>
                      </button>
                    </h4>
                  )}

                  {districtOpen && d.buildings.map(b => {
                    const buildingOpen = !b.title || !isClosed(b.id)
                    return (
                      <Fragment key={b.key || 'none'}>
                        {b.title && (
                          <h5 className={`place-group__building${d.title ? ' place-group__building--nested' : ''}`}>
                            <button type="button" className="place-group__toggle" aria-expanded={buildingOpen} onClick={() => toggle(b.id)}>
                              <span className="place-group__arrow" aria-hidden="true">{buildingOpen ? '▲' : '▼'}</span>
                              {b.title}
                              <span className="place-group__count">{b.count}</span>
                            </button>
                          </h5>
                        )}
                        {buildingOpen && (
                          <div className="judge-grid admin-judge-grid place-group__grid">
                            {b.items.map(e => <Fragment key={e.key}>{e.node}</Fragment>)}
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
      {step ? <SeeMore remaining={remaining} onClick={showMore} step={nextStep} /> : null}
      {footer}
    </div>
  )
}