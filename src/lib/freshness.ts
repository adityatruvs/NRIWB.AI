/**
 * Data-freshness helpers for account rows. Pure + testable: given a `lastSyncedAt`
 * ISO string, produce a human age ("Today", "3 months", "14 months") and a
 * staleness bucket that drives the row/header styling.
 */

import { provenanceOf } from '@/lib/provenance'
import { usdValue, type Holding } from '@/lib/portfolio'

/** More than this many days old reads as clearly stale (the reviewers' "3 months+"). */
export const STALE_DAYS = 90
/** Past this it's aging — worth a nudge, but not yet alarming. */
export const AGING_DAYS = 30

export type Freshness = 'fresh' | 'aging' | 'stale' | 'unknown'

/** Whole days between `iso` and `now`, or null when there's no timestamp. */
export function ageInDays(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000))
}

/** Bucket a day-count into a freshness level. */
export function freshnessOf(days: number | null): Freshness {
  if (days === null) return 'unknown'
  if (days > STALE_DAYS) return 'stale'
  if (days > AGING_DAYS) return 'aging'
  return 'fresh'
}

/**
 * Short relative age for a row: "Today", "Yesterday", "5 days", "3 months",
 * "14 months", "2 years". Months are shown up to ~2 years (so a reviewer's
 * "14 months" reads literally) before switching to years.
 */
export function relativeAge(days: number | null): string {
  if (days === null) return 'Not synced'
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days`
  const months = Math.round(days / 30.44)
  if (months < 24) return `${months} month${months === 1 ? '' : 's'}`
  const years = Math.round(days / 365.25)
  return `${years} year${years === 1 ? '' : 's'}`
}

/* ── Ledger-wide confidence ────────────────────────────────────────────────── */


export type ConfidenceBucket = 'fresh' | 'aging' | 'stale' | 'estimated'
export const CONFIDENCE_BUCKETS: ConfidenceBucket[] = ['fresh', 'aging', 'stale', 'estimated']

export interface FreshnessMix {
  /** Share of net worth per bucket, weighted by |USD value| of assets and debts. Sums to 1 (or all 0 when there's nothing to weigh). */
  shares: Record<ConfidenceBucket, number>
  /** Most recent `lastSyncedAt` across the ledger, or null when none has one. */
  latest: string | null
  /** Accounts whose own freshness is `stale` (what the rows flag). */
  staleCount: number
  /** Accounts with no timestamp at all. */
  unknownCount: number
}

/**
 * Where a row lands: a low-confidence (estimated) holding is Estimated whatever
 * its age; otherwise its freshness. No timestamp counts as Stale — nothing
 * vouches for the number.
 */
export function confidenceBucket(h: Holding, now: Date = new Date()): ConfidenceBucket {
  if (provenanceOf(h).confidence === 'low') return 'estimated'
  const f = freshnessOf(ageInDays(h.lastSyncedAt, now))
  return f === 'unknown' ? 'stale' : f
}

export function freshnessMix(holdings: Holding[], rate: number, now: Date = new Date()): FreshnessMix {
  const weight: Record<ConfidenceBucket, number> = { fresh: 0, aging: 0, stale: 0, estimated: 0 }
  let latest: string | null = null
  let staleCount = 0
  let unknownCount = 0
  for (const h of holdings) {
    weight[confidenceBucket(h, now)] += Math.abs(usdValue(h, rate))
    const f = freshnessOf(ageInDays(h.lastSyncedAt, now))
    if (f === 'stale') staleCount++
    if (f === 'unknown') unknownCount++
    if (h.lastSyncedAt && (!latest || Date.parse(h.lastSyncedAt) > Date.parse(latest))) latest = h.lastSyncedAt
  }
  const total = CONFIDENCE_BUCKETS.reduce((s, b) => s + weight[b], 0)
  const shares = { fresh: 0, aging: 0, stale: 0, estimated: 0 }
  if (total > 0) for (const b of CONFIDENCE_BUCKETS) shares[b] = weight[b] / total
  return { shares, latest, staleCount, unknownCount }
}

/** Whole percentages that always add up to 100 (largest-remainder rounding). */
export function sharesToPercents(shares: Record<ConfidenceBucket, number>): Record<ConfidenceBucket, number> {
  const raw = CONFIDENCE_BUCKETS.map((b) => ({ b, v: shares[b] * 100 }))
  const out = Object.fromEntries(raw.map(({ b, v }) => [b, Math.floor(v)])) as Record<ConfidenceBucket, number>
  const sum = raw.reduce((s, { v }) => s + v, 0)
  if (sum === 0) return out
  let left = 100 - CONFIDENCE_BUCKETS.reduce((s, b) => s + out[b], 0)
  for (const { b } of [...raw].sort((x, y) => (y.v % 1) - (x.v % 1))) {
    if (left <= 0) break
    out[b]++
    left--
  }
  return out
}
