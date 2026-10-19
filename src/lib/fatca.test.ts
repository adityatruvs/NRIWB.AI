import { describe, it, expect } from 'vitest'
import { fatcaAssetsUsd, fatcaLine, complianceItems, isFatcaAsset, type Holding } from '@/lib/portfolio'

// Bug: Copilot quoted "foreign assets total ~$223,684" for Form 8938 — every India
// asset, including the ₹1.2 Cr Hyderabad flat. Directly held property isn't a
// specified foreign financial asset.
const RATE = 95
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
const holdings = [
  h({ accountType: 'nre', balanceInr: 2_850_000 }), // $30,000
  h({ accountType: 'fd', balanceInr: 1_900_000 }), // $20,000
  h({ accountType: 'mutual_fund', balanceInr: 950_000, isPfic: true }), // $10,000
  h({ accountType: 'notes_receivable', balanceInr: 475_000 }), // $5,000 lent to family: counts
  h({ accountType: 'property', balanceInr: 12_000_000 }), // the flat: excluded
  h({ accountType: 'vehicle', balanceInr: 950_000 }), // excluded
  h({ accountType: 'gold', balanceInr: 950_000 }), // physical gold: excluded
  h({ accountType: 'home_loan', kind: 'liability', balanceInr: 5_000_000 }), // debt: excluded
  h({ country: 'US', accountType: 'savings', balanceUsd: 40_000 }), // not foreign
]

describe('FATCA (Form 8938) total', () => {
  it('counts India financial assets only: no flat, car, physical gold or debt', () => {
    expect(fatcaAssetsUsd(holdings, RATE)).toBe(65_000)
    expect(isFatcaAsset(h({ accountType: 'gold', details: { isSgb: true } }))).toBe(true)
  })

  it('the dashboard item and the AI prompt line use that same total', () => {
    const fatca = complianceItems(holdings, RATE).find((c) => c.key === 'fatca')!
    expect(fatca.detail).toContain('$65,000')
    expect(fatca.detail).not.toContain('$211,316') // the old all-assets total (flat, car, gold included)
    expect(fatcaLine(65_000)).toMatch(/^India financial assets for Form 8938 total \$65,000 .*ABOVE, Form 8938 required$/)
  })
})
