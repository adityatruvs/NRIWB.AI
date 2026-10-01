import { describe, it, expect } from 'vitest'
import { ageInDays, freshnessOf, relativeAge, STALE_DAYS, AGING_DAYS } from '@/lib/freshness'

const NOW = new Date('2026-09-16T12:00:00.000Z')
/** ISO string for `days` before NOW. */
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

describe('ageInDays', () => {
  it('counts whole days back from now', () => {
    expect(ageInDays(daysAgo(0), NOW)).toBe(0)
    expect(ageInDays(daysAgo(1), NOW)).toBe(1)
    expect(ageInDays(daysAgo(400), NOW)).toBe(400)
  })

  it('returns null for missing or invalid timestamps', () => {
    expect(ageInDays(null, NOW)).toBeNull()
    expect(ageInDays(undefined, NOW)).toBeNull()
    expect(ageInDays('not-a-date', NOW)).toBeNull()
  })

  it('clamps a future timestamp to 0', () => {
    expect(ageInDays(daysAgo(-5), NOW)).toBe(0)
  })
})

describe('freshnessOf', () => {
  it('buckets by the thresholds', () => {
    expect(freshnessOf(null)).toBe('unknown')
    expect(freshnessOf(0)).toBe('fresh')
    expect(freshnessOf(AGING_DAYS)).toBe('fresh')
    expect(freshnessOf(AGING_DAYS + 1)).toBe('aging')
    expect(freshnessOf(STALE_DAYS)).toBe('aging')
    expect(freshnessOf(STALE_DAYS + 1)).toBe('stale')
  })
})

describe('relativeAge', () => {
  it('formats recent ages', () => {
    expect(relativeAge(null)).toBe('Not synced')
    expect(relativeAge(0)).toBe('Today')
    expect(relativeAge(1)).toBe('Yesterday')
    expect(relativeAge(5)).toBe('5 days')
  })

  it('formats months, including the reviewers’ "14 months" case', () => {
    expect(relativeAge(91)).toBe('3 months')
    expect(relativeAge(426)).toBe('14 months')
  })

  it('switches to years past ~2 years', () => {
    expect(relativeAge(365 * 3)).toBe('3 years')
    expect(relativeAge(365)).toBe('12 months')
  })
})

describe('freshnessMix', async () => {
  const { freshnessMix, sharesToPercents, confidenceBucket } = await import('@/lib/freshness')
  const now = new Date('2026-09-30T12:00:00Z')
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString()
  const h = (over: Record<string, unknown>) =>
    ({
      nickname: 'x',
      institution: 'y',
      accountType: 'savings',
      country: 'US',
      balanceUsd: 100,
      balanceInr: 0,
      isPfic: false,
      source: 'manual',
      ...over,
    }) as import('@/lib/portfolio').Holding

  it('is all zero for an empty ledger', () => {
    const m = freshnessMix([], 83, now)
    expect(m.shares).toEqual({ fresh: 0, aging: 0, stale: 0, estimated: 0 })
    expect(m.latest).toBeNull()
    expect(sharesToPercents(m.shares)).toEqual({ fresh: 0, aging: 0, stale: 0, estimated: 0 })
  })

  it('weights by |USD| across assets and debts, and the shares sum to 1', () => {
    const m = freshnessMix(
      [
        h({ balanceUsd: 600, lastSyncedAt: daysAgo(2) }),
        h({ balanceUsd: 200, lastSyncedAt: daysAgo(45) }),
        h({ balanceUsd: 100, lastSyncedAt: daysAgo(200), accountType: 'credit_card', kind: 'liability' }),
        h({ balanceUsd: 100 }), // no timestamp → stale
      ],
      83,
      now,
    )
    expect(m.shares.fresh).toBeCloseTo(0.6)
    expect(m.shares.aging).toBeCloseTo(0.2)
    expect(m.shares.stale).toBeCloseTo(0.2)
    expect(Object.values(m.shares).reduce((a, b) => a + b, 0)).toBeCloseTo(1)
    expect(m.staleCount).toBe(1)
    expect(m.unknownCount).toBe(1)
    expect(m.latest).toBe(daysAgo(2))
  })

  it('counts estimated holdings as Estimated regardless of age', () => {
    expect(confidenceBucket(h({ accountType: 'property', lastSyncedAt: daysAgo(1) }), now)).toBe('estimated')
    expect(confidenceBucket(h({ accountType: 'gold', lastSyncedAt: daysAgo(400) }), now)).toBe('estimated')
  })

  it('rounds to whole percents that always total 100', () => {
    const p = sharesToPercents({ fresh: 1 / 3, aging: 1 / 3, stale: 1 / 3, estimated: 0 })
    expect(p.fresh + p.aging + p.stale + p.estimated).toBe(100)
  })
})
