/**
 * Net-worth history from balance snapshots. Pure + testable.
 *
 * For each date in the range, every account contributes its most recent snapshot
 * on or before that date (carried forward); an account with no snapshot yet
 * contributes nothing, so a newly added account joins the series from the day it
 * was added, never retroactively. Liabilities count negative. India balances are
 * converted from INR at the *current* rate, like the rest of the app, so the trend
 * isn't distorted by whatever rate was stored at save time. Dollar-held FCNR
 * deposits keep their USD value (see `grossUsd`).
 */

import { grossUsd } from '@/lib/portfolio'
import type { AccountType } from '@/types/accounts'

export type HistoryRange = '90d' | '12m'

export interface SnapshotRow {
  accountId: string
  /** UTC date, YYYY-MM-DD. */
  day: string
  balanceUsd: number
  balanceInr: number
}

export interface HistoryAccount {
  id: string
  country: 'US' | 'IN'
  liability: boolean
  /** Lets an India FCNR deposit (held in dollars) be valued from its USD balance. */
  accountType?: AccountType
}

export interface HistoryPoint {
  /** YYYY-MM-DD (UTC). */
  date: string
  all: number
  us: number
  in: number
}

export interface NetWorthHistory {
  points: HistoryPoint[]
  /** Earliest snapshot day across current accounts, or null when there's none. */
  firstDay: string | null
  /** Distinct days with at least one snapshot. Under 2 means "no trend yet". */
  days: number
}

const DAY_MS = 86_400_000

export const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (day: string, n: number) => isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS))

/** The dates to plot: daily for 90d; month-ends for 12m, ending today. */
export function rangeDates(range: HistoryRange, today: string): string[] {
  if (range === '90d') return Array.from({ length: 90 }, (_, i) => addDays(today, i - 89))
  const [y, m] = today.split('-').map(Number)
  const out: string[] = []
  for (let k = 11; k >= 1; k--) {
    // Last day of the month k months back = day 0 of the following month.
    out.push(isoDay(new Date(Date.UTC(y, m - k, 0))))
  }
  out.push(today)
  return out
}

export function buildHistory(opts: {
  accounts: HistoryAccount[]
  snapshots: SnapshotRow[]
  rate: number
  range: HistoryRange
  today: string
}): NetWorthHistory {
  const byId = new Map(opts.accounts.map((a) => [a.id, a]))
  // Deleted accounts' rows are ignored (normally they cascade away anyway).
  const rows = opts.snapshots
    .filter((s) => byId.has(s.accountId) && s.day <= opts.today)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))

  const days = new Set(rows.map((r) => r.day))
  const firstDay = rows[0]?.day ?? null
  if (!firstDay) return { points: [], firstDay: null, days: 0 }

  // Walk dates and snapshots together, keeping each account's latest value.
  const latest = new Map<string, SnapshotRow>()
  const points: HistoryPoint[] = []
  let i = 0
  for (const date of rangeDates(opts.range, opts.today)) {
    while (i < rows.length && rows[i].day <= date) latest.set(rows[i].accountId, rows[i++])
    if (date < firstDay) continue // the series starts when history does
    const p: HistoryPoint = { date, all: 0, us: 0, in: 0 }
    for (const s of latest.values()) {
      const a = byId.get(s.accountId)!
      const gross = grossUsd({ country: a.country, accountType: a.accountType ?? 'other', balanceUsd: s.balanceUsd, balanceInr: s.balanceInr }, opts.rate)
      const v = a.liability ? -gross : gross
      p.all += v
      if (a.country === 'US') p.us += v
      else p.in += v
    }
    points.push(p)
  }
  return { points, firstDay, days: days.size }
}

/**
 * The month-over-month comparison point: the series value ~30 days ago, shown only
 * once a snapshot at least 28 days old exists (otherwise there's no real month).
 */
export function monthAgoValue(
  history: NetWorthHistory,
  key: 'all' | 'us' | 'in',
  today: string,
): number | null {
  if (!history.firstDay || history.firstDay > addDays(today, -28)) return null
  const target = history.firstDay > addDays(today, -30) ? history.firstDay : addDays(today, -30)
  // The last plotted point on or before the target date.
  let best: HistoryPoint | null = null
  for (const p of history.points) if (p.date <= target) best = p
  return best ? best[key] : null
}
