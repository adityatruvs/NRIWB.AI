import { describe, it, expect } from 'vitest'
import { goalStatus, goalMonthsLeft, projectFunded, withinYearLabel } from '@/lib/goal-status'
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

describe('goalStatus — due this year, with an optional target month', () => {
  const OCT = 10
  const thisYear = (over: Partial<Goal> = {}) => goal({ targetYear: YEAR, currentUsd: 50_000, ...over })
  const at = (g: Goal, month = OCT) => goalStatus(g, [], 83, YEAR, 0.06, month)

  it('counts months to the deadline month, defaulting to December', () => {
    expect(goalMonthsLeft(thisYear(), YEAR, OCT)).toBe(2)
    expect(goalMonthsLeft(thisYear({ targetMonth: 3 }), YEAR, 1)).toBe(2)
    expect(goalMonthsLeft(goal(), YEAR, OCT)).toBe(120) // a future year is unchanged
  })

  it('is Behind but not Overdue, and reports the months left', () => {
    const s = at(thisYear())
    expect(s.status).toBe('behind')
    expect(s.monthsLeftThisYear).toBe(2)
  })

  it('shows a monthly gap now that months remain', () => {
    const s = at(thisYear({ plannedMonthlyUsd: 1_000 }))
    expect(s.monthlyGapUsd).toBeGreaterThan(0)
    // 2 months: need about (100k − 50k·growth)/2 minus the $1k planned.
    expect(s.monthlyGapUsd).toBeGreaterThan(23_000)
  })

  it('the due month itself is still within the year (0 months left)', () => {
    const s = at(thisYear({ targetMonth: OCT }))
    expect(s.status).toBe('behind')
    expect(s.monthsLeftThisYear).toBe(0)
    expect(s.monthlyGapUsd).toBeNull()
  })

  it('is Overdue once the deadline month has passed', () => {
    const s = at(thisYear({ targetMonth: 6 }))
    expect(s.status).toBe('overdue')
    expect(s.monthsLeftThisYear).toBeNull()
  })

  it('is Reached whatever the month, and a future year has no this-year note', () => {
    expect(at(thisYear({ currentUsd: 100_000, targetMonth: 2 })).status).toBe('reached')
    expect(at(goal()).monthsLeftThisYear).toBeNull()
  })

  it('words the label', () => {
    expect(withinYearLabel(3)).toBe('Within current year – 3 months left')
    expect(withinYearLabel(1)).toBe('Within current year – 1 month left')
    expect(withinYearLabel(0)).toBe('Within current year – due this month')
  })
})
