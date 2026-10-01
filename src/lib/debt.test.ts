import { describe, it, expect } from 'vitest'
import { debtRollup, currencyMismatch, mismatchStillDismissed } from '@/lib/debt'
import type { Holding } from '@/lib/portfolio'

const RATE = 80
const LAKH = 100_000
const loan = (over: Partial<Holding>): Holding => ({
  nickname: 'loan',
  institution: 'bank',
  accountType: 'mortgage',
  kind: 'liability',
  country: 'US',
  balanceUsd: 0,
  balanceInr: 0,
  isPfic: false,
  source: 'manual',
  ...over,
})
const asset: Holding = {
  nickname: 'checking',
  institution: 'bank',
  accountType: 'checking',
  country: 'US',
  balanceUsd: 50_000,
  balanceInr: 0,
  isPfic: false,
  source: 'manual',
}

describe('debtRollup', () => {
  it('weights APR by balance: $100k at 6% + $300k at 4% = 4.5%', () => {
    const r = debtRollup(
      [
        loan({ balanceUsd: 100_000, details: { interestRate: 6 } }),
        loan({ balanceUsd: 300_000, details: { interestRate: 4 } }),
      ],
      RATE,
    )
    expect(r.avgAprPct).toBeCloseTo(4.5)
    expect(r.totalUsd).toBe(400_000)
  })

  it('adds US and India minimums, converting India at the current rate', () => {
    const r = debtRollup(
      [
        loan({ balanceUsd: 100_000, details: { minPayment: 1_000 } }),
        loan({ country: 'IN', balanceInr: 40 * LAKH, details: { minPayment: 40_000 } }),
      ],
      RATE,
    )
    expect(r.monthlyPaymentsUsd).toBe(1_000 + 500)
    expect(r.byCountry).toEqual({ US: 100_000, IN: 50_000 })
  })

  it('leaves loans without an APR out of the average and lists them', () => {
    const noRate = [loan({ id: 'a', balanceUsd: 1 }), loan({ id: 'b', balanceUsd: 1 })]
    const r = debtRollup([loan({ balanceUsd: 100, details: { interestRate: 7 } }), ...noRate], RATE)
    expect(r.avgAprPct).toBe(7)
    expect(r.missingApr.map((h) => h.id)).toEqual(['a', 'b'])
  })

  it('is empty with no debts, and ignores assets', () => {
    const r = debtRollup([asset], RATE)
    expect(r.count).toBe(0)
    expect(r.totalUsd).toBe(0)
    expect(r.avgAprPct).toBeNull()
    expect(r.monthlyPaymentsUsd).toBe(0)
  })
})

describe('currencyMismatch', () => {
  it('fires for Rs 40L of India debt, no US debt, USD income', () => {
    const m = currencyMismatch([asset, loan({ country: 'IN', balanceInr: 40 * LAKH })], RATE)
    expect(m.fires).toBe(true)
    expect(m.inrDebtSharePct).toBe(100)
    expect(m.inrIncomeSharePct).toBe(0)
  })

  it('quantifies a 5% rupee move as INR debt / rate × 0.05', () => {
    const m = currencyMismatch([loan({ country: 'IN', balanceInr: 40 * LAKH })], RATE)
    expect(m.exposureUsd).toBeCloseTo(((40 * LAKH) / RATE) * 0.05)
    expect(m.exposureUsd).toBeCloseTo(2_500)
  })

  it('stays quiet with only US debt, or INR debt under $10,000', () => {
    expect(currencyMismatch([loan({ balanceUsd: 500_000 })], RATE).fires).toBe(false)
    expect(currencyMismatch([loan({ country: 'IN', balanceInr: 7 * LAKH })], RATE).fires).toBe(false) // $8,750
  })

  it('stays quiet when INR debt is under half of all debt', () => {
    const m = currencyMismatch(
      [loan({ country: 'IN', balanceInr: 40 * LAKH }), loan({ balanceUsd: 60_000 })],
      RATE,
    )
    expect(m.inrDebtSharePct).toBeCloseTo(45.45, 1)
    expect(m.fires).toBe(false)
  })
})

describe('mismatchStillDismissed', () => {
  it('re-shows once the INR debt share moves 10+ points', () => {
    expect(mismatchStillDismissed(null, 100)).toBe(false)
    expect(mismatchStillDismissed(100, 95)).toBe(true)
    expect(mismatchStillDismissed(100, 90)).toBe(false)
    expect(mismatchStillDismissed(70, 80)).toBe(false)
  })
})
