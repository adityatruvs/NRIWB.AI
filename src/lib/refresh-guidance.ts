/**
 * "Refresh oldest and largest first" — ranks stale accounts by how much refreshing
 * them would move the user's net worth (staleness × balance impact), so the UI can
 * point at the single highest-leverage update instead of a wall of stale rows.
 *
 * Pure + testable: no React, no data fetching.
 */

import { usdValue, type Holding } from '@/lib/portfolio'
import { ageInDays, AGING_DAYS } from '@/lib/freshness'

export interface RefreshSuggestion {
  holding: Holding
  /** Days since last sync/update. */
  days: number
  /** 1 = oldest among timestamped accounts. */
  ageRank: number
  /** 1 = largest by USD magnitude among all accounts. */
  sizeRank: number
  /** days × |usd| — the impact score it's ranked by. */
  score: number
}

export interface RefreshGuidance {
  /** The single account most worth refreshing, or null when nothing is stale enough. */
  top: RefreshSuggestion | null
  /** All timestamped accounts, highest impact first. */
  ranked: RefreshSuggestion[]
}

/**
 * Rank timestamped accounts by staleness × size. `top` is surfaced only when the
 * highest-impact account is genuinely aging (older than the aging threshold) and
 * carries real value — so we never nag about a fresh or empty account.
 */
export function rankStaleAccounts(holdings: Holding[], rate: number): RefreshGuidance {
  const withAge = holdings
    .map((h) => ({ h, days: ageInDays(h.lastSyncedAt), usd: Math.abs(usdValue(h, rate)) }))
    .filter((x): x is { h: Holding; days: number; usd: number } => x.days !== null && !!x.h.id)

  if (withAge.length === 0) return { top: null, ranked: [] }

  // Age rank (oldest first) among timestamped accounts.
  const ageRankOf = new Map(
    [...withAge].sort((a, b) => b.days - a.days).map((x, i) => [x.h.id!, i + 1]),
  )
  // Size rank (largest first) across ALL accounts, so "second-largest" reads truly.
  const sizeRankOf = new Map(
    [...holdings]
      .filter((h) => h.id)
      .sort((a, b) => Math.abs(usdValue(b, rate)) - Math.abs(usdValue(a, rate)))
      .map((h, i) => [h.id!, i + 1]),
  )

  const ranked: RefreshSuggestion[] = withAge
    .map(({ h, days, usd }) => ({
      holding: h,
      days,
      score: days * usd,
      ageRank: ageRankOf.get(h.id!) ?? 0,
      sizeRank: sizeRankOf.get(h.id!) ?? 0,
    }))
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]
  const top = best && best.days > AGING_DAYS && best.score > 0 ? best : null
  return { top, ranked }
}

function ordinal(n: number): string {
  const suffix = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]}`
}

/** Human rank phrase: 1→"oldest", 2→"second-largest", 3→"third-oldest", 4→"4th largest". */
export function rankPhrase(rank: number, noun: 'oldest' | 'largest'): string {
  if (rank <= 1) return noun
  if (rank === 2) return `second-${noun}`
  if (rank === 3) return `third-${noun}`
  return `${ordinal(rank)} ${noun}`
}
