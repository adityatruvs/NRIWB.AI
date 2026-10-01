import { describe, it, expect } from 'vitest'
import { monthlyContribution, STARTER_BUDGET } from '@/lib/budget'
import { budgetSchema, toBudget, MAX_CATEGORIES } from '@/lib/budget-api'
import { formatZodError } from '@/lib/accounts-api'

const cat = (over = {}) => ({ id: 'c1', label: 'Rent', amount: 1000, color: 'red', ...over })

describe('budgetSchema', () => {
  it('accepts a normal budget', () => {
    expect(budgetSchema.safeParse({ incomeUsd: 8000, categories: [cat()] }).success).toBe(true)
  })

  it.each([
    ['negative income', { incomeUsd: -1, categories: [] }, 'incomeUsd'],
    ['negative amount', { incomeUsd: 0, categories: [cat({ amount: -5 })] }, 'amount'],
    ['empty label', { incomeUsd: 0, categories: [cat({ label: '  ' })] }, 'label'],
    ['label over 60 chars', { incomeUsd: 0, categories: [cat({ label: 'x'.repeat(61) })] }, 'label'],
    [
      'too many categories',
      { incomeUsd: 0, categories: Array.from({ length: MAX_CATEGORIES + 1 }, (_, i) => cat({ id: `c${i}` })) },
      'categories',
    ],
  ])('rejects %s', (_l, body, field) => {
    const res = budgetSchema.safeParse(body)
    expect(res.success).toBe(false)
    if (!res.success) expect(formatZodError(res.error)).toContain(field)
  })
})

describe('monthlyContribution', () => {
  it('sums the invest lines only, ignoring negatives', () => {
    expect(
      monthlyContribution([
        { label: 'Investments', amount: 500 },
        { label: '401k invest', amount: 200 },
        { label: 'Rent', amount: 2000 },
        { label: 'Invest (bad)', amount: -50 },
      ]),
    ).toBe(700)
  })
})

describe('toBudget', () => {
  it('returns the starter template when nothing is stored', () => {
    expect(toBudget(null)).toEqual(STARTER_BUDGET)
  })
  it('keeps stored income and categories', () => {
    expect(toBudget({ incomeUsd: 9000, categories: [cat()] })).toEqual({ incomeUsd: 9000, categories: [cat()] })
  })
  it('falls back to starter categories when the stored JSON is corrupt', () => {
    expect(toBudget({ incomeUsd: 1, categories: 'nope' }).categories).toEqual(STARTER_BUDGET.categories)
  })
})
