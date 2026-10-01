import { describe, it, expect } from 'vitest'
import { debtProgress, payoffMonths, paymentFor, resolveDebtGoal, monthsUntilYearEnd } from '@/lib/debt-goal'
import { debtGoalStatus } from '@/lib/goal-status'
import type { Goal } from '@/lib/goals'
import type { Holding } from '@/lib/portfolio'

const LAKH = 100_000
const inrLoan = (over: Partial<Holding> = {}): Holding => ({
  id: 'loan1',
  nickname: 'Bangalore home loan',
  institution: 'HDFC',
  accountType: 'home_loan',
  kind: 'liability',
  country: 'IN',
  balanceUsd: 0,
  balanceInr: 32 * LAKH,
  isPfic: false,
  source: 'manual',
  details: { interestRate: 8.5, minPayment: 52_070 },
  ...over,
})
const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  name: 'Clear the home loan',
  category: 'debt',
  targetUsd: 0,
  currentUsd: 0,
  targetYear: 2032,
  linkedLiabilityId: 'loan1',
  originalAmount: 60 * LAKH,
  ...over,
})

describe('debtProgress', () => {
  it('measures an INR loan in INR: Rs 28L of Rs 60L repaid is 47%', () => {
    const p = debtProgress(goal(), inrLoan())
    expect(p.currency).toBe('INR')
    expect(p.repaidNative).toBe(28 * LAKH)
    expect(p.originalNative).toBe(60 * LAKH)
    expect(Math.round(p.pct * 100)).toBe(47)
  })

  it('does not move with the exchange rate', () => {
    const a = resolveDebtGoal(goal(), [inrLoan()], 80)
    const b = resolveDebtGoal(goal(), [inrLoan()], 95)
    expect(a.currentUsd / a.targetUsd).toBeCloseTo(b.currentUsd / b.targetUsd)
    expect(a.targetUsd).toBeCloseTo((60 * LAKH) / 80)
  })

  it('defaults the original amount to the current balance', () => {
    expect(debtProgress(goal({ originalAmount: undefined }), inrLoan()).pct).toBe(0)
  })
})

describe('payoffMonths / paymentFor — standard amortization reference cases', () => {
  it('$200,000 at 6% for 30 years: ~$1,199.10/month, 360 months', () => {
    expect(paymentFor(200_000, 6, 360)).toBeCloseTo(1199.1, 1)
    expect(payoffMonths(200_000, 6, 1199.11)).toBe(360)
  })
  it('Rs 60L at 8.5% for 20 years: EMI ~Rs 52,069, 240 months', () => {
    expect(paymentFor(60 * LAKH, 8.5, 240)).toBeCloseTo(52_069.4, 0)
    expect(payoffMonths(60 * LAKH, 8.5, 52_070)).toBe(240)
  })
  it('$10,000 at 5% for 5 years: ~$188.71/month, 60 months', () => {
    expect(paymentFor(10_000, 5, 60)).toBeCloseTo(188.71, 2)
    expect(payoffMonths(10_000, 5, 188.72)).toBe(60)
  })
  it('never pays off when the payment does not cover the interest', () => {
    expect(payoffMonths(100_000, 12, 1_000)).toBe(Infinity)
  })
  it('handles zero interest and a cleared balance', () => {
    expect(payoffMonths(1_200, 0, 100)).toBe(12)
    expect(payoffMonths(0, 5, 100)).toBe(0)
  })
})

describe('debtGoalStatus', () => {
  const now = new Date(2026, 8, 15) // Sep 2026

  it('is Reached when the loan balance is 0', () => {
    expect(debtGoalStatus(goal(), [inrLoan({ balanceInr: 0 })], 83, now).status).toBe('reached')
  })

  it('asks for details when APR or minimum payment is missing', () => {
    expect(debtGoalStatus(goal(), [inrLoan({ details: { minPayment: 50_000 } })], 83, now).status).toBe('needs_details')
    expect(debtGoalStatus(goal(), [inrLoan({ details: { interestRate: 8.5 } })], 83, now).status).toBe('needs_details')
  })

  it('shows Loan removed when the linked loan is gone', () => {
    expect(debtGoalStatus(goal(), [], 83, now).status).toBe('loan_removed')
    expect(debtGoalStatus(goal({ linkedLiabilityId: undefined }), [inrLoan()], 83, now).status).toBe('loan_removed')
  })

  it('compares the projected payoff date with the target year', () => {
    // Rs 32L at 8.5% paying Rs 52,070/month clears in ~83 months → around Aug 2033.
    const s = debtGoalStatus(goal({ targetYear: 2033 }), [inrLoan()], 83, now)
    expect(s.payoffMonth?.startsWith('2033')).toBe(true)
    expect(s.status).toBe('on_track')
    expect(debtGoalStatus(goal({ targetYear: 2035 }), [inrLoan()], 83, now).status).toBe('ahead')
    const behind = debtGoalStatus(goal({ targetYear: 2030 }), [inrLoan()], 83, now)
    expect(behind.status).toBe('behind')
    // The gap is the extra EMI needed to clear it by Dec 2030, shown in USD.
    const needed = paymentFor(32 * LAKH, 8.5, monthsUntilYearEnd(2030, now))
    expect(behind.monthlyGapUsd).toBeCloseTo((needed - 52_070) / 83)
  })

  it('is Overdue once the target year has passed', () => {
    expect(debtGoalStatus(goal({ targetYear: 2025 }), [inrLoan()], 83, now).status).toBe('overdue')
  })
})
