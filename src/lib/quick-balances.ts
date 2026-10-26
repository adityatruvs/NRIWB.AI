/**
 * Quick edit on the Accounts sheet: the monthly update, every manual balance an
 * input at once. Pure helpers: which typed balances are real changes, which are
 * unreadable, the accounts they save as, and what an undo puts back.
 */

import { balancesFromEntry, entryAmount, entryCurrency } from '@/lib/account-details'
import type { Holding } from '@/lib/portfolio'
import { formatAmountInput, parseAmountInput } from '@/lib/quick-entry'

/** Typed balance text by account id. Only rows the customer has typed in. */
export type BalanceDrafts = ReadonlyMap<string, string>

const roundCents = (n: number) => Math.round(n * 100) / 100

/** A balance is typed by hand only on a manual account; a bank sets the rest. */
export const isQuickEditable = (h: Holding): boolean => h.source === 'manual' && !!h.id

/** The balance as the input shows it before anything is typed. */
export function balanceText(h: Holding, rate: number): string {
  return formatAmountInput(roundCents(entryAmount(h, rate)), entryCurrency(h.country, h.accountType))
}

export interface BalanceChange {
  before: Holding
  after: Holding
}

export interface BalanceReview {
  /** Rows whose typed balance differs from the saved one. */
  changes: BalanceChange[]
  /** Ids typed with something unreadable, blank or negative; nothing saves until fixed. */
  invalid: ReadonlySet<string>
}

export function reviewBalances(holdings: Holding[], drafts: BalanceDrafts, rate: number): BalanceReview {
  const changes: BalanceChange[] = []
  const invalid = new Set<string>()
  for (const h of holdings) {
    if (!isQuickEditable(h) || !drafts.has(h.id!)) continue
    const n = parseAmountInput(drafts.get(h.id!)!)
    if (n == null || Number.isNaN(n) || n < 0) {
      invalid.add(h.id!)
      continue
    }
    if (n === roundCents(entryAmount(h, rate))) continue
    changes.push({ before: h, after: { ...h, ...balancesFromEntry(h.country, h.accountType, n, rate) } })
  }
  return { changes, invalid }
}

/**
 * What an undo restores: the saved changes whose account still holds the balance
 * Save all gave it. An account edited since (by hand or by a bank sync) is left alone.
 */
export function undoableChanges(saved: BalanceChange[], holdings: Holding[]): BalanceChange[] {
  return saved.filter((c) => {
    const now = holdings.find((h) => h.id === c.after.id)
    return !!now && now.balanceUsd === c.after.balanceUsd && now.balanceInr === c.after.balanceInr
  })
}
