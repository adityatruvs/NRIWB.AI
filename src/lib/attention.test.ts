import { describe, it, expect } from 'vitest'
import { attentionItems, complianceSummary } from '@/lib/attention'
import { complianceItems, type ComplianceItem, type Holding } from '@/lib/portfolio'

const RATE = 80
const h = (over: Partial<Holding>): Holding => ({
  nickname: 'x',
  institution: 'y',
  accountType: 'nre',
  country: 'IN',
  balanceUsd: 0,
  balanceInr: 0,
  isPfic: false,
  source: 'manual',
  ...over,
})
// $20,000 in an NRE account (FBAR crossed) and a PFIC mutual fund.
const holdings = [
  h({ id: 'nre', balanceInr: 1_600_000 }),
  h({ id: 'mf', accountType: 'mutual_fund', balanceInr: 80_000, isPfic: true }),
]
const rules = complianceItems(holdings, RATE)

describe('one compliance answer across the screen', () => {
  it('crossing the FBAR threshold is action needed, not overdue (filing is due next April)', () => {
    expect(rules.find((r) => r.key === 'fbar')?.level).toBe('attention')
    expect(complianceSummary(rules)).toEqual({ level: 'attention', label: 'Action needed: FBAR, PFIC' })
  })

  it('an empty AI result never hides what the header names', () => {
    const keys = attentionItems(rules, []).map((i) => i.key)
    expect(keys).toEqual(['fbar', 'pfic'])
  })

  it("keeps the AI's wording for a flagged topic but the rule's level, and adds its other items", () => {
    const ai: ComplianceItem[] = [
      { key: 'pfic', level: 'overdue', title: 'PFIC funds', detail: 'AI text', meta: '' },
      { key: 'allocation', level: 'overdue', title: 'Drift', detail: 'd', meta: '' },
      { key: 'stale', level: 'ok', title: 'Fine', detail: 'd', meta: '' },
    ]
    const items = attentionItems(rules, ai)
    expect(items.map((i) => [i.key, i.level])).toEqual([
      ['fbar', 'attention'],
      ['pfic', 'attention'],
      ['allocation', 'attention'],
    ])
    expect(items[1].detail).toBe('AI text')
  })

  it('says all clear only when nothing is flagged', () => {
    const clear = complianceItems([h({ id: 'small', balanceInr: 80_000 })], RATE)
    expect(complianceSummary(clear)).toEqual({ level: 'ok', label: 'All clear' })
    expect(attentionItems(clear, null)).toEqual([])
  })
})

// Review findings: the AI can't put a rule topic back on the list on its own.
describe('AI items on rule topics', () => {
  const quiet = complianceItems([h({ id: 'small', balanceInr: 480_000 })], RATE) // $6,000: FBAR ok (60%)
  it('drops an AI FBAR item when the FBAR rule is ok, so the list matches "All clear"', () => {
    const ai: ComplianceItem[] = [{ key: 'fbar', level: 'attention', title: 'FBAR approaching', detail: 'd', meta: '' }]
    expect(complianceSummary(quiet).label).toBe('All clear')
    expect(attentionItems(quiet, ai)).toEqual([])
  })
  it('never lists a flagged topic twice (the AI\'s second item renamed "pfic-2")', () => {
    const ai: ComplianceItem[] = [
      { key: 'pfic', level: 'attention', title: 'PFIC 1', detail: 'a', meta: '' },
      { key: 'pfic-2', level: 'attention', title: 'PFIC 2', detail: 'b', meta: '' },
    ]
    expect(attentionItems(rules, ai).map((i) => i.key)).toEqual(['fbar', 'pfic'])
  })
})
