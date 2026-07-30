import { describe, expect, it } from 'vitest'
import {
  activeBuckets,
  recommendedAllocation,
  currentAllocation,
  redistribute,
  allocationFor,
  roundTo100,
  blendedReturn,
  expectedReturn,
  typeExpectedReturn,
  portfolioExpectedReturn,
  projectValue,
  riskFeedback,
  BUCKET_ORDER,
  EXPECTED_RETURN,
  type Allocation,
  type AllocBucket,
  type RiskLevel,
} from '@/lib/allocation'
import type { Holding } from '@/lib/portfolio'

const HARDCODED_FX_RATE = 95

function makeHolding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: 'h1',
    nickname: 'Test Account',
    institution: 'Test Bank',
    accountType: 'checking',
    country: 'US',
    balanceUsd: 1000,
    balanceInr: 0,
    isPfic: false,
    source: 'manual',
    ...overrides,
  }
}

describe('activeBuckets', () => {
  it('includes realEstate when includeRealEstate is true', () => {
    expect(activeBuckets(true)).toEqual(BUCKET_ORDER)
  })

  it('drops realEstate when includeRealEstate is false', () => {
    expect(activeBuckets(false)).not.toContain('realEstate')
    expect(activeBuckets(false)).toHaveLength(BUCKET_ORDER.length - 1)
  })
})

describe('recommendedAllocation', () => {
  const risks: RiskLevel[] = ['very_conservative', 'conservative', 'moderate', 'aggressive', 'very_aggressive']

  it('sums to exactly 100 across a wide range of ages and risk levels, with or without real estate', () => {
    for (let age = 18; age <= 100; age += 2) {
      for (const risk of risks) {
        for (const includeRealEstate of [true, false]) {
          const alloc = recommendedAllocation(age, risk, includeRealEstate)
          const buckets = activeBuckets(includeRealEstate)
          const total = buckets.reduce((s, b) => s + alloc[b], 0)
          expect(total).toBe(100)
        }
      }
    }
  })

  it('never allocates to real estate when it is excluded', () => {
    expect(recommendedAllocation(45, 'moderate', false).realEstate).toBe(0)
  })

  it('allocates 0% to real estate for young ages even when included (no down payment yet)', () => {
    expect(recommendedAllocation(22, 'moderate', true).realEstate).toBe(0)
  })

  it('clamps age below 18 up to the 18-year-old glide-path point', () => {
    expect(recommendedAllocation(5, 'moderate', false)).toEqual(recommendedAllocation(18, 'moderate', false))
  })

  it('clamps age above 100 down to the 100-year-old glide-path point', () => {
    expect(recommendedAllocation(150, 'moderate', false)).toEqual(recommendedAllocation(100, 'moderate', false))
  })

  it('a more aggressive risk level allocates at least as much to stocks, all else equal', () => {
    const conservative = recommendedAllocation(40, 'conservative', false)
    const aggressive = recommendedAllocation(40, 'aggressive', false)
    expect(aggressive.stocks).toBeGreaterThanOrEqual(conservative.stocks)
  })
})

describe('currentAllocation', () => {
  it('returns zeroed slices and totalUsd 0 for an empty portfolio', () => {
    const result = currentAllocation([], HARDCODED_FX_RATE, false)
    expect(result.totalUsd).toBe(0)
    expect(result.slices.every((s) => s.usd === 0 && s.pct === 0)).toBe(true)
  })

  it('excludes liabilities from the investable base', () => {
    const holdings: Holding[] = [
      makeHolding({ id: 'a', accountType: 'brokerage', balanceUsd: 10_000 }),
      makeHolding({ id: 'b', accountType: 'credit_card', balanceUsd: 5_000 }),
    ]
    const result = currentAllocation(holdings, HARDCODED_FX_RATE, false)
    expect(result.totalUsd).toBe(10_000)
  })

  it('excludes vehicles from the investable base entirely', () => {
    const holdings: Holding[] = [makeHolding({ accountType: 'vehicle', balanceUsd: 30_000 })]
    const result = currentAllocation(holdings, HARDCODED_FX_RATE, false)
    expect(result.totalUsd).toBe(0)
  })

  it('drops real estate holdings from the base when includeRealEstate is false', () => {
    const holdings: Holding[] = [
      makeHolding({ id: 'home', accountType: 'real_estate', balanceUsd: 500_000 }),
      makeHolding({ id: 'cash', accountType: 'checking', balanceUsd: 5_000 }),
    ]
    const excluded = currentAllocation(holdings, HARDCODED_FX_RATE, false)
    const included = currentAllocation(holdings, HARDCODED_FX_RATE, true)
    expect(excluded.totalUsd).toBe(5_000)
    expect(included.totalUsd).toBe(505_000)
  })

  it('maps a mutual fund and brokerage into the stocks bucket', () => {
    const holdings: Holding[] = [
      makeHolding({ id: 'a', accountType: 'brokerage', balanceUsd: 1_000 }),
      makeHolding({ id: 'b', accountType: 'mutual_fund', balanceUsd: 2_000 }),
    ]
    const result = currentAllocation(holdings, HARDCODED_FX_RATE, false)
    const stocks = result.slices.find((s) => s.key === 'stocks')!
    expect(stocks.usd).toBe(3_000)
  })

  it('percentages sum to 100 for a non-empty portfolio', () => {
    const holdings: Holding[] = [
      makeHolding({ id: 'a', accountType: 'checking', balanceUsd: 1_000 }),
      makeHolding({ id: 'b', accountType: 'gold', balanceUsd: 500 }),
      makeHolding({ id: 'c', accountType: 'fd', balanceUsd: 250 }),
    ]
    const result = currentAllocation(holdings, HARDCODED_FX_RATE, false)
    const totalPct = result.slices.reduce((s, sl) => s + sl.pct, 0)
    expect(totalPct).toBeCloseTo(100, 6)
  })
})

