import { describe, it, expect } from 'vitest'
import { byAssetClass, byLiabilityClass, netWorth, type Holding } from '@/lib/portfolio'
import type { AccountType } from '@/types/accounts'

const RATE = 83

function h(accountType: AccountType, opts: { us?: number; inr?: number } = {}): Holding {
  return {
    nickname: accountType,
    institution: 'Bank',
    accountType,
    country: opts.inr != null ? 'IN' : 'US',
    balanceUsd: opts.us ?? 0,
    balanceInr: opts.inr ?? 0,
    isPfic: false,
    source: 'manual',
  }
}

const HOLDINGS: Holding[] = [
  h('checking', { us: 10_000 }),
  h('brokerage', { us: 50_000 }),
  h('nre', { inr: 830_000 }), // = $10,000 at rate 83
  h('mortgage', { us: 200_000 }),
  h('credit_card', { us: 3_000 }),
]

describe('byLiabilityClass', () => {
  it('summarises debt by category (not one lump number)', () => {
    const slices = byLiabilityClass(HOLDINGS, RATE)
    const byKey = Object.fromEntries(slices.map((s) => [s.key, s.usd]))
    expect(byKey.mortgage).toBe(200_000)
    expect(byKey.creditCard).toBe(3_000)
    expect(slices.length).toBe(2)
  })

  it('reports positive amounts owed and pct of total debt', () => {
    const slices = byLiabilityClass(HOLDINGS, RATE)
    expect(slices.every((s) => s.usd > 0)).toBe(true)
    expect(Math.round(slices.reduce((s, x) => s + x.pct, 0))).toBe(100)
  })

  it('returns nothing when there is no debt', () => {
    expect(byLiabilityClass([h('checking', { us: 1_000 })], RATE)).toEqual([])
  })
})

describe('asset + liability breakdowns reconcile to net worth', () => {
  it('sum(assets) − sum(liabilities) === net worth', () => {
    const nw = netWorth(HOLDINGS, RATE)
    const assetsSum = byAssetClass(HOLDINGS, RATE).reduce((s, x) => s + x.usd, 0)
    const debtSum = byLiabilityClass(HOLDINGS, RATE).reduce((s, x) => s + x.usd, 0)

    expect(assetsSum).toBeCloseTo(nw.assetsUsd, 6)
    expect(debtSum).toBeCloseTo(nw.liabilitiesUsd, 6)
    expect(assetsSum - debtSum).toBeCloseTo(nw.totalUsd, 6)
  })
})
