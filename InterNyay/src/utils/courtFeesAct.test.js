import { describe, it, expect } from 'vitest'
import { COURT_TYPES, DEFAULT_CONFIG, buildFeeRules } from './courtFeesAct'

describe('court fee rules', () => {
  const rules = buildFeeRules(DEFAULT_CONFIG)

  it('has exactly one fee rule for every case type', () => {
    COURT_TYPES.forEach(t => {
      expect(DEFAULT_CONFIG.caseTypes.filter(r => r.caseType === t.value)).toHaveLength(1)
      expect(rules.ruleOf(t.value)).not.toBeNull()
    })
  })

  it('charges the ad valorem fee for a civil suit and an appeal', () => {
    const civil = rules.ruleOf('civil')
    expect(rules.matterNeedsValue(civil)).toBe(true)
    expect(rules.calcFee(civil, 100000, 'delhi')).toBe(3320)
    expect(rules.calcFee(rules.ruleOf('appeal'), 100000, 'haryana')).toBe(5300)
    expect(rules.calcFee(civil, 5000000, 'central')).toBe(3000)
  })

  it('charges fixed fees without a claim value', () => {
    expect(rules.matterNeedsValue(rules.ruleOf('writ'))).toBe(false)
    expect(rules.calcFee(rules.ruleOf('writ'), 0, 'delhi')).toBe(2)
    expect(rules.calcFee(rules.ruleOf('criminal'), 0, 'delhi')).toBe(0.5)
    expect(rules.calcFee(rules.ruleOf('family'), 0, 'delhi')).toBe(10)
    expect(rules.calcFee(rules.ruleOf('labour'), 0, 'delhi')).toBe(0)
  })

  it('charges the consumer scale on the value paid', () => {
    const consumer = rules.ruleOf('consumer')
    expect(rules.calcFee(consumer, 500000, 'delhi')).toBe(0)
    expect(rules.calcFee(consumer, 1000000, 'delhi')).toBe(200)
    expect(rules.consumerForum(6000000)).toBe('State Consumer Commission')
  })

  it('uses the State only for ad valorem rules', () => {
    expect(rules.usesJurisdiction(rules.ruleOf('civil'))).toBe(true)
    expect(rules.usesJurisdiction(rules.ruleOf('writ'))).toBe(false)
  })

  it('builds the quick reference rows from the case type rules', () => {
    const rows = rules.quickRefFor('delhi')
    expect(rows).toHaveLength(DEFAULT_CONFIG.quickRef.length)
    expect(rows.find(([l]) => l.startsWith('Writ'))[1]).toBe('₹2')
    expect(rows.find(([l]) => l.startsWith('Consumer'))[1]).toBe('Nil')
  })

  it('falls back to the defaults for rules saved with filings', () => {
    const old = { filings: [{ caseType: 'civil', key: 'suit' }], scales: DEFAULT_CONFIG.scales }
    expect(buildFeeRules(old).ruleOf('civil').label).toBe(DEFAULT_CONFIG.caseTypes[0].label)
  })
})
