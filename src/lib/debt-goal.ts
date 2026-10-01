/**
 * Debt-payoff goals ("clear the home loan by 2028"). Pure + testable.
 *
 * A debt goal links exactly one liability and records its `originalAmount` in the
 * loan's own currency. Progress is computed in that currency — (original −
 * current balance) / original — so an INR loan's progress never moves with FX.
 * The payoff date comes from the loan's APR and minimum payment (standard
 * amortization); comparing it with the target year gives the status.
 */

import { isLiability, type Holding } from '@/lib/portfolio'
import type { Goal } from '@/lib/goals'

export type LoanCurrency = 'USD' | 'INR'

export const loanCurrency = (loan: Holding): LoanCurrency => (loan.country === 'IN' ? 'INR' : 'USD')

/** Outstanding balance in the loan's own currency. */
export const loanBalanceNative = (loan: Holding): number =>
  Math.max(0, loan.country === 'IN' ? loan.balanceInr : loan.balanceUsd)

/** Native amount → USD at the current rate. */
export const nativeToUsd = (amount: number, currency: LoanCurrency, rate: number) =>
  currency === 'INR' ? amount / rate : amount

export function linkedLoan(goal: Goal, holdings: Holding[]): Holding | null {
  if (!goal.linkedLiabilityId) return null
  const h = holdings.find((x) => x.id === goal.linkedLiabilityId)
  return h && isLiability(h) ? h : null
}

export interface DebtProgress {
  currency: LoanCurrency
  originalNative: number
  remainingNative: number
  repaidNative: number
  /** 0..1 */
  pct: number
}

export function debtProgress(goal: Goal, loan: Holding): DebtProgress {
  const currency = loanCurrency(loan)
  const remainingNative = loanBalanceNative(loan)
  const originalNative = Math.max(goal.originalAmount ?? remainingNative, remainingNative, 0)
  const repaidNative = originalNative - remainingNative
  const pct = originalNative > 0 ? Math.min(1, Math.max(0, repaidNative / originalNative)) : 1
  return { currency, originalNative, remainingNative, repaidNative, pct }
}

/**
 * The goal with USD figures resolved from its loan: target = original, funded =
 * repaid, both at the current rate (so their ratio is the native progress).
 * A missing loan leaves the goal as stored.
 */
export function resolveDebtGoal(goal: Goal, holdings: Holding[], rate: number): Goal {
  const loan = linkedLoan(goal, holdings)
  if (!loan) return goal
  const p = debtProgress(goal, loan)
  return {
    ...goal,
    targetUsd: nativeToUsd(p.originalNative, p.currency, rate),
    currentUsd: nativeToUsd(p.repaidNative, p.currency, rate),
  }
}

/**
 * Months to repay `balance` at `aprPct` (annual %, e.g. 8.5) paying `payment` a
 * month: n = −ln(1 − rB/P) / ln(1 + r). Infinity when the payment doesn't cover
 * the interest; 0 when there's nothing left.
 */
export function payoffMonths(balance: number, aprPct: number, payment: number): number {
  if (balance <= 0) return 0
  if (payment <= 0) return Infinity
  const r = aprPct / 100 / 12
  if (r <= 0) return Math.ceil(balance / payment)
  if (payment <= balance * r) return Infinity
  return Math.ceil(-Math.log(1 - (r * balance) / payment) / Math.log(1 + r))
}

/** Level monthly payment that clears `balance` in `months` at `aprPct`. */
export function paymentFor(balance: number, aprPct: number, months: number): number {
  if (balance <= 0) return 0
  if (months <= 0) return balance
  const r = aprPct / 100 / 12
  if (r <= 0) return balance / months
  return (balance * r) / (1 - Math.pow(1 + r, -months))
}

/** Months from `now` to the end of `targetYear` (at least 0). */
export function monthsUntilYearEnd(targetYear: number, now: Date): number {
  return Math.max(0, (targetYear - now.getFullYear()) * 12 + (12 - now.getMonth()))
}
