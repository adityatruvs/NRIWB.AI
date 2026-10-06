import { describe, it, expect } from 'vitest'
import { goalPlan, goalMonthlyNeeded, goalExpectedReturn, resolveGoal, type Goal } from '@/lib/goals'
import type { Holding } from '@/lib/portfolio'

// Bug: Goals showed the Emergency Fund (2027) at ~$1,380/mo for 1 year while
// Copilot said $486/mo over "~3 yrs". Both now read one plan, goalPlan.
const holdings: Holding[] = [
  { id: 'hysa', nickname: 'Ally', institution: 'Ally', accountType: 'savings', country: 'US', balanceUsd: 4_000, balanceInr: 0, isPfic: false, source: 'manual' },
]
const emergency: Goal = {
  id: 'e', name: 'Emergency Fund', category: 'emergency', targetUsd: 20_000, currentUsd: 0, targetYear: 2027,
  linkedAccountIds: ['hysa'],
}

describe('goalPlan', () => {
  it('is exactly what the goal card computes, for the year it is in', () => {
    const p = goalPlan(emergency, holdings, 95, 2026)
    const funded = resolveGoal(emergency, holdings, 95)
    const growth = goalExpectedReturn(emergency, holdings, 95)
    expect(p.yearsLeft).toBe(1) // not "~3 yrs"
    expect(p.goal.currentUsd).toBe(4_000)
    expect(p.monthly).toBe(goalMonthlyNeeded(funded, 2026, growth))
    expect(p.monthly).toBeGreaterThan(1_250) // ~$16,000 gap over 12 months, less a little growth
    expect(p.monthly).toBeLessThan(1_340)
    expect(p.reached).toBe(false)
    expect(p.onTrack).toBe(false)
  })
})
