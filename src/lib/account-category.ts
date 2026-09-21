/**
 * Account category taxonomy + sorting — how the ledger organizes 30+ accounts into
 * collapsible folders within each country, and orders rows inside them. Pure +
 * testable; the UI supplies the icons and folder chrome.
 */

import { isLiability, usdValue, type Holding } from '@/lib/portfolio'
import { ageInDays } from '@/lib/freshness'
import type { AccountType } from '@/types/accounts'

export type AccountCategory =
  | 'banking'
  | 'investments'
  | 'retirement'
  | 'real_estate'
  | 'liabilities'
  | 'other'

/** Folder order, top to bottom. */
export const CATEGORY_ORDER: AccountCategory[] = [
  'banking',
  'investments',
  'retirement',
  'real_estate',
  'liabilities',
  'other',
]

export const CATEGORY_LABELS: Record<AccountCategory, string> = {
  banking: 'Banking',
  investments: 'Investments',
  retirement: 'Retirement',
  real_estate: 'Real estate',
  liabilities: 'Liabilities',
  other: 'Other',
}

// Asset types → category. Liabilities are handled by `isLiability` first, so this
// map only needs asset types. Anything unmapped falls through to 'other'.
const BY_TYPE: Partial<Record<AccountType, AccountCategory>> = {
  checking: 'banking',
  savings: 'banking',
  cd: 'banking',
  nre: 'banking',
  nro: 'banking',
  fcnr: 'banking',
  fd: 'banking',
  brokerage: 'investments',
  mutual_fund: 'investments',
  bond: 'investments',
  gold: 'investments',
  notes_receivable: 'investments',
  '401k': 'retirement',
  ira: 'retirement',
  roth_ira: 'retirement',
  real_estate: 'real_estate',
  property: 'real_estate',
  vehicle: 'other',
  other: 'other',
}

/** The folder a holding belongs in. Debt always lands under Liabilities. */
export function categoryOf(h: Holding): AccountCategory {
  if (isLiability(h)) return 'liabilities'
  return BY_TYPE[h.accountType] ?? 'other'
}

export type SortKey = 'balance' | 'name' | 'freshness'

export const SORT_LABELS: Record<SortKey, string> = {
  balance: 'Balance',
  name: 'Name',
  freshness: 'Freshness',
}

/** Order a set of holdings by the chosen key (non-mutating). */
export function sortHoldings(holdings: Holding[], key: SortKey, rate: number): Holding[] {
  const copy = [...holdings]
  if (key === 'name') {
    return copy.sort((a, b) => a.nickname.localeCompare(b.nickname))
  }
  if (key === 'freshness') {
    // Stalest first; accounts without a timestamp (demo/unknown) sort last.
    return copy.sort((a, b) => {
      const da = ageInDays(a.lastSyncedAt)
      const db = ageInDays(b.lastSyncedAt)
      if (da === null && db === null) return 0
      if (da === null) return 1
      if (db === null) return -1
      return db - da
    })
  }
  // balance: largest magnitude first (debts ranked by size owed).
  return copy.sort((a, b) => Math.abs(usdValue(b, rate)) - Math.abs(usdValue(a, rate)))
}
