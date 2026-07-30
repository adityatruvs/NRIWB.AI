import { describe, expect, it } from 'vitest'
import {
  isLiability,
  isSecurableAsset,
  usdValue,
  loansSecuredBy,
  assetEquity,
  netWorth,
  byAssetClass,
  pficHoldings,
  fbarStatus,
  complianceItems,
  TYPE_LABELS,
  FBAR_THRESHOLD_USD,
  FATCA_THRESHOLD_USD,
  type Holding,
} from '@/lib/portfolio'

// Current application FX values used as test inputs.
const HARDCODED_FX_RATE = 95
const SEED_FX_RATE = 83.5

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

describe('isLiability', () => {
  it('is true for known liability account types', () => {
    expect(isLiability(makeHolding({ accountType: 'mortgage' }))).toBe(true)
    expect(isLiability(makeHolding({ accountType: 'credit_card' }))).toBe(true)
  })

  it('is true when kind is explicitly "liability", regardless of type', () => {
    expect(isLiability(makeHolding({ accountType: 'checking', kind: 'liability' }))).toBe(true)
  })

  it('is false for asset types with no explicit kind', () => {
    expect(isLiability(makeHolding({ accountType: 'brokerage' }))).toBe(false)
  })

  it('is false when kind is explicitly "asset" on an asset-type account', () => {
    expect(isLiability(makeHolding({ accountType: 'checking', kind: 'asset' }))).toBe(false)
  })
})

describe('isSecurableAsset', () => {
  it('is true for securable asset types that are not liabilities', () => {
    expect(isSecurableAsset(makeHolding({ accountType: 'real_estate' }))).toBe(true)
  })

  it('is false for a liability even if its type is in the securable set', () => {
    expect(isSecurableAsset(makeHolding({ accountType: 'other', kind: 'liability' }))).toBe(false)
  })

  it('is false for a non-securable asset type', () => {
    expect(isSecurableAsset(makeHolding({ accountType: 'checking' }))).toBe(false)
  })
})

describe('usdValue', () => {
  it('returns balanceUsd as-is for a US asset, ignoring rate', () => {
    const h = makeHolding({ country: 'US', balanceUsd: 5000, balanceInr: 999999 })
    expect(usdValue(h, HARDCODED_FX_RATE)).toBe(5000)
    expect(usdValue(h, SEED_FX_RATE)).toBe(5000)
  })

  it('converts balanceInr / rate for an India asset', () => {
    const h = makeHolding({ country: 'IN', accountType: 'nre', balanceInr: 4_500_000 })
    expect(usdValue(h, SEED_FX_RATE)).toBeCloseTo(4_500_000 / SEED_FX_RATE, 6)
  })

  it('negates the value for a liability', () => {
    const h = makeHolding({ country: 'US', accountType: 'mortgage', balanceUsd: 300_000 })
    expect(usdValue(h, HARDCODED_FX_RATE)).toBe(-300_000)
  })

  it('negates a converted India liability', () => {
    const h = makeHolding({ country: 'IN', accountType: 'other_debt', balanceInr: 830_000 })
    expect(usdValue(h, SEED_FX_RATE)).toBeCloseTo(-(830_000 / SEED_FX_RATE), 6)
  })

  it('returns 0 for a zero-balance holding', () => {
    expect(usdValue(makeHolding({ balanceUsd: 0 }), HARDCODED_FX_RATE)).toBe(0)
  })

  // Current behavior with an invalid FX rate.
  it('returns Infinity when converting an INR holding with a zero FX rate', () => {
    const h = makeHolding({ country: 'IN', balanceInr: 100_000 })
    expect(usdValue(h, 0)).toBe(Infinity)
  })

  it('returns a negative USD value when the FX rate is negative', () => {
    const h = makeHolding({ country: 'IN', balanceInr: 100_000 })
    expect(usdValue(h, -83.5)).toBeLessThan(0)
  })
})

describe('loansSecuredBy', () => {
  it('returns liabilities whose securedAgainstId matches the asset id', () => {
    const home = makeHolding({ id: 'home', accountType: 'real_estate', balanceUsd: 500_000 })
    const mortgage = makeHolding({
      id: 'm1',
      accountType: 'mortgage',
      balanceUsd: 300_000,
      securedAgainstId: 'home',
    })
    const unrelated = makeHolding({ id: 'cc1', accountType: 'credit_card', balanceUsd: 2_000 })
    const loans = loansSecuredBy(home.id, [home, mortgage, unrelated])
    expect(loans).toEqual([mortgage])
  })

  it('returns an empty array when assetId is undefined', () => {
    expect(loansSecuredBy(undefined, [makeHolding()])).toEqual([])
  })

  it('returns an empty array when nothing is secured against the asset', () => {
    const home = makeHolding({ id: 'home', accountType: 'real_estate' })
    expect(loansSecuredBy(home.id, [home])).toEqual([])
  })
})

