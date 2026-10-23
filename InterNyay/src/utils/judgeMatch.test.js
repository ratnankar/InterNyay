import { describe, expect, it } from 'vitest'
import { nameSearchMatches, sameJudge } from './judgeMatch'

describe('sameJudge', () => {
  it('ignores titles, case, dots and word order', () => {
    expect(sameJudge('MS. KANIKA HANDA', 'Kanika Handa')).toBe(true)
    expect(sameJudge('Smt. Sarita Devi', 'Devi Sarita')).toBe(true)
  })

  it('does not match a surname alone or a name inside a longer one', () => {
    expect(sameJudge('Kumar', 'Rajesh Kumar')).toBe(false)
    expect(sameJudge('Rajesh Kumar', 'Rajesh Kumar Sharma')).toBe(false)
    expect(sameJudge('Rakesh Kumar', 'Abhishek Kumar')).toBe(false)
  })

  it('treats a left-out middle name as a different judge', () => {
    expect(sameJudge('Anil Sharma', 'Anil Kumar Sharma')).toBe(false)
  })

  it('needs the same Roman numeral on both sides', () => {
    expect(sameJudge('Rajesh Kumar (II)', 'Rajesh Kumar-II')).toBe(true)
    expect(sameJudge('Rajesh Kumar (II)', 'Rajesh Kumar (III)')).toBe(false)
    expect(sameJudge('Rajesh Kumar (II)', 'Rajesh Kumar')).toBe(false)
  })

  it('does not match on a shared surname alone', () => {
    expect(sameJudge('Akshay Kumar', 'Abhishek Kumar')).toBe(false)
    expect(sameJudge('A. Kumar', 'Abhishek Kumar')).toBe(false)
    expect(sameJudge('Kanika Handa', 'Neha Handa')).toBe(false)
    expect(sameJudge('Rajesh Kumar', 'Rajesh Singh')).toBe(false)
  })

  it('never matches on initials alone', () => {
    expect(sameJudge('A. S.', 'Anil Singh')).toBe(false)
  })
})

describe('nameSearchMatches', () => {
  it('finds a judge whatever the title or word order', () => {
    expect(nameSearchMatches('Ms. Kanika Handa', 'Kanika Handa')).toBe(true)
    expect(nameSearchMatches('handa kan', 'Kanika Handa')).toBe(true)
    expect(nameSearchMatches('abhi', 'Sh. Abhishek Kumar')).toBe(true)
  })

  it('needs every typed word to start a different word of the name', () => {
    expect(nameSearchMatches('kumar kumar', 'Abhishek Kumar')).toBe(false)
    expect(nameSearchMatches('rakesh', 'Abhishek Kumar')).toBe(false)
  })
})
