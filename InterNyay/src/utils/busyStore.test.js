import { describe, it, expect, beforeEach, vi } from 'vitest'
import { actionKey, beginAction, endAction, isActionBusy, isActionBusyPath, startServerSync } from './busyStore'

describe('actionKey', () => {
  it('matches the name the server makes (method, address, sorted query without empty values)', () => {
    expect(actionKey('post', '/cases/12/cause-list/refresh', { date: '2026-11-05' }))
      .toBe('POST /cases/12/cause-list/refresh?date=2026-11-05')
    expect(actionKey('DELETE', '/x/', { b: 2, empty: '', gone: undefined, a: 1 })).toBe('DELETE /x?a=1&b=2')
    expect(actionKey('PUT', '/x?name=a%20b')).toBe('PUT /x?name=a b')
  })
})

describe('busy tracking', () => {
  beforeEach(() => document.body.classList.remove('is-saving'))

  it('stays busy until every identical call finished', () => {
    const k = actionKey('POST', '/cases/1/refresh-hearing')
    beginAction(k); beginAction(k)
    endAction(k)
    expect(isActionBusy(k)).toBe(true)
    endAction(k)
    expect(isActionBusy(k)).toBe(false)
  })

  it('finds running calls by address, any method, query ignored', () => {
    const k = actionKey('PUT', '/hearings/5', { x: 1 })
    beginAction(k)
    expect(isActionBusyPath('/hearings/5')).toBe(true)
    expect(isActionBusyPath('/hearings/50')).toBe(false)
    expect(isActionBusyPath('/hearings')).toBe(true)
    expect(isActionBusyPath('')).toBe(false)
    endAction(k)
    expect(isActionBusyPath('/hearings/5')).toBe(false)
  })

  it('locks Save buttons for short saves only, not for slow jobs', () => {
    const slow = actionKey('POST', '/cases/1/cause-list/refresh', { date: '2026-11-05' })
    beginAction(slow)
    expect(document.body.classList.contains('is-saving')).toBe(false)
    const save = actionKey('PUT', '/cases/1')
    beginAction(save)
    expect(document.body.classList.contains('is-saving')).toBe(true)
    endAction(save); endAction(slow)
    expect(document.body.classList.contains('is-saving')).toBe(false)
  })

  it('takes calls the server still runs after a page refresh, and drops them once the server says they are done', async () => {
    vi.useFakeTimers()
    localStorage.setItem('internyay_token', 't')
    const answers = [['POST /cases/9/refresh-hearing'], []]
    startServerSync(async () => answers.shift())
    await vi.advanceTimersByTimeAsync(0)
    expect(isActionBusy('POST /cases/9/refresh-hearing')).toBe(true)
    await vi.advanceTimersByTimeAsync(3000)
    expect(isActionBusy('POST /cases/9/refresh-hearing')).toBe(false)
    vi.useRealTimers()
  })
})
