import { describe, it, expect } from 'vitest'
import { statedInrAmount, goalTarget } from '@/lib/goal-amount'

// Bug: "need about ₹1.2 crore" was filled as $14,400 — the model converted at its
// own ₹83 and slipped a factor of 10. The app now reads the rupees and converts.
const WEDDING = "Fund my daughter's wedding in India in 12 years, need about ₹1.2 crore"

describe('statedInrAmount', () => {
  it.each([
    [WEDDING, 12_000_000],
    ['house down payment of Rs. 50 lakh', 5_000_000],
    ['INR 3.5cr for a flat', 35_000_000],
    ['₹50L for my parents', 5_000_000],
    ['₹12,00,000 for a car in 3 years', 1_200_000],
    ['need 1.2 crores', 12_000_000],
  ])('%s → %d', (text, inr) => expect(statedInrAmount(text)).toBe(inr))

  it('ignores dollar amounts, years and ambiguous text', () => {
    expect(statedInrAmount('$150k for college in 10 years')).toBeNull()
    expect(statedInrAmount('retire at 60')).toBeNull()
    expect(statedInrAmount('₹50 lakh for a car and ₹1 crore for a flat')).toBeNull()
  })
})

describe('goalTarget', () => {
  it("converts the stated rupees at the app's rate, whatever the model returned", () => {
    expect(goalTarget(WEDDING, { amount: 1_440_000, currency: 'INR' }, 95)).toEqual({
      targetUsd: 126_316,
      conversion: '₹1.20Cr at ₹95.00/USD ≈ $126,316',
    })
    expect(goalTarget(WEDDING, { amount: 14_400, currency: 'USD' }, 95).targetUsd).toBe(126_316)
  })

  it("uses the model's rupee amount when the text has none it can read", () => {
    expect(goalTarget('wedding, about one crore', { amount: 10_000_000, currency: 'INR' }, 100).targetUsd).toBe(100_000)
  })

  it('keeps a dollar amount as is, with no conversion line', () => {
    expect(goalTarget('$150k for college', { amount: 150_000, currency: 'USD' }, 95)).toEqual({
      targetUsd: 150_000,
      conversion: null,
    })
  })
})

// Review findings: a rupee aside must not replace a dollar target.
describe('a dollar target with a rupee aside', () => {
  it('keeps the dollar amount the model read', () => {
    const d = 'Retirement corpus of $2M; I already have ₹50 lakh in EPF'
    expect(goalTarget(d, { amount: 2_000_000, currency: 'USD' }, 95)).toEqual({ targetUsd: 2_000_000, conversion: null })
  })
  it('still fixes a model that converted rupees itself when the text has no dollar amount', () => {
    expect(goalTarget(WEDDING, { amount: 14_400, currency: 'USD' }, 95).targetUsd).toBe(126_316)
  })
  it('reads a rupee amount at the end of a sentence', () => {
    expect(statedInrAmount('Budget is ₹1,20,00,000.')).toBe(12_000_000)
  })
})