describe('redistribute', () => {
  const buckets: AllocBucket[] = ['stocks', 'bonds', 'realEstate', 'gold', 'cash']
  const base: Allocation = { stocks: 60, bonds: 20, realEstate: 10, gold: 5, cash: 5 }

  it('the dragged bucket takes the new value and the rest still sum to 100', () => {
    const next = redistribute(base, [], 'stocks', 70, buckets)
    expect(next.stocks).toBe(70)
    const total = buckets.reduce((s, b) => s + next[b], 0)
    expect(total).toBeCloseTo(100, 6)
  })

  it('pinned buckets keep their exact value while unpinned buckets absorb the change', () => {
    const next = redistribute(base, ['bonds'], 'stocks', 70, buckets)
    expect(next.bonds).toBe(20) // pinned, untouched
    expect(next.stocks).toBe(70)
    const total = buckets.reduce((s, b) => s + next[b], 0)
    expect(total).toBeCloseTo(100, 6)
  })

  it('caps the dragged value so pinned buckets are never pushed below zero', () => {
    const next = redistribute(base, ['bonds', 'realEstate', 'gold', 'cash'], 'stocks', 500, buckets)
    // Everything else is pinned at 20+10+5+5=40, so stocks can take at most 60.
    expect(next.stocks).toBe(60)
  })

  it('never produces a negative value for any bucket', () => {
    const next = redistribute(base, [], 'cash', 95, buckets)
    for (const b of buckets) expect(next[b]).toBeGreaterThanOrEqual(0)
  })
})

describe('allocationFor', () => {
  it('zeroes out buckets that are not in the active list', () => {
    const rec: Allocation = { stocks: 50, bonds: 20, realEstate: 10, gold: 10, cash: 10 }
    const result = allocationFor(rec, ['stocks', 'cash'])
    expect(result).toEqual({ stocks: 50, bonds: 0, realEstate: 0, gold: 0, cash: 10 })
  })
})