describe('assetEquity', () => {
  it('subtracts secured loans from the asset value', () => {
    const home = makeHolding({ id: 'home', accountType: 'real_estate', balanceUsd: 500_000 })
    const mortgage = makeHolding({
      id: 'm1',
      accountType: 'mortgage',
      balanceUsd: 300_000,
      securedAgainstId: 'home',
    })
    expect(assetEquity(home, [home, mortgage], HARDCODED_FX_RATE)).toBe(200_000)
  })

  it('sums multiple loans secured against the same asset', () => {
    const home = makeHolding({ id: 'home', accountType: 'real_estate', balanceUsd: 500_000 })
    const m1 = makeHolding({ id: 'm1', accountType: 'mortgage', balanceUsd: 200_000, securedAgainstId: 'home' })
    const m2 = makeHolding({ id: 'm2', accountType: 'heloc', balanceUsd: 50_000, securedAgainstId: 'home' })
    expect(assetEquity(home, [home, m1, m2], HARDCODED_FX_RATE)).toBe(250_000)
  })

  it('equals the asset value when nothing is secured against it', () => {
    const home = makeHolding({ id: 'home', accountType: 'real_estate', balanceUsd: 500_000 })
    expect(assetEquity(home, [home], HARDCODED_FX_RATE)).toBe(500_000)
  })

  it('can go negative when secured debt exceeds the asset value (underwater)', () => {
    const home = makeHolding({ id: 'home', accountType: 'real_estate', balanceUsd: 100_000 })
    const mortgage = makeHolding({
      id: 'm1',
      accountType: 'mortgage',
      balanceUsd: 250_000,
      securedAgainstId: 'home',
    })
    expect(assetEquity(home, [home, mortgage], HARDCODED_FX_RATE)).toBe(-150_000)
  })
})

describe('netWorth', () => {
  it('returns all zeros for an empty portfolio', () => {
    const nw = netWorth([], HARDCODED_FX_RATE)
    expect(nw).toEqual({
      totalUsd: 0,
      usUsd: 0,
      inUsd: 0,
      usPct: 0,
      inPct: 100,
      assetsUsd: 0,
      liabilitiesUsd: 0,
    })
  })

  it('sums assets across US and India at the given rate', () => {
    const holdings: Holding[] = [
      makeHolding({ country: 'US', accountType: 'checking', balanceUsd: 12_500 }),
      makeHolding({ country: 'IN', accountType: 'nre', balanceInr: 4_500_000 }),
    ]
    const nw = netWorth(holdings, SEED_FX_RATE)
    expect(nw.usUsd).toBe(12_500)
    expect(nw.inUsd).toBeCloseTo(4_500_000 / SEED_FX_RATE, 6)
    expect(nw.totalUsd).toBeCloseTo(12_500 + 4_500_000 / SEED_FX_RATE, 6)
    expect(nw.assetsUsd).toBeCloseTo(nw.totalUsd, 6)
    expect(nw.liabilitiesUsd).toBe(0)
  })

  it('nets liabilities out of both the jurisdiction and grand totals', () => {
    const holdings: Holding[] = [
      makeHolding({ id: 'a', country: 'US', accountType: 'checking', balanceUsd: 10_000 }),
      makeHolding({ id: 'b', country: 'US', accountType: 'credit_card', balanceUsd: 4_000 }),
    ]
    const nw = netWorth(holdings, HARDCODED_FX_RATE)
    expect(nw.usUsd).toBe(6_000)
    expect(nw.totalUsd).toBe(6_000)
    expect(nw.assetsUsd).toBe(10_000)
    expect(nw.liabilitiesUsd).toBe(4_000)
  })

  it('clamps usPct/inPct to [0,100] instead of going negative when a jurisdiction is net-debt', () => {
    const holdings: Holding[] = [
      makeHolding({ id: 'us-debt', country: 'US', accountType: 'credit_card', balanceUsd: 20_000 }),
      makeHolding({ id: 'in-asset', country: 'IN', accountType: 'nro', balanceInr: 830_000 }),
    ]
    const nw = netWorth(holdings, SEED_FX_RATE)
    expect(nw.usPct).toBe(0)
    expect(nw.inPct).toBe(100)
    expect(nw.usUsd).toBe(-20_000)
  })

  it('rounds the US/India split to whole percentages that sum to 100', () => {
    const holdings: Holding[] = [
      makeHolding({ id: 'us', country: 'US', accountType: 'checking', balanceUsd: 1_000 }),
      makeHolding({ id: 'in', country: 'IN', accountType: 'nro', balanceInr: 2 * SEED_FX_RATE }),
    ]
    const nw = netWorth(holdings, SEED_FX_RATE)
    expect(nw.usPct + nw.inPct).toBe(100)
  })
})

