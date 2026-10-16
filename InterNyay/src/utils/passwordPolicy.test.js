import { describe, it, expect } from 'vitest'
import { passwordProblem } from './passwordPolicy'

describe('passwordProblem', () => {
  it('accepts a strong enough password', () => {
    expect(passwordProblem('Blue42Sky', 'a@b.com')).toBe('')
    expect(passwordProblem('correct horse 9 battery')).toBe('')
  })

  it('refuses empty, short and too long passwords', () => {
    expect(passwordProblem('')).toMatch(/required/)
    expect(passwordProblem('Ab1xyz7')).toMatch(/at least 8/)
    expect(passwordProblem('a1'.repeat(33))).toMatch(/at most 64/)
  })

  it('needs a letter and a number', () => {
    expect(passwordProblem('abcdefghij')).toMatch(/letter and one number/)
    expect(passwordProblem('1234567890')).toMatch(/letter and one number/)
  })

  it('refuses common passwords in any case', () => {
    expect(passwordProblem('Password123')).toMatch(/too common/)
  })

  it('refuses passwords built from the email, but ignores very short email names', () => {
    expect(passwordProblem('advocate.sharma99', 'advocate.sharma@example.com')).toMatch(/email/)
    expect(passwordProblem('Ravi-2024-ok', 'ravi@example.com')).toBe('')
  })
})
