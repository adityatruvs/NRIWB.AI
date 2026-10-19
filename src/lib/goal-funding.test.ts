import { describe, it, expect } from 'vitest'
import { isGoalFundingAccount, type Holding } from '@/lib/portfolio'
import { goalLinkedUsd, resolveGoal, type Goal } from '@/lib/goals'

// Bug: "Fund from accounts" offered loans, a credit card, the Honda Accord and the
// Hyderabad flat. A goal draws on cash, deposits and investments only.
const h = (over: Partial<Holding>): Holding => ({
  nickname: 'x',
  institution: 'y',
  accountType: 'savings',
  country: 'US',
  balanceUsd: 0,
  balanceInr: 0,
  isPfic: false,
  source: 'manual',
  ...over,
})

describe('which accounts can fund a goal', () => {
  it.each(['checking', 'savings', 'cd', 'brokerage', '401k', 'nre', 'fd', 'mutual_fund', 'gold'] as const)(
    '%s can',
    (accountType) => expect(isGoalFundingAccount(h({ accountType }))).toBe(true),
  )
  it.each(['property', 'real_estate', 'vehicle', 'notes_receivable', 'other', 'education_loan', 'credit_card', 'mortgage'] as const)(
    '%s cannot',
    (accountType) => expect(isGoalFundingAccount(h({ accountType }))).toBe(false),
  )
})

describe('a goal saved with an old link to a loan or the flat', () => {
  const holdings = [
    h({ id: 'save', balanceUsd: 20_000 }),
    h({ id: 'loan', accountType: 'education_loan', kind: 'liability', balanceUsd: 10_526 }),
    h({ id: 'flat', accountType: 'property', country: 'IN', balanceInr: 12_000_000 }),
  ]
  const goal: Goal = {
    id: 'g', name: 'Wedding', category: 'other', targetUsd: 100_000, currentUsd: 0, targetYear: 2038,
    linkedAccountIds: ['save', 'loan', 'flat'],
  }

  it('counts only the savings account toward it', () => {
    expect(goalLinkedUsd(goal, holdings, 95)).toBe(20_000)
    expect(resolveGoal(goal, holdings, 95).currentUsd).toBe(20_000)
  })

  it("a goal linked only to accounts that can't fund it falls back to the amount entered by hand", () => {
    const onlyLoan: Goal = { ...goal, currentUsd: 7_500, linkedAccountIds: ['loan', 'flat'] }
    expect(resolveGoal(onlyLoan, holdings, 95).currentUsd).toBe(7_500)
  })
})
