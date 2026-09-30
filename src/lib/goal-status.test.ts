import { describe, it, expect } from 'vitest'
import { goalStatus, projectFunded } from '@/lib/goal-status'
import type { Goal } from '@/lib/goals'

const YEAR = 2026
const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'g',
  name: 'College',
  category: 'education',
  targetUsd: 100_000,
  currentUsd: 0,
  targetYear: YEAR + 10,
  ...over,
})
const status = (g: Goal, r = 0.06) => goalStatus(g, [], 83, YEAR, r)

describe('goalStatus — reference cases', () => {
  it('$100k in 10 years at 6% with $610/month is On track', () => {
    const s = status(goal({ plannedMonthlyUsd: 610 }))
    expect(s.status).toBe('on_track')
    expect(s.projectedUsd).toBeGreaterThan(99_000)
    expect(s.projectedUsd).toBeLessThan(101_000)
  })

  it('the same goal at $400/month is Behind by about $210/month', () => {
    const s = status(goal({ plannedMonthlyUsd: 400 }))
    expect(s.status).toBe('behind')
    expect(s.monthlyGapUsd).toBeGreaterThan(205)
    expect(s.monthlyGapUsd).toBeLessThan(215)
  })

  it('uses the default 6% when no return is passed and there are no holdings', () => {
    expect(goalStatus(goal({ plannedMonthlyUsd: 610 }), [], 83, YEAR).status).toBe('on_track')
  })
})

describe('goalStatus — every status', () => {
  it('Reached when funded ≥ target, whatever the date', () => {
    expect(status(goal({ currentUsd: 100_000 })).status).toBe('reached')
    expect(status(goal({ currentUsd: 150_000, targetYear: 2000 })).status).toBe('reached')
  })

  it('Overdue when the target year has passed and it is not reached', () => {
    expect(status(goal({ currentUsd: 10, targetYear: YEAR - 1 })).status).toBe('overdue')
  })

  it('Ahead at ≥105% projected', () => {
    expect(status(goal({ plannedMonthlyUsd: 700 })).status).toBe('ahead')
  })

  it('without a plan, status uses savings only', () => {
    const s = status(goal({ currentUsd: 60_000 }))
    expect(s.hasPlan).toBe(false)
    expect(s.status).toBe('ahead') // 60k × 1.06^10-ish ≈ 109k
    expect(status(goal()).status).toBe('behind')
  })
})

describe('goalStatus — band edges', () => {
  // Zero return makes the projection exact: saved + planned × months.
  const edge = (projected: number) => status(goal({ currentUsd: projected, targetYear: YEAR + 1, targetUsd: 100_000 }), 0)
  it('95% exactly is On track; just under is Behind', () => {
    expect(edge(95_000).status).toBe('on_track')
    expect(edge(94_999).status).toBe('behind')
  })
  it('105% exactly is Ahead; just under is On track', () => {
    // Funded must stay below target, so reach 105% through contributions.
    const g = goal({ currentUsd: 99_000, plannedMonthlyUsd: 500, targetYear: YEAR + 1 })
    expect(status(g, 0).status).toBe('ahead') // 99k + 6k = 105k
    expect(status({ ...g, plannedMonthlyUsd: 499 }, 0).status).toBe('on_track')
  })
})

describe('goalStatus — zero return and this year', () => {
  it('zero return projects linearly', () => {
    expect(projectFunded(1_000, 100, 12, 0)).toBe(2_200)
    const s = status(goal({ plannedMonthlyUsd: 700 }), 0) // 84k of 100k
    expect(s.status).toBe('behind')
    expect(s.monthlyGapUsd).toBeCloseTo(100_000 / 120 - 700)
  })

  it('a target year equal to the current year projects today\'s savings with no monthly gap', () => {
    const s = status(goal({ currentUsd: 50_000, targetYear: YEAR, plannedMonthlyUsd: 1_000 }))
    expect(s.projectedUsd).toBe(50_000)
    expect(s.status).toBe('behind')
    expect(s.monthlyGapUsd).toBeNull()
  })
})
