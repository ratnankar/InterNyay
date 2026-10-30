import { describe, it, expect } from 'vitest'
import { caseWarnings } from './caseWarnings'

const now = new Date(2026, 9, 30)
const keys = c => caseWarnings(c, now).map(n => n.key)

describe('caseWarnings', () => {
  it('flags an open case whose hearing date passed', () => {
    expect(keys({ status: 'Pending', nextHearing: '2026-10-23' })).toEqual(['hearing-overdue'])
  })
  it('does not flag today, the future or a closed case', () => {
    expect(keys({ status: 'Pending', nextHearing: '2026-10-30' })).toEqual([])
    expect(keys({ status: 'Pending', nextHearing: '2026-12-05' })).toEqual([])
    expect(keys({ status: 'Decided', nextHearing: '2026-10-23' })).toEqual([])
  })
  it('flags a filing year that cannot belong to the case number', () => {
    expect(keys({ status: 'Pending', caseNo: 'SC 466/2023', filingDate: '2026-08-21' })).toEqual(['filing-year'])
    expect(keys({ status: 'Pending', caseNo: 'SC 186/2024', filingDate: '2018-10-16' })).toEqual(['filing-year'])
  })
  it('accepts the same year and the year before', () => {
    expect(keys({ status: 'Pending', caseNo: 'SC 1/2024', filingDate: '2024-03-01' })).toEqual([])
    expect(keys({ status: 'Pending', caseNo: 'SC 1/2024', filingDate: '2023-12-28' })).toEqual([])
  })
  it('flags a CNR of another year than the case number', () => {
    expect(keys({ status: 'Pending', caseNo: 'CR Cases 761/2019', cnrNo: 'DLST020040322019' })).toEqual([])
    expect(keys({ status: 'Pending', caseNo: 'CR Cases 761/2020', cnrNo: 'DLST020040322019' })).toEqual(['cnr-year'])
  })
  it('says nothing when data is missing', () => {
    expect(caseWarnings(null)).toEqual([])
    expect(keys({ status: 'Pending' })).toEqual([])
  })
})
