import { describe, it, expect } from 'vitest'
import { comparePrepay, type PrepayInputs } from '@/lib/prepay'
import { paymentFor, payoffMonths } from '@/lib/debt-goal'

const base = (over: Partial<PrepayInputs>): PrepayInputs => ({
  balance: 200_000,
  aprPct: 6,
  payment: paymentFor(200_000, 6, 360),
  extra: 0,
  extraMode: 'lump',
  horizonMonths: 360,
  investReturn: 0.07,
  currency: 'USD',
  rate: 83,
  ...over,
})

// Totals from a standard amortization calculator (level payment, monthly compounding).
describe('matches a standard amortization calculator within $1', () => {
  it('$200,000 at 6% over 30 years: $231,676.38 total interest, 360 payments', () => {
    const r = comparePrepay(base({}))
    expect(Math.abs(r.invest.lifetimeInterest - 231_676.38)).toBeLessThan(1)
    expect(r.invest.payoffMonths).toBe(360)
  })

  it('$100,000 at 5% over 15 years: $42,342.85 total interest', () => {
    const r = comparePrepay(
      base({ balance: 100_000, aprPct: 5, payment: paymentFor(100_000, 5, 180), horizonMonths: 180 }),
    )
    expect(Math.abs(r.invest.lifetimeInterest - 42_342.85)).toBeLessThan(1)
    expect(r.invest.payoffMonths).toBe(180)
  })

  it('$10,000 at 5% over 5 years: $1,322.74 total interest', () => {
    const r = comparePrepay(base({ balance: 10_000, aprPct: 5, payment: paymentFor(10_000, 5, 60), horizonMonths: 60 }))
    expect(Math.abs(r.invest.lifetimeInterest - 1_322.74)).toBeLessThan(1)
  })
})

describe('comparePrepay', () => {
  it('a lump prepayment shortens the loan to the amortization formula and saves interest', () => {
    const r = comparePrepay(base({ extra: 20_000 }))
    expect(r.prepay.payoffMonths).toBe(payoffMonths(180_000, 6, base({}).payment))
    expect(r.monthsSaved).toBeGreaterThan(70)
    expect(r.interestSaved).toBeGreaterThan(0)
  })

  it('a monthly extra matches paying the larger amount', () => {
    const r = comparePrepay(base({ extra: 200, extraMode: 'monthly' }))
    expect(r.prepay.payoffMonths).toBe(payoffMonths(200_000, 6, base({}).payment + 200))
  })

  it('with no extra, the two scenarios are identical', () => {
    const r = comparePrepay(base({}))
    expect(r.prepay.endNetUsd).toBeCloseTo(r.invest.endNetUsd)
    expect(r.interestSaved).toBeCloseTo(0)
  })

  it('investing wins when the expected return beats the loan rate, prepaying when it does not', () => {
    const hi = comparePrepay(base({ extra: 20_000, investReturn: 0.1 }))
    expect(hi.invest.endNetUsd).toBeGreaterThan(hi.prepay.endNetUsd)
    const lo = comparePrepay(base({ extra: 20_000, investReturn: 0.02 }))
    expect(lo.prepay.endNetUsd).toBeGreaterThan(lo.invest.endNetUsd)
  })

  it('a stronger rupee makes prepaying an INR loan relatively better', () => {
    const inr = (move: number) => {
      const r = comparePrepay(
        base({
          currency: 'INR',
          rate: 83,
          balance: 60_00_000,
          aprPct: 8.5,
          payment: paymentFor(60_00_000, 8.5, 240),
          extra: 5_00_000,
          horizonMonths: 60,
          rupeeMove: move,
        }),
      )
      return r.prepay.endNetUsd - r.invest.endNetUsd
    }
    expect(inr(0.1)).toBeGreaterThan(inr(0))
    expect(inr(0)).toBeGreaterThan(inr(-0.1))
  })

  it('never goes below zero on the loan or double-spends a lump larger than the balance', () => {
    const r = comparePrepay(base({ balance: 5_000, payment: 500, extra: 8_000, horizonMonths: 12 }))
    expect(r.prepay.payoffMonths).toBe(0)
    expect(r.prepay.loanRemainingUsd).toBe(0)
    expect(r.prepay.investmentsUsd).toBeGreaterThan(3_000) // the $3,000 left over, plus freed payments
  })
})
