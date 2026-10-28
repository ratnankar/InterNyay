import { describe, expect, it } from 'vitest'
import { hearingDateProblem } from './dateUtils'

describe('hearingDateProblem', () => {
  it('accepts an ordinary day', () => {
    expect(hearingDateProblem('2026-10-19', new Set())).toBe('')
  })

  it('refuses crossed-out dates', () => {
    expect(hearingDateProblem('2026-10-19', new Set(['2026-10-19']))).toMatch(/no-hearing/)
  })

  it('refuses a full day using the check it is given', () => {
    const full = ds => (ds === '2026-10-19' ? 'This date already has 2 hearings, the daily limit' : '')
    expect(hearingDateProblem('2026-10-19', new Set(), full)).toMatch(/daily limit/)
    expect(hearingDateProblem('2026-10-20', new Set(), full)).toBe('')
  })

  it('says nothing for an empty date', () => {
    expect(hearingDateProblem('', new Set(), () => 'full')).toBe('')
  })
})
