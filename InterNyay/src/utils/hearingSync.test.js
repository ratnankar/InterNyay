import { describe, it, expect } from 'vitest'
import { needsNextHearingUpdate } from './hearingSync'

const CNR = 'DLCT010012342024'
const at = iso => new Date(iso)

describe('needsNextHearingUpdate', () => {
  const open = { status: 'Pending', cnrNo: CNR, nextHearing: '2026-10-26' }

  it('waits for 6 PM IST on the hearing day', () => {
    expect(needsNextHearingUpdate(open, at('2026-10-26T17:59:00+05:30'))).toBe(false)
    expect(needsNextHearingUpdate(open, at('2026-10-26T18:00:00+05:30'))).toBe(true)
  })

  it('shows for an earlier date, hides for a later one', () => {
    expect(needsNextHearingUpdate({ ...open, nextHearing: '2026-10-20' }, at('2026-10-26T09:00:00+05:30'))).toBe(true)
    expect(needsNextHearingUpdate({ ...open, nextHearing: '2026-11-02' }, at('2026-10-26T20:00:00+05:30'))).toBe(false)
  })

  it('needs an open case with a valid CNR and a date', () => {
    const late = at('2026-10-27T10:00:00+05:30')
    expect(needsNextHearingUpdate({ ...open, status: 'Decided' }, late)).toBe(false)
    expect(needsNextHearingUpdate({ ...open, cnrNo: '' }, late)).toBe(false)
    expect(needsNextHearingUpdate({ ...open, cnrNo: 'SHORT' }, late)).toBe(false)
    expect(needsNextHearingUpdate({ ...open, nextHearing: null }, late)).toBe(false)
  })
})
