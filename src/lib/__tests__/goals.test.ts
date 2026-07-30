import { describe, expect, it } from 'vitest'
import {
  isGoalLinked,
  goalLinkedUsd,
  resolveGoal,
  goalKind,
  defaultGoalKind,
  goalAccent,
  goalProgress,
  goalRemaining,
  goalMonthlyNeeded,
  type Goal,
} from '@/lib/goals'
import type { Holding } from '@/lib/portfolio'

const HARDCODED_FX_RATE = 95

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    name: 'Test Goal',
    category: 'other',
    targetUsd: 100_000,
    currentUsd: 0,
    targetYear: 2040,
    ...overrides,
  }
}

function makeHolding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: 'h1',
    nickname: 'Test Account',
    institution: 'Test Bank',
    accountType: 'checking',
    country: 'US',
    balanceUsd: 1000,
    balanceInr: 0,
    isPfic: false,
    source: 'manual',
    ...overrides,
  }
}

describe('isGoalLinked', () => {
  it('is false when linkedAccountIds is absent', () => {
    expect(isGoalLinked(makeGoal())).toBe(false)
  })

  it('is false when linkedAccountIds is an empty array', () => {
    expect(isGoalLinked(makeGoal({ linkedAccountIds: [] }))).toBe(false)
  })

  it('is true when at least one account id is linked', () => {
    expect(isGoalLinked(makeGoal({ linkedAccountIds: ['h1'] }))).toBe(true)
  })
})

describe('goalLinkedUsd', () => {
  it('returns 0 when the goal has no linked accounts', () => {
    expect(goalLinkedUsd(makeGoal(), [makeHolding()], HARDCODED_FX_RATE)).toBe(0)
  })

  it('sums the USD value of only the linked holdings', () => {
    const goal = makeGoal({ linkedAccountIds: ['a', 'c'] })
    const holdings: Holding[] = [
      makeHolding({ id: 'a', balanceUsd: 1_000 }),
      makeHolding({ id: 'b', balanceUsd: 5_000 }), // not linked, excluded
      makeHolding({ id: 'c', balanceUsd: 2_000 }),
    ]
    expect(goalLinkedUsd(goal, holdings, HARDCODED_FX_RATE)).toBe(3_000)
  })

  it('nets a linked liability against a linked asset (usdValue is signed)', () => {
    const goal = makeGoal({ linkedAccountIds: ['asset', 'debt'] })
    const holdings: Holding[] = [
      makeHolding({ id: 'asset', accountType: 'brokerage', balanceUsd: 10_000 }),
      makeHolding({ id: 'debt', accountType: 'credit_card', balanceUsd: 3_000 }),
    ]
    expect(goalLinkedUsd(goal, holdings, HARDCODED_FX_RATE)).toBe(7_000)
  })

  it('ignores linked ids that no longer match any holding', () => {
    const goal = makeGoal({ linkedAccountIds: ['missing'] })
    expect(goalLinkedUsd(goal, [makeHolding({ id: 'a' })], HARDCODED_FX_RATE)).toBe(0)
  })
})

describe('resolveGoal', () => {
  it('returns the goal unchanged when it is not linked', () => {
    const goal = makeGoal({ currentUsd: 500 })
    expect(resolveGoal(goal, [makeHolding()], HARDCODED_FX_RATE)).toEqual(goal)
  })

  it('overrides currentUsd with the live linked-account total when linked', () => {
    const goal = makeGoal({ currentUsd: 500, linkedAccountIds: ['a'] })
    const holdings: Holding[] = [makeHolding({ id: 'a', balanceUsd: 9_000 })]
    const resolved = resolveGoal(goal, holdings, HARDCODED_FX_RATE)
    expect(resolved.currentUsd).toBe(9_000)
    expect(resolved.id).toBe(goal.id) // identity/other fields preserved
  })
})

describe('goalKind', () => {
  it('uses the explicit override when set', () => {
    expect(goalKind(makeGoal({ category: 'education', kind: 'investment' }))).toBe('investment')
  })

  it('falls back to the category default when no override is set', () => {
    expect(goalKind(makeGoal({ category: 'education' }))).toBe('cost')
    expect(goalKind(makeGoal({ category: 'retirement' }))).toBe('investment')
  })
})

describe('defaultGoalKind', () => {
  it('matches the documented defaults per category', () => {
    expect(defaultGoalKind('retirement')).toBe('investment')
    expect(defaultGoalKind('education')).toBe('cost')
    expect(defaultGoalKind('property')).toBe('investment')
    expect(defaultGoalKind('travel')).toBe('cost')
    expect(defaultGoalKind('emergency')).toBe('investment')
    expect(defaultGoalKind('other')).toBe('cost')
  })
})

