/**
 * Data-freshness helpers for account rows. Pure + testable: given a `lastSyncedAt`
 * ISO string, produce a human age ("Today", "3 months", "14 months") and a
 * staleness bucket that drives the row/header styling.
 */

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
