import { describe, it, expect } from 'vitest'
import { greetingName } from './nameUtils'

describe('greetingName', () => {
  it('uses the first name', () => {
    expect(greetingName('Rahul Kumar')).toBe('Rahul')
    expect(greetingName('Rahul')).toBe('Rahul')
    expect(greetingName('Rahul Kumar Sharma')).toBe('Rahul')
  })

  it('keeps the title in front of the name', () => {
    expect(greetingName('Adv. Rahul Kumar')).toBe('Adv. Rahul')
    expect(greetingName('Dr. Meera Nair')).toBe('Dr. Meera')
    expect(greetingName('Shri Ram Kumar')).toBe('Shri Ram')
    expect(greetingName('Prof. S. Raman')).toBe('Prof. Raman')
  })

  it('accepts titles with or without a full stop, in any case', () => {
    expect(greetingName('Dr Rahul Kumar')).toBe('Dr Rahul')
    expect(greetingName('dr. rahul kumar')).toBe('dr. rahul')
    expect(greetingName('MRS. Sharma')).toBe('MRS. Sharma')
    expect(greetingName("Hon'ble A. K. Verma")).toBe("Hon'ble Verma")
  })

  it('skips leading initials', () => {
    expect(greetingName('A. K. Shakya')).toBe('Shakya')
    expect(greetingName('A K Shakya')).toBe('Shakya')
    expect(greetingName('A.K. Shakya')).toBe('Shakya')
    expect(greetingName('A.K Shakya')).toBe('Shakya')
    expect(greetingName('Dr. A. K. Shakya')).toBe('Dr. Shakya')
    expect(greetingName('Justice D. Y. Chandrachud')).toBe('Justice Chandrachud')
  })

  it('keeps a first name before an initial', () => {
    expect(greetingName('Rahul K. Shakya')).toBe('Rahul')
    expect(greetingName('Rahul K Shakya')).toBe('Rahul')
  })

  it('does not treat a short real word as initials', () => {
    expect(greetingName('Om Prakash')).toBe('Om')
    expect(greetingName('Jay Shah')).toBe('Jay')
  })

  it('is empty for only titles or initials', () => {
    expect(greetingName('Adv.')).toBe('')
    expect(greetingName('Dr.')).toBe('')
    expect(greetingName('A. K.')).toBe('')
    expect(greetingName('A K')).toBe('')
  })

  it('tolerates missing or blank names', () => {
    expect(greetingName('')).toBe('')
    expect(greetingName('   ')).toBe('')
    expect(greetingName(null)).toBe('')
    expect(greetingName(undefined)).toBe('')
  })

  it('collapses extra spaces, tabs and non-breaking spaces', () => {
    expect(greetingName('  Rahul   Kumar  ')).toBe('Rahul')
    expect(greetingName('Rahul\tKumar')).toBe('Rahul')
    expect(greetingName('Rahul\u00A0Kumar')).toBe('Rahul')
    expect(greetingName('Rahul\u200B Kumar')).toBe('Rahul')
  })

  it('drops punctuation, brackets and emoji around the name', () => {
    expect(greetingName('(Rahul) Kumar')).toBe('Rahul')
    expect(greetingName('Rahul, Kumar')).toBe('Rahul')
    expect(greetingName('"Rahul" Kumar')).toBe('Rahul')
    expect(greetingName('Rahul 😀')).toBe('Rahul')
  })

  it('works for names in other scripts', () => {
    expect(greetingName('राहुल कुमार')).toBe('राहुल')
    expect(greetingName('Mohammad अब्दुल')).toBe('Mohammad')
  })

  it('stops at a relationship marker', () => {
    expect(greetingName('Rahul S/o Mohan')).toBe('Rahul')
    expect(greetingName('S/o Mohan Kumar')).toBe('')
    expect(greetingName('Smt. Sunita W/o Rajesh')).toBe('Smt. Sunita')
  })

  it('handles hyphenated and apostrophe names', () => {
    expect(greetingName('Anna-Marie Thomas')).toBe('Anna-Marie')
    expect(greetingName("D'Souza Rohan")).toBe("D'Souza")
  })
})