describe('goalAccent', () => {
  it('returns a defined accent colour for every category', () => {
    const categories: Goal['category'][] = ['retirement', 'education', 'property', 'travel', 'emergency', 'other']
    for (const category of categories) {
      expect(goalAccent(makeGoal({ category }))).toBeTruthy()
    }
  })
})

describe('goalProgress', () => {
  it('returns 0 for a goal with no progress', () => {
    expect(goalProgress(makeGoal({ targetUsd: 1_000, currentUsd: 0 }))).toBe(0)
  })

  it('returns a fraction between 0 and 1 for partial progress', () => {
    expect(goalProgress(makeGoal({ targetUsd: 1_000, currentUsd: 250 }))).toBe(0.25)
  })

  it('clamps to 1 when currentUsd exceeds targetUsd', () => {
    expect(goalProgress(makeGoal({ targetUsd: 1_000, currentUsd: 5_000 }))).toBe(1)
  })

  it('returns 0 when targetUsd is 0 (avoids divide-by-zero)', () => {
    expect(goalProgress(makeGoal({ targetUsd: 0, currentUsd: 500 }))).toBe(0)
  })

  it('returns 0 when targetUsd is negative', () => {
    expect(goalProgress(makeGoal({ targetUsd: -1_000, currentUsd: 500 }))).toBe(0)
  })

  it('clamps to 0 when currentUsd is negative', () => {
    expect(goalProgress(makeGoal({ targetUsd: 1_000, currentUsd: -500 }))).toBe(0)
  })
})

describe('goalRemaining', () => {
  it('returns the gap between target and current', () => {
    expect(goalRemaining(makeGoal({ targetUsd: 1_000, currentUsd: 400 }))).toBe(600)
  })

  it('never goes negative once the goal is exceeded', () => {
    expect(goalRemaining(makeGoal({ targetUsd: 1_000, currentUsd: 5_000 }))).toBe(0)
  })

  it('returns 0 for an already-fully-funded goal', () => {
    expect(goalRemaining(makeGoal({ targetUsd: 1_000, currentUsd: 1_000 }))).toBe(0)
  })
})

describe('goalMonthlyNeeded', () => {
  it('returns 0 once the target year has already passed', () => {
    const goal = makeGoal({ targetYear: 2020 })
    expect(goalMonthlyNeeded(goal, 2026)).toBe(0)
  })

  it('returns 0 when the target year is the current year (0 months left)', () => {
    const goal = makeGoal({ targetYear: 2026 })
    expect(goalMonthlyNeeded(goal, 2026)).toBe(0)
  })

  it('returns 0 when existing savings will already grow past the target', () => {
    const goal = makeGoal({ targetUsd: 100_000, currentUsd: 95_000, targetYear: 2027 })
    // 95,000 at 6%/yr for 1 year ~= 100,700, already over target.
    expect(goalMonthlyNeeded(goal, 2026)).toBe(0)
  })

  it('matches a manual annuity-payment calculation for a normal case', () => {
    const goal = makeGoal({ targetUsd: 50_000, currentUsd: 0, targetYear: 2030 })
    const annualReturn = 0.06
    const months = (2030 - 2026) * 12
    const r = annualReturn / 12
    const grown = 0 * Math.pow(1 + r, months)
    const gap = goal.targetUsd - grown
    const annuityFactor = (Math.pow(1 + r, months) - 1) / r
    const expected = gap / annuityFactor
    expect(goalMonthlyNeeded(goal, 2026, annualReturn)).toBeCloseTo(expected, 6)
  })

  it('falls back to straight-line division when annualReturn is 0', () => {
    const goal = makeGoal({ targetUsd: 12_000, currentUsd: 0, targetYear: 2027 })
    const months = 12
    expect(goalMonthlyNeeded(goal, 2026, 0)).toBeCloseTo(12_000 / months, 6)
  })

  it('credits existing savings growth, reducing the monthly amount needed', () => {
    const noSavings = makeGoal({ targetUsd: 50_000, currentUsd: 0, targetYear: 2030 })
    const withSavings = makeGoal({ targetUsd: 50_000, currentUsd: 20_000, targetYear: 2030 })
    expect(goalMonthlyNeeded(withSavings, 2026)).toBeLessThan(goalMonthlyNeeded(noSavings, 2026))
  })

  it('uses the default 6% annual return when none is supplied', () => {
    const goal = makeGoal({ targetUsd: 50_000, currentUsd: 0, targetYear: 2030 })
    expect(goalMonthlyNeeded(goal, 2026)).toBeCloseTo(goalMonthlyNeeded(goal, 2026, 0.06), 6)
  })
})
