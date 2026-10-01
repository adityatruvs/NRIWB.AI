/**
 * FBAR (FinCEN 114) balance basis. Pure + testable.
 *
 * FBAR is triggered when the aggregate of each foreign account's *maximum* value
 * during the calendar year exceeds $10,000. The app only knows maxima it has
 * actually recorded (balance snapshots, from the first one this year), so it
 * never estimates a peak: with no history this year it reports current balances
 * and says so; with history it reports the recorded maxima and since when.
 */

import { isLiability, type Holding } from '@/lib/portfolio'

export interface RecordedFbarPeak {
  /** Sum of each India account's highest recorded balance this year (incl. today's), USD at the current rate. */
  usd: number
  /** First snapshot day (YYYY-MM-DD) this year the maxima are drawn from. */
  since: string
}

export interface FbarSnapshot {
  accountId: string
  /** UTC date, YYYY-MM-DD. */
  day: string
  balanceInr: number
}

/** India accounts FBAR looks at here (assets; debts aren't reported). */
export const fbarAccounts = (holdings: Holding[]) => holdings.filter((h) => h.country === 'IN' && !isLiability(h))

/**
 * The recorded peak for `year`, or null when no India account has a snapshot in
 * that year (then only current balances are known). Each account contributes the
 * higher of its highest snapshot and its current balance.
 */
export function recordedFbarPeak(
  holdings: Holding[],
  snapshots: FbarSnapshot[],
  rate: number,
  year: number,
): RecordedFbarPeak | null {
  const accounts = fbarAccounts(holdings)
  const ids = new Set(accounts.map((h) => h.id))
  const inYear = snapshots.filter((s) => ids.has(s.accountId) && s.day.startsWith(`${year}-`))
  if (inYear.length === 0) return null

  const maxInr = new Map<string, number>()
  for (const s of inYear) maxInr.set(s.accountId, Math.max(maxInr.get(s.accountId) ?? 0, s.balanceInr))
  const usd = accounts.reduce((sum, h) => sum + Math.max(maxInr.get(h.id!) ?? 0, h.balanceInr) / rate, 0)
  const since = inYear.reduce((min, s) => (s.day < min ? s.day : min), inYear[0].day)
  return { usd, since }
}

/** "Mar 3" from YYYY-MM-DD, in UTC so the day never shifts. */
export const fbarSinceLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
