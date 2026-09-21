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
