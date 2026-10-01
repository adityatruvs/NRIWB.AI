import { describe, it, expect } from 'vitest'
import { goalMonthlyNeeded, onTrackOnSavings, type Goal } from '@/lib/goals'

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'g',
  name: 'Retirement',
  category: 'retirement',
  targetUsd: 2_000_000,
  currentUsd: 1_020_000,
  targetYear: 2041,
  ...over,
})

// Regression: the ticket's example — $1.02M at 6% for 15 years clears $2M, so the
// card showed "~$0/mo for 15 years". It now says "on track" instead.
describe('onTrackOnSavings', () => {
  it('is true when savings alone grow past the target (the "$0/mo" case)', () => {
    expect(goalMonthlyNeeded(goal(), 2026, 0.06)).toBe(0)
    expect(onTrackOnSavings(goal(), 2026, 0.06)).toBe(true)
  })

  it('is false when contributions are still needed', () => {
    expect(onTrackOnSavings(goal({ currentUsd: 400_000 }), 2026, 0.06)).toBe(false)
  })

  it('is false once the goal is reached or its year has passed (those have their own message)', () => {
    expect(onTrackOnSavings(goal({ currentUsd: 2_000_000 }), 2026, 0.06)).toBe(false)
    expect(onTrackOnSavings(goal({ targetYear: 2026 }), 2026, 0.06)).toBe(false)
  })

  it('treats a need under $1/mo (which would display as "$0") as on track', () => {
    // Savings that grow to $100 short of the target → a need of ~$0.34/mo.
    const growth = Math.pow(1 + 0.06 / 12, 15 * 12)
    const g = goal({ currentUsd: (2_000_000 - 100) / growth })
    const need = goalMonthlyNeeded(g, 2026, 0.06)
    expect(need).toBeGreaterThan(0)
    expect(need).toBeLessThan(1)
    expect(onTrackOnSavings(g, 2026, 0.06)).toBe(true)
  })
})
