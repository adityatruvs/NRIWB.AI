/**
 * On track / Ahead / Behind for a goal. Pure + testable.
 *
 * Projects the funded amount to the target year: today's savings grown at the
 * goal's expected return, plus the planned monthly contribution (if any) grown
 * as an annuity — the same math as `goalMonthlyNeeded`, run forwards.
 *
 *   projected ≥ 105% of target → Ahead      95–105% → On track     < 95% → Behind
 *   funded ≥ target → Reached (any date)    year passed, not reached → Overdue
 */

import { goalExpectedReturn, goalMonthlyNeeded, type Goal } from '@/lib/goals'
import type { Holding } from '@/lib/portfolio'
import {
  debtProgress,
  linkedLoan,
  monthsUntilYearEnd,
  nativeToUsd,
  payoffMonths,
  paymentFor,
} from '@/lib/debt-goal'

export type GoalStatusKind =
  | 'reached'
  | 'ahead'
  | 'on_track'
  | 'behind'
  | 'overdue'
  // Debt payoff only:
  | 'needs_details' // the loan has no APR or minimum payment yet
  | 'loan_removed' // the linked loan was deleted

export interface GoalStatus {
  status: GoalStatusKind
  /** Projected funded amount at the target year (USD). */
  projectedUsd: number
  /** projected / target. */
  ratio: number
  /**
   * Extra per month needed to close the gap (needed − planned), for Behind with
   * months left. Null otherwise.
   */
  monthlyGapUsd: number | null
  /** Whether the goal has a planned monthly contribution. */
  hasPlan: boolean
  annualReturn: number
  /** Debt payoff: projected payoff month (YYYY-MM), or null when it never pays off. */
  payoffMonth?: string | null
}

export const AHEAD_AT = 1.05
export const ON_TRACK_AT = 0.95

/** FV of `saved` plus `monthly` contributions over `months` at an annual return. */
export function projectFunded(saved: number, monthly: number, months: number, annualReturn: number): number {
  if (months <= 0) return saved
  const r = annualReturn / 12
  if (r <= 0) return saved + monthly * months
  const growth = Math.pow(1 + r, months)
  return saved * growth + monthly * ((growth - 1) / r)
}

/**
 * Status for a goal whose `currentUsd` is already resolved (see `resolveGoal`).
 * `annualReturn` defaults to the goal's expected return from its accounts.
 */
export function goalStatus(
  goal: Goal,
  holdings: Holding[],
  rate: number,
  currentYear: number,
  annualReturn = goalExpectedReturn(goal, holdings, rate),
): GoalStatus {
  if (goal.category === 'debt') return debtGoalStatus(goal, holdings, rate)
  const planned = goal.plannedMonthlyUsd && goal.plannedMonthlyUsd > 0 ? goal.plannedMonthlyUsd : 0
  const months = (goal.targetYear - currentYear) * 12
  const projectedUsd = projectFunded(goal.currentUsd, planned, months, annualReturn)
  const ratio = goal.targetUsd > 0 ? projectedUsd / goal.targetUsd : 1
  const base = { projectedUsd, ratio, monthlyGapUsd: null, hasPlan: planned > 0, annualReturn }

  if (goal.currentUsd >= goal.targetUsd) return { ...base, status: 'reached' }
  if (goal.targetYear < currentYear) return { ...base, status: 'overdue' }
  if (ratio >= AHEAD_AT) return { ...base, status: 'ahead' }
  if (ratio >= ON_TRACK_AT) return { ...base, status: 'on_track' }
  const needed = goalMonthlyNeeded(goal, currentYear, annualReturn)
  return {
    ...base,
    status: 'behind',
    monthlyGapUsd: months > 0 ? Math.max(0, needed - planned) : null,
  }
}

/**
 * Debt payoff: project the payoff month from the loan's APR and minimum payment
 * and compare it with the target year. Paying off before the target year is
 * Ahead, during it On track, after it Behind (with the extra per month that
 * would clear it by the end of the target year).
 */
export function debtGoalStatus(goal: Goal, holdings: Holding[], rate: number, now: Date = new Date()): GoalStatus {
  const base = { projectedUsd: 0, ratio: 0, monthlyGapUsd: null, hasPlan: true, annualReturn: 0 }
  const loan = linkedLoan(goal, holdings)
  if (!loan) return { ...base, status: 'loan_removed' }
  const p = debtProgress(goal, loan)
  if (p.remainingNative <= 0) return { ...base, ratio: 1, status: 'reached', payoffMonth: null }

  const apr = loan.details?.interestRate
  const payment = loan.details?.minPayment
  if (apr == null || !payment || payment <= 0) return { ...base, status: 'needs_details' }

  const months = payoffMonths(p.remainingNative, apr, payment)
  const payoff = Number.isFinite(months) ? new Date(now.getFullYear(), now.getMonth() + months, 1) : null
  const payoffMonth = payoff ? `${payoff.getFullYear()}-${String(payoff.getMonth() + 1).padStart(2, '0')}` : null
  const withPayoff = { ...base, ratio: p.pct, payoffMonth }

  if (goal.targetYear < now.getFullYear()) return { ...withPayoff, status: 'overdue' }
  if (payoff && payoff.getFullYear() < goal.targetYear) return { ...withPayoff, status: 'ahead' }
  if (payoff && payoff.getFullYear() === goal.targetYear) return { ...withPayoff, status: 'on_track' }
  const needed = paymentFor(p.remainingNative, apr, monthsUntilYearEnd(goal.targetYear, now))
  return {
    ...withPayoff,
    status: 'behind',
    monthlyGapUsd: nativeToUsd(Math.max(0, needed - payment), p.currency, rate),
  }
}

export const GOAL_STATUS_LABELS: Record<GoalStatusKind, string> = {
  reached: 'Reached',
  ahead: 'Ahead',
  on_track: 'On track',
  behind: 'Behind',
  overdue: 'Overdue',
  needs_details: 'Needs loan details',
  loan_removed: 'Loan removed',
}
