/**
 * Debt-payoff goals ("clear the home loan by 2028"). Pure + testable.
 *
 * A debt goal links one or more liabilities and records each one's starting balance
 * (`originalAmounts`) in that loan's own currency. Progress is computed natively —
 * (original − current balance) / original — so an INR loan's progress never moves
 * with FX. The payoff date comes from each loan's APR and minimum payment (standard
 * amortization), the goal clearing when the last loan does; comparing that with the
 * target year gives the status.
 */

import { isLiability, type Holding } from '@/lib/portfolio'
import type { Goal } from '@/lib/goals'

export type LoanCurrency = 'USD' | 'INR'

export const loanCurrency = (loan: Holding): LoanCurrency => (loan.country === 'IN' ? 'INR' : 'USD')

/** Outstanding balance in the loan's own currency. */
export const loanBalanceNative = (loan: Holding): number =>
  Math.max(0, (loan.country === 'IN' ? loan.balanceInr : loan.balanceUsd) || 0)

/** Native amount → USD at the current rate. */
export const nativeToUsd = (amount: number, currency: LoanCurrency, rate: number) =>
  currency === 'INR' ? amount / rate : amount

export function linkedLoans(goal: Goal, holdings: Holding[]): Holding[] {
  return (goal.linkedLiabilityIds ?? []).flatMap((id) => {
    const h = holdings.find((x) => x.id === id)
    return h && isLiability(h) ? [h] : []
  })
}

export interface LoanProgress {
  currency: LoanCurrency
  originalNative: number
  remainingNative: number
  repaidNative: number
  /** 0..1 */
  pct: number
}

/** One loan's progress, in its own currency, from the starting balance saved for it. */
export function loanProgress(goal: Goal, loan: Holding): LoanProgress {
  const currency = loanCurrency(loan)
  const remainingNative = loanBalanceNative(loan)
  const saved = loan.id ? goal.originalAmounts?.[loan.id] : undefined
  const originalNative = Math.max(saved ?? remainingNative, remainingNative, 0)
  const repaidNative = originalNative - remainingNative
  const pct = originalNative > 0 ? Math.min(1, Math.max(0, repaidNative / originalNative)) : 1
  return { currency, originalNative, remainingNative, repaidNative, pct }
}

export interface DebtProgress {
  /** The loans' shared currency, or USD when they mix (then amounts are converted at the rate). */
  currency: LoanCurrency
  originalNative: number
  remainingNative: number
  repaidNative: number
  /** 0..1 */
  pct: number
}

/**
 * All linked loans together. Loans in one currency are summed natively, so an INR
 * goal's progress never moves with FX; a mix is converted to USD at `rate`.
 */
export function debtProgress(goal: Goal, loans: Holding[], rate: number): DebtProgress {
  const parts = loans.map((l) => loanProgress(goal, l))
  const mixed = new Set(parts.map((p) => p.currency)).size > 1
  const currency: LoanCurrency = mixed ? 'USD' : (parts[0]?.currency ?? 'USD')
  const conv = (n: number, c: LoanCurrency) => (mixed ? nativeToUsd(n, c, rate) : n)
  const sum = (pick: (p: LoanProgress) => number) =>
    parts.reduce((s, p) => s + conv(pick(p), p.currency), 0)
  const originalNative = sum((p) => p.originalNative)
  const remainingNative = sum((p) => p.remainingNative)
  const repaidNative = originalNative - remainingNative
  const pct = originalNative > 0 ? Math.min(1, Math.max(0, repaidNative / originalNative)) : 1
  return { currency, originalNative, remainingNative, repaidNative, pct }
}

/**
 * The goal with USD figures resolved from its loans: target = original, funded =
 * repaid, both at the current rate (so their ratio is the native progress for a
 * single-currency goal). With no loans left the goal stays as stored.
 */
export function resolveDebtGoal(goal: Goal, holdings: Holding[], rate: number): Goal {
  const loans = linkedLoans(goal, holdings)
  if (loans.length === 0) return goal
  const p = debtProgress(goal, loans, rate)
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

/** The loan-dependent fields of the Debt payoff dialog. */
export interface LoanPickState {
  loanIds: string[]
  /** Starting balance per selected loan as typed, in that loan's own currency. */
  originals: Record<string, string>
  name: string
  /** The last name we generated, so a hand-written name is never overwritten. */
  autoName: string
}

/**
 * Ticking a loan adds it, defaulting its starting balance to what's owed today;
 * unticking drops it and its figure. The name defaults to "Pay off <loan>" (or
 * "Pay off N loans"), and a name the user wrote themselves is left alone.
 */
export function toggleLoan(state: LoanPickState, loan: Holding, all: Holding[]): LoanPickState {
  const id = loan.id
  if (!id) return state
  const on = state.loanIds.includes(id)
  const loanIds = on ? state.loanIds.filter((i) => i !== id) : [...state.loanIds, id]
  const originals = { ...state.originals }
  if (on) delete originals[id]
  else originals[id] = String(Math.round(loanBalanceNative(loan)))
  const next = { ...state, loanIds, originals }
  if (!state.name.trim() || state.name === state.autoName) {
    const first = all.find((h) => h.id === loanIds[0])
    next.name = loanIds.length === 0 ? '' : loanIds.length === 1 && first ? `Pay off ${first.nickname}` : `Pay off ${loanIds.length} loans`
    next.autoName = next.name
  }
  return next
}