describe('byAssetClass', () => {
  it('groups holdings into asset classes and excludes liabilities', () => {
    const holdings: Holding[] = [
      makeHolding({ id: 'a', accountType: 'checking', balanceUsd: 1_000 }),
      makeHolding({ id: 'b', accountType: 'brokerage', balanceUsd: 2_000 }),
      makeHolding({ id: 'c', accountType: 'mortgage', balanceUsd: 300_000 }),
    ]
    const slices = byAssetClass(holdings, HARDCODED_FX_RATE)
    const keys = slices.map((s) => s.key)
    expect(keys).toContain('cash')
    expect(keys).toContain('investments')
    expect(keys).not.toContain('mortgage')
    const total = slices.reduce((s, sl) => s + sl.usd, 0)
    expect(total).toBe(3_000)
  })

  it('percentages within a class sum to 100 across all slices', () => {
    const holdings: Holding[] = [
      makeHolding({ id: 'a', accountType: 'checking', balanceUsd: 3_000 }),
      makeHolding({ id: 'b', accountType: 'gold', balanceUsd: 1_000 }),
    ]
    const slices = byAssetClass(holdings, HARDCODED_FX_RATE)
    const totalPct = slices.reduce((s, sl) => s + sl.pct, 0)
    expect(totalPct).toBeCloseTo(100, 6)
  })

  it('returns an empty array when there are no assets (only liabilities, or none)', () => {
    expect(byAssetClass([], HARDCODED_FX_RATE)).toEqual([])
    const onlyDebt = [makeHolding({ accountType: 'credit_card', balanceUsd: 500 })]
    expect(byAssetClass(onlyDebt, HARDCODED_FX_RATE)).toEqual([])
  })

  it('sorts slices largest-first', () => {
    const holdings: Holding[] = [
      makeHolding({ id: 'a', accountType: 'gold', balanceUsd: 100 }),
      makeHolding({ id: 'b', accountType: 'checking', balanceUsd: 10_000 }),
    ]
    const slices = byAssetClass(holdings, HARDCODED_FX_RATE)
    expect(slices[0].key).toBe('cash')
  })
})

describe('pficHoldings', () => {
  it('returns only holdings flagged isPfic', () => {
    const holdings: Holding[] = [
      makeHolding({ id: 'a', isPfic: true }),
      makeHolding({ id: 'b', isPfic: false }),
    ]
    expect(pficHoldings(holdings).map((h) => h.id)).toEqual(['a'])
  })

  it('returns an empty array when nothing is a PFIC', () => {
    expect(pficHoldings([makeHolding({ isPfic: false })])).toEqual([])
  })
})

// Current placeholder: peak balance is estimated as currentUsd * 1.04.
describe('fbarStatus', () => {
  it('computes currentUsd only from non-liability India holdings', () => {
    const holdings: Holding[] = [
      makeHolding({ id: 'in-asset', country: 'IN', accountType: 'nro', balanceInr: 830_000 }),
      makeHolding({ id: 'in-debt', country: 'IN', accountType: 'other_debt', balanceInr: 100_000 }),
      makeHolding({ id: 'us-asset', country: 'US', accountType: 'checking', balanceUsd: 50_000 }),
    ]
    const status = fbarStatus(holdings, SEED_FX_RATE)
    expect(status.currentUsd).toBeCloseTo(830_000 / SEED_FX_RATE, 6)
  })

  it('calculates peakUsd as 1.04x currentUsd', () => {
    const holdings: Holding[] = [
      makeHolding({ country: 'IN', accountType: 'nro', balanceInr: 830_000 }),
    ]
    const status = fbarStatus(holdings, SEED_FX_RATE)
    expect(status.peakUsd).toBeCloseTo(status.currentUsd * 1.04, 6)
  })

  it('is not crossed and reports 0% when there are no India holdings', () => {
    const status = fbarStatus([], SEED_FX_RATE)
    expect(status.crossed).toBe(false)
    expect(status.pctOfThreshold).toBe(0)
  })

  it('flags crossed=true once peak reaches the $10,000 threshold', () => {
    // Minimum current balance needed to cross the estimated peak threshold.
    const holdings: Holding[] = [
      makeHolding({ country: 'IN', accountType: 'nro', balanceInr: 9_616 * SEED_FX_RATE }),
    ]
    const status = fbarStatus(holdings, SEED_FX_RATE)
    expect(status.crossed).toBe(true)
    expect(status.peakUsd).toBeGreaterThanOrEqual(FBAR_THRESHOLD_USD)
  })

  it('is not crossed just under the threshold', () => {
    const holdings: Holding[] = [
      makeHolding({ country: 'IN', accountType: 'nro', balanceInr: 9_000 * SEED_FX_RATE }),
    ]
    const status = fbarStatus(holdings, SEED_FX_RATE)
    expect(status.crossed).toBe(false)
  })
})

