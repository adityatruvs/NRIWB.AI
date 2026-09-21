import { describe, it, expect } from 'vitest'
import { rankStaleAccounts, rankPhrase } from '@/lib/refresh-guidance'
import type { Holding } from '@/lib/portfolio'

const NOW = new Date('2026-09-16T12:00:00.000Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

function h(id: string, balanceUsd: number, days: number | null, extra: Partial<Holding> = {}): Holding {
  return {
    id,
    nickname: id,
    institution: 'Bank',
    accountType: 'brokerage',
    country: 'US',
    balanceUsd,
    balanceInr: 0,
    isPfic: false,
    source: 'manual',
    ...(days !== null ? { lastSyncedAt: daysAgo(days) } : {}),
    ...extra,
  }
}

// The lib uses a live `now` internally; tests use ages far from the thresholds so
// the day-of-run never flips a result.
const RATE = 83

describe('rankStaleAccounts', () => {
  it('picks the account with the highest staleness × size, ignoring fresh ones', () => {
    const holdings = [
      h('fresh-big', 1_000_000, 2), // huge but fresh -> not a candidate for `top`
      h('old-small', 100, 400), // very old but tiny -> low impact
      h('fund', 200_000, 300), // old and large -> should win
    ]
    const { top } = rankStaleAccounts(holdings, RATE)
    expect(top?.holding.id).toBe('fund')
  })

  it('computes age rank (oldest) and size rank (largest, across all accounts)', () => {
    const holdings = [
      h('fund', 200_000, 300),
      h('checking', 500_000, 120), // largest overall, newer
      h('old-cd', 50_000, 500), // oldest
    ]
    const { top, ranked } = rankStaleAccounts(holdings, RATE)
    // fund: score 300*200k = 60M; checking 120*500k = 60M; old-cd 500*50k = 25M.
    // fund and checking tie-ish — assert ranks are computed regardless of winner.
    const fund = ranked.find((r) => r.holding.id === 'fund')!
    expect(fund.ageRank).toBe(2) // old-cd(500) oldest, fund(300) second
    expect(fund.sizeRank).toBe(2) // checking(500k) largest, fund(200k) second
    expect(top).not.toBeNull()
  })

  it('returns no suggestion when nothing is stale enough', () => {
    const { top } = rankStaleAccounts([h('a', 100_000, 5), h('b', 50_000, 10)], RATE)
    expect(top).toBeNull()
  })

  it('returns no suggestion when no account has a timestamp (e.g. demo data)', () => {
    const { top, ranked } = rankStaleAccounts([h('a', 100_000, null), h('b', 50_000, null)], RATE)
    expect(top).toBeNull()
    expect(ranked).toHaveLength(0)
  })
})

describe('rankPhrase', () => {
  it('reads naturally for the common ranks', () => {
    expect(rankPhrase(1, 'oldest')).toBe('oldest')
    expect(rankPhrase(2, 'largest')).toBe('second-largest')
    expect(rankPhrase(3, 'oldest')).toBe('third-oldest')
    expect(rankPhrase(4, 'largest')).toBe('4th largest')
  })
})
