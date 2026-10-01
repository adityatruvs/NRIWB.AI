import { describe, it, expect } from 'vitest'
import { ALL_GOAL_CATEGORIES, showsOwnAge } from '@/lib/goals'

// Regression: "Child's Education by 2035 · age 64" showed the parent's age.
describe('showsOwnAge', () => {
  it('hides the user’s age on education goals (the timeline is the child’s)', () => {
    expect(showsOwnAge('education')).toBe(false)
  })

  it('keeps it on every other goal type', () => {
    for (const c of ALL_GOAL_CATEGORIES.filter((c) => c !== 'education')) {
      expect(showsOwnAge(c), c).toBe(true)
    }
  })
})