describe('complianceItems', () => {
  it('reports FBAR ok when far under threshold', () => {
    const holdings: Holding[] = [makeHolding({ country: 'IN', accountType: 'nro', balanceInr: 100 * SEED_FX_RATE })]
    const items = complianceItems(holdings, SEED_FX_RATE)
    const fbar = items.find((i) => i.key === 'fbar')!
    expect(fbar.level).toBe('ok')
  })

  it('reports FBAR attention once peak exceeds 70% of threshold but hasn\'t crossed', () => {
    // Need peak in (7000, 10000): current in (6730.77, 9615.38)
    const holdings: Holding[] = [
      makeHolding({ country: 'IN', accountType: 'nro', balanceInr: 8_000 * SEED_FX_RATE }),
    ]
    const items = complianceItems(holdings, SEED_FX_RATE)
    const fbar = items.find((i) => i.key === 'fbar')!
    expect(fbar.level).toBe('attention')
  })

  it('reports FBAR overdue once the threshold is crossed', () => {
    const holdings: Holding[] = [
      makeHolding({ country: 'IN', accountType: 'nro', balanceInr: 20_000 * SEED_FX_RATE }),
    ]
    const items = complianceItems(holdings, SEED_FX_RATE)
    const fbar = items.find((i) => i.key === 'fbar')!
    expect(fbar.level).toBe('overdue')
  })

  it('reports PFIC attention only when a PFIC holding exists', () => {
    const withPfic = complianceItems([makeHolding({ isPfic: true })], HARDCODED_FX_RATE)
    const withoutPfic = complianceItems([makeHolding({ isPfic: false })], HARDCODED_FX_RATE)
    expect(withPfic.find((i) => i.key === 'pfic')!.level).toBe('attention')
    expect(withoutPfic.find((i) => i.key === 'pfic')!.level).toBe('ok')
  })

  it('reports FATCA ok exactly at the $50,000 threshold (code uses strict >)', () => {
    const holdings: Holding[] = [
      makeHolding({ country: 'IN', accountType: 'nro', balanceInr: FATCA_THRESHOLD_USD * SEED_FX_RATE }),
    ]
    const items = complianceItems(holdings, SEED_FX_RATE)
    expect(items.find((i) => i.key === 'fatca')!.level).toBe('ok')
  })

  it('reports FATCA attention just above the $50,000 threshold', () => {
    const holdings: Holding[] = [
      makeHolding({ country: 'IN', accountType: 'nro', balanceInr: (FATCA_THRESHOLD_USD + 1) * SEED_FX_RATE }),
    ]
    const items = complianceItems(holdings, SEED_FX_RATE)
    expect(items.find((i) => i.key === 'fatca')!.level).toBe('attention')
  })

  it('excludes India liabilities from the FATCA gross-assets figure', () => {
    const holdings: Holding[] = [
      makeHolding({ id: 'debt', country: 'IN', accountType: 'other_debt', balanceInr: 60_000 * SEED_FX_RATE }),
    ]
    const items = complianceItems(holdings, SEED_FX_RATE)
    expect(items.find((i) => i.key === 'fatca')!.level).toBe('ok')
  })

  it('always returns exactly the three rule-based items, in a stable order', () => {
    const items = complianceItems([], HARDCODED_FX_RATE)
    expect(items.map((i) => i.key)).toEqual(['fbar', 'pfic', 'fatca'])
  })
})

describe('TYPE_LABELS', () => {
  it('has a human-readable label for every liability and common asset type used in the app', () => {
    expect(TYPE_LABELS.checking).toBe('Checking')
    expect(TYPE_LABELS.mortgage).toBe('Mortgage')
    expect(TYPE_LABELS.mutual_fund).toBe('Mutual Fund')
    expect(TYPE_LABELS.nre).toBe('NRE')
  })
})
