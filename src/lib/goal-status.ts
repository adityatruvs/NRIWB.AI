/**
 * On track / Ahead / Behind for a goal. Pure + testable.
 *
 * Projects the funded amount to the target year: today's savings grown at the
 * goal's expected return, plus the planned monthly contribution (if any) grown
 * as an annuity — the same math as `goalMonthlyNeeded`, run forwards.
 *
 *   projected ≥ 105% of target → Ahead      95–105% → On track     < 95% → Behind
 *   funded ≥ target → Reached (any date)    year passed, not reached → Overdue
 *
 * A goal due this year counts months to its deadline month (default: December),
 * and says so (`monthsLeftThisYear`) instead of reading as a passed year.
 */

import { goalExpectedReturn, monthlyNeededOver, type Goal } from '@/lib/goals'
import type { Holding } from '@/lib/portfolio'
import {
  debtProgress,
  linkedLoans,
  loanBalanceNative,
  loanCurrency,
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
  | 'needs_details' // a loan has no APR or minimum payment yet
  | 'loan_removed' // every linked loan was deleted

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
  /**
   * Set when the target year is the current year and the deadline hasn't passed:
   * whole months left until it. Null otherwise.
   */
  monthsLeftThisYear: number | null
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
 * Months from now to the goal's deadline. A future year runs to the year's end
 * counted in whole years; the current year runs to `targetMonth` (default
 * December). Negative once the deadline month has passed.
 */
export function goalMonthsLeft(goal: Goal, currentYear: number, currentMonth: number): number {
  if (goal.targetYear === currentYear) return (goal.targetMonth ?? 12) - currentMonth
  return (goal.targetYear - currentYear) * 12
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
  /** 1–12. Defaults to December, i.e. no months left in the current year. */
  currentMonth = 12,
): GoalStatus {
  if (goal.category === 'debt') return debtGoalStatus(goal, holdings, rate)
  const planned = goal.plannedMonthlyUsd && goal.plannedMonthlyUsd > 0 ? goal.plannedMonthlyUsd : 0
  const monthsToGo = goalMonthsLeft(goal, currentYear, currentMonth)
  const months = Math.max(0, monthsToGo)
  const thisYear = goal.targetYear === currentYear && monthsToGo >= 0
  const projectedUsd = projectFunded(goal.currentUsd, planned, months, annualReturn)
  const ratio = goal.targetUsd > 0 ? projectedUsd / goal.targetUsd : 1
  const base = {
    projectedUsd,
    ratio,
    monthlyGapUsd: null,
    monthsLeftThisYear: thisYear ? months : null,
    hasPlan: planned > 0,
    annualReturn,
  }

  if (goal.currentUsd >= goal.targetUsd) return { ...base, status: 'reached' }
  if (goal.targetYear < currentYear || monthsToGo < 0) return { ...base, status: 'overdue' }
  if (ratio >= AHEAD_AT) return { ...base, status: 'ahead' }
  if (ratio >= ON_TRACK_AT) return { ...base, status: 'on_track' }
  const needed = monthlyNeededOver(goal.currentUsd, goal.targetUsd, months, annualReturn)
  return {
    ...base,
    status: 'behind',
    monthlyGapUsd: months > 0 ? Math.max(0, needed - planned) : null,
  }
}

/**
 * Debt payoff: project each loan's payoff month from its APR and minimum payment;
 * the goal clears when the last one does. Compare that with the target year:
 * before it is Ahead, during it On track, after it Behind (with the extra per
 * month, across the loans, that would clear them by the end of the target year).
 */
export function debtGoalStatus(goal: Goal, holdings: Holding[], rate: number, now: Date = new Date()): GoalStatus {
  const base = { projectedUsd: 0, ratio: 0, monthlyGapUsd: null, monthsLeftThisYear: null, hasPlan: true, annualReturn: 0 }
  const loans = linkedLoans(goal, holdings)
  if (loans.length === 0) return { ...base, status: 'loan_removed' }
  const p = debtProgress(goal, loans, rate)
  const open = loans.filter((l) => loanBalanceNative(l) > 0)
  if (open.length === 0) return { ...base, ratio: 1, status: 'reached', payoffMonth: null }

  if (open.some((l) => l.details?.interestRate == null || !(l.details?.minPayment && l.details.minPayment > 0))) {
    return { ...base, status: 'needs_details' }
  }

  const monthsLeft = monthsUntilYearEnd(goal.targetYear, now)
  const months = open.map((l) => payoffMonths(loanBalanceNative(l), l.details!.interestRate!, l.details!.minPayment!))
  const last = Math.max(...months)
  const payoff = Number.isFinite(last) ? new Date(now.getFullYear(), now.getMonth() + last, 1) : null
  const payoffMonth = payoff ? `${payoff.getFullYear()}-${String(payoff.getMonth() + 1).padStart(2, '0')}` : null
  const withPayoff = { ...base, ratio: p.pct, payoffMonth }

  if (goal.targetYear < now.getFullYear()) return { ...withPayoff, status: 'overdue' }
  if (payoff && payoff.getFullYear() < goal.targetYear) return { ...withPayoff, status: 'ahead' }
  if (payoff && payoff.getFullYear() === goal.targetYear) return { ...withPayoff, status: 'on_track' }
  const gapUsd = open.reduce((sum, l) => {
    const needed = paymentFor(loanBalanceNative(l), l.details!.interestRate!, monthsLeft)
    return sum + nativeToUsd(Math.max(0, needed - l.details!.minPayment!), loanCurrency(l), rate)
  }, 0)
  return { ...withPayoff, status: 'behind', monthlyGapUsd: gapUsd }
}

/** "Within current year – 3 months left" (or "due this month"). */
export function withinYearLabel(monthsLeft: number): string {
  return monthsLeft <= 0
    ? 'Within current year – due this month'
    : `Within current year – ${monthsLeft} month${monthsLeft === 1 ? '' : 's'} left`
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