describe('roundTo100', () => {
  const buckets: AllocBucket[] = ['stocks', 'bonds', 'realEstate', 'gold', 'cash']

  it('rounds fractional percentages to whole numbers that still sum to 100', () => {
    const values: Allocation = { stocks: 33.34, bonds: 33.33, realEstate: 0, gold: 16.67, cash: 16.66 }
    const rounded = roundTo100(values, buckets)
    const total = buckets.reduce((s, b) => s + rounded[b], 0)
    expect(total).toBe(100)
  })

  it('gives the extra +1 bumps to the buckets with the largest fractional remainder', () => {
    // .9 and .8 should be bumped up before .1 and .2 when only 2 bumps are available.
    const values: Allocation = { stocks: 10.9, bonds: 10.8, realEstate: 10.2, gold: 10.1, cash: 58 }
    const rounded = roundTo100(values, buckets)
    expect(rounded.stocks).toBe(11)
    expect(rounded.bonds).toBe(11)
    expect(rounded.realEstate).toBe(10)
    expect(rounded.gold).toBe(10)
    const total = buckets.reduce((s, b) => s + rounded[b], 0)
    expect(total).toBe(100)
  })

  it('leaves an already-integer allocation unchanged', () => {
    const values: Allocation = { stocks: 40, bonds: 30, realEstate: 10, gold: 10, cash: 10 }
    expect(roundTo100(values, buckets)).toEqual(values)
  })

  // BUG-DOCUMENTING: roundTo100 assumes its input already sums to ~100 (it only
  // ever bumps each bucket by at most +1). Every call site in the app passes
  // values that already sum to ~100, so this never triggers in practice — but
  // the function has no guard, so out-of-domain input silently produces a total
  // that is NOT 100 instead of throwing or clamping. Documented here so this
  // isn't mistaken for "roundTo100 always returns a sum of 100."
  it('BUG-DOCUMENTING: does not sum to 100 when the input is far from summing to 100', () => {
    const allZero: Allocation = { stocks: 0, bonds: 0, realEstate: 0, gold: 0, cash: 0 }
    const rounded = roundTo100(allZero, buckets)
    const total = buckets.reduce((s, b) => s + rounded[b], 0)
    expect(total).toBe(buckets.length) // 5, not 100 — each bucket bumped by +1 exactly once
    expect(total).not.toBe(100)
  })
})

describe('blendedReturn', () => {
  it('matches the weighted sum of EXPECTED_RETURN for a mixed allocation', () => {
    const alloc: Allocation = { stocks: 50, bonds: 20, realEstate: 10, gold: 10, cash: 10 }
    const expected =
      0.5 * EXPECTED_RETURN.stocks +
      0.2 * EXPECTED_RETURN.bonds +
      0.1 * EXPECTED_RETURN.realEstate +
      0.1 * EXPECTED_RETURN.gold +
      0.1 * EXPECTED_RETURN.cash
    expect(blendedReturn(alloc)).toBeCloseTo(expected, 10)
  })

  it('returns exactly the bucket rate for a 100% single-bucket allocation', () => {
    const alloc: Allocation = { stocks: 100, bonds: 0, realEstate: 0, gold: 0, cash: 0 }
    expect(blendedReturn(alloc)).toBeCloseTo(EXPECTED_RETURN.stocks, 10)
  })

  it('returns 0 for an all-zero allocation', () => {
    const alloc: Allocation = { stocks: 0, bonds: 0, realEstate: 0, gold: 0, cash: 0 }
    expect(blendedReturn(alloc)).toBe(0)
  })
})

describe('expectedReturn', () => {
  it('prefers an explicit per-account override over everything else', () => {
    const h = makeHolding({ accountType: 'checking', details: { expectedReturn: 11, interestRate: 4 } })
    expect(expectedReturn(h)).toBeCloseTo(0.11, 10)
  })

  it('falls back to the contractual interest rate when there is no override', () => {
    const h = makeHolding({ accountType: 'fd', details: { interestRate: 7.1 } })
    expect(expectedReturn(h)).toBeCloseTo(0.071, 10)
  })

  it('falls back to the type default when neither override nor interest rate is set', () => {
    const h = makeHolding({ accountType: 'brokerage' })
    expect(expectedReturn(h)).toBe(typeExpectedReturn('brokerage'))
  })

  it('ignores a zero or negative override and falls through to the next precedence level', () => {
    const h = makeHolding({ accountType: 'fd', details: { expectedReturn: 0, interestRate: 6 } })
    expect(expectedReturn(h)).toBeCloseTo(0.06, 10)
    const h2 = makeHolding({ accountType: 'fd', details: { expectedReturn: -5, interestRate: 6 } })
    expect(expectedReturn(h2)).toBeCloseTo(0.06, 10)
  })

  it('ignores a zero or negative interest rate and falls through to the type default', () => {
    const h = makeHolding({ accountType: 'fd', details: { interestRate: 0 } })
    expect(expectedReturn(h)).toBe(typeExpectedReturn('fd'))
  })
})

describe('typeExpectedReturn', () => {
  it('maps an account type to its bucket default rate', () => {
    expect(typeExpectedReturn('checking')).toBe(EXPECTED_RETURN.cash)
    expect(typeExpectedReturn('mutual_fund')).toBe(EXPECTED_RETURN.stocks)
    expect(typeExpectedReturn('gold')).toBe(EXPECTED_RETURN.gold)
    expect(typeExpectedReturn('real_estate')).toBe(EXPECTED_RETURN.realEstate)
  })
})

