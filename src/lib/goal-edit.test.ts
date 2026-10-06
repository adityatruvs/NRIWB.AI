import { describe, it, expect } from 'vitest'
import { relativeYearShift, absoluteTargetYear, goalEditPatch, describePatch, type GoalNow } from '@/lib/goal-edit'

// Bug: "push my retirement out 5 years" on a 2046 / $2,000,000 goal came back as
// 2070–2076, $1,500,000 and a new name — the AI rebuilt the goal from scratch.
const WHEN = { currentYear: 2026, age: 25 } // 45 in 2046, as in the bug report
const RETIREMENT: GoalNow = { name: 'Retirement', category: 'retirement', kind: 'investment', targetUsd: 2_000_000, targetYear: 2046 }

describe('relativeYearShift', () => {
  it.each([
    ['push my retirement out 5 years', 5],
    ['delay it by two years', 2],
    ['3 years later', 3],
    ['postpone a year', 1],
    ['bring it forward 2 years', -2],
    ['make it 4 years earlier', -4],
    ['pull it in by one year', -1],
  ])('%s → %d', (text, n) => expect(relativeYearShift(text)).toBe(n))

  it('is null for absolute timing or no timing', () => {
    expect(relativeYearShift('make it 2050')).toBeNull()
    expect(relativeYearShift('rename it to Early retirement')).toBeNull()
    expect(relativeYearShift('wedding in 12 years')).toBeNull()
  })
})

describe('goalEditPatch', () => {
  it('moves only the year: 2046 + 5 = 2051, name and target untouched', () => {
    const { patch } = goalEditPatch(RETIREMENT, { yearsShift: 5 }, 'push my retirement out 5 years', 95, WHEN)
    expect(patch).toEqual({ targetYear: 2051 })
    expect(describePatch(RETIREMENT, patch)).toBe('Target year 2046 → 2051')
  })

  it('trusts the text over a year the model computed itself', () => {
    const { patch } = goalEditPatch(RETIREMENT, { targetYear: 2070 }, 'push my retirement out 5 years', 95, WHEN)
    expect(patch).toEqual({ targetYear: 2051 })
  })

  it('drops fields the model "changed" to their current value', () => {
    const { patch } = goalEditPatch(RETIREMENT, { name: 'Retirement', yearsShift: 5 }, 'push it out 5 years', 95, WHEN)
    expect(patch).toEqual({ targetYear: 2051 })
  })

  it('converts a new rupee target at the app rate', () => {
    const { patch, conversion } = goalEditPatch(RETIREMENT, { amount: 19_000_000, currency: 'INR' }, 'raise the target to ₹1.9 crore', 95, WHEN)
    expect(patch).toEqual({ targetUsd: 200_000 })
    expect(conversion).toBe('₹1.90Cr at ₹95.00/USD ≈ $200,000')
  })

  it('an absolute year from the model is used when the text has no relative shift', () => {
    expect(goalEditPatch(RETIREMENT, { targetYear: 2050 }, 'make it 2050', 95, WHEN).patch).toEqual({ targetYear: 2050 })
  })
})

describe('absoluteTargetYear', () => {
  it.each([
    ['make it 2050', 2050],
    ['retire by 2048 instead', 2048],
    ['when I turn 60', 2061],
    ['I want to retire at 55', 2056],
    ['in 12 years', 2038],
    ['twelve years from now', null], // words above ten aren't read; the model decides
    ['10 years from now', 2036],
  ])('%s → %s', (text, year) => expect(absoluteTargetYear(text, 2026, 25)).toBe(year))

  it("doesn't read someone else's age, an amount, or conflicting years", () => {
    expect(absoluteTargetYear('when my son turns 18', 2026, 25)).toBeNull()
    expect(absoluteTargetYear('save $2050 a month', 2026, 25)).toBeNull()
    expect(absoluteTargetYear('2040 or maybe 2045', 2026, 25)).toBeNull()
    expect(absoluteTargetYear('when I turn 60', 2026, null)).toBeNull() // age unknown
  })
})

describe('absolute years in an edit', () => {
  it('"make it 2050" sets 2050 whatever year the model said', () => {
    expect(goalEditPatch(RETIREMENT, { targetYear: 2070 }, 'make it 2050', 95, WHEN).patch).toEqual({ targetYear: 2050 })
  })

  it('"when I turn 60" uses the user\'s age: 2026 + (60 − 25) = 2061', () => {
    expect(goalEditPatch(RETIREMENT, { targetYear: 2070 }, 'when I turn 60', 95, WHEN).patch).toEqual({ targetYear: 2061 })
  })
})

// Review findings: the shift must belong to the verb, and "in" isn't "earlier".
describe('relativeYearShift — only the number the shift verb applies to', () => {
  it("ignores an age or other duration before the shift", () => {
    expect(relativeYearShift("I'm 35 years old, push retirement out 5 years")).toBe(5)
  })
  it('reads "move to India in 3 years" as a span from now, not a shift back', () => {
    expect(relativeYearShift('We plan to move to India in 3 years')).toBeNull()
    expect(absoluteTargetYear('We plan to move to India in 3 years', 2026, 25)).toBe(2029)
  })
  it('reads "10 years out" as a span from now', () => {
    expect(relativeYearShift('Set it to 10 years out')).toBeNull()
    expect(absoluteTargetYear('Set it to 10 years out', 2026, 25)).toBe(2036)
  })
  it('two different shifts are ambiguous', () => {
    expect(relativeYearShift('push it out 5 years, or maybe delay it by 2 years')).toBeNull()
  })
  it('reads a year at the end of a sentence', () => {
    expect(absoluteTargetYear('make it 2050.', 2026, 25)).toBe(2050)
    expect(absoluteTargetYear('by 2050, please', 2026, 25)).toBe(2050)
  })
})