describe('portfolioExpectedReturn', () => {
  it('returns null when there are no assets', () => {
    expect(portfolioExpectedReturn([], HARDCODED_FX_RATE)).toBeNull()
  })

  it('returns null when the only holdings are liabilities', () => {
    const holdings: Holding[] = [makeHolding({ accountType: 'credit_card', balanceUsd: 1_000 })]
    expect(portfolioExpectedReturn(holdings, HARDCODED_FX_RATE)).toBeNull()
  })

  it('is balance-weighted across multiple assets with different rates', () => {
    const holdings: Holding[] = [
      makeHolding({ id: 'a', accountType: 'fd', balanceUsd: 100, details: { interestRate: 8 } }),
      makeHolding({ id: 'b', accountType: 'checking', balanceUsd: 300, details: { interestRate: undefined } }),
    ]
    const result = portfolioExpectedReturn(holdings, HARDCODED_FX_RATE)
    const expected = (100 * 0.08 + 300 * typeExpectedReturn('checking')) / 400
    expect(result).toBeCloseTo(expected, 10)
  })

  it('excludes liabilities from both the numerator and the weighting denominator', () => {
    const holdings: Holding[] = [
      makeHolding({ id: 'a', accountType: 'fd', balanceUsd: 100, details: { interestRate: 8 } }),
      makeHolding({ id: 'debt', accountType: 'credit_card', balanceUsd: 5_000 }),
    ]
    expect(portfolioExpectedReturn(holdings, HARDCODED_FX_RATE)).toBeCloseTo(0.08, 10)
  })
})

describe('projectValue', () => {
  it('returns exactly baseUsd for years=0 (no growth yet)', () => {
    const alloc: Allocation = { stocks: 100, bonds: 0, realEstate: 0, gold: 0, cash: 0 }
    expect(projectValue(alloc, 10_000, 0)).toBeCloseTo(10_000, 6)
  })

  it('compounds a single bucket at its EXPECTED_RETURN rate', () => {
    const alloc: Allocation = { stocks: 100, bonds: 0, realEstate: 0, gold: 0, cash: 0 }
    const expected = 10_000 * Math.pow(1 + EXPECTED_RETURN.stocks, 5)
    expect(projectValue(alloc, 10_000, 5)).toBeCloseTo(expected, 6)
  })

  it('sums independently-compounded buckets for a mixed allocation', () => {
    const alloc: Allocation = { stocks: 50, bonds: 50, realEstate: 0, gold: 0, cash: 0 }
    const expected =
      10_000 * 0.5 * Math.pow(1 + EXPECTED_RETURN.stocks, 3) +
      10_000 * 0.5 * Math.pow(1 + EXPECTED_RETURN.bonds, 3)
    expect(projectValue(alloc, 10_000, 3)).toBeCloseTo(expected, 6)
  })

  it('returns 0 for a base of 0', () => {
    const alloc: Allocation = { stocks: 100, bonds: 0, realEstate: 0, gold: 0, cash: 0 }
    expect(projectValue(alloc, 0, 10)).toBe(0)
  })
})

describe('riskFeedback', () => {
  it('is "ok" for a moderate risk choice at a moderate age', () => {
    expect(riskFeedback(40, 'moderate').tone).toBe('ok')
  })

  it('flags "caution" when risk is far more aggressive than expected for the age', () => {
    // Under 35, expected index is 3 (aggressive); very_aggressive is index 4 — only
    // +1, so still "ok". Push an older age where the gap crosses +2.
    expect(riskFeedback(55, 'very_aggressive').tone).toBe('caution')
  })

  it('flags "caution" when risk is far more conservative than expected for the age', () => {
    expect(riskFeedback(25, 'very_conservative').tone).toBe('caution')
  })

  it('treats ages just under and at the 35 boundary consistently with the documented brackets', () => {
    // age < 35 => expected index 3 (aggressive); age >= 35 => expected index 2 (moderate)
    expect(riskFeedback(34, 'aggressive').tone).toBe('ok')
    expect(riskFeedback(35, 'aggressive').tone).toBe('ok') // index 3 vs expected 2: gap of 1, still ok
  })

  it('flips tone across the 62 boundary where "expected" risk drops a step', () => {
    // age < 62 => expected index 2 (moderate); age >= 62 => expected index 1 (conservative).
    // very_conservative (index 0) is 2 steps below "expected" just under 62 (=> caution),
    // but only 1 step below "expected" at 62 (=> ok).
    expect(riskFeedback(61, 'very_conservative').tone).toBe('caution')
    expect(riskFeedback(62, 'very_conservative').tone).toBe('ok')
  })
})
