import { describe, expect, it } from 'vitest'
import { formatUSD, formatINR, formatLakhs, toINR, toUSD, formatAmount } from '@/lib/currency'

// PLACEHOLDER-BEHAVIOR: every `rate` used below is a plain number passed in by the
// caller. In the running app today this is always the app's hardcoded FX_RATE
// (95, in src/context/CurrencyContext.tsx) — there is no live FX provider wired
// up yet (see prisma's unused FxRate model + the "Replaced by ExchangeRate-API"
// comment in that file). These tests validate the conversion/formatting MATH is
// correct for whatever rate is supplied; they do not assert that 95 (or any other
// value) is a correct *live* USD/INR rate. When a live FX integration lands, this
// file's rate constants are the ones to revisit.
const HARDCODED_FX_RATE = 95
const SEED_FX_RATE = 83.5

describe('formatUSD', () => {
  it('formats a whole dollar amount with no decimals', () => {
    expect(formatUSD(1000)).toBe('$1,000')
  })

  it('rounds to the nearest dollar (maximumFractionDigits: 0)', () => {
    expect(formatUSD(1234.56)).toBe('$1,235')
    expect(formatUSD(1234.49)).toBe('$1,234')
  })

  it('formats zero', () => {
    expect(formatUSD(0)).toBe('$0')
  })

  it('formats a negative amount', () => {
    expect(formatUSD(-500)).toBe('-$500')
  })

  it('formats large amounts with thousands separators', () => {
    expect(formatUSD(1_250_000)).toBe('$1,250,000')
  })
})

describe('formatINR', () => {
  it('formats a whole rupee amount using Indian digit grouping', () => {
    expect(formatINR(100_000)).toBe('₹1,00,000')
  })

  it('formats zero', () => {
    expect(formatINR(0)).toBe('₹0')
  })

  it('formats a negative amount', () => {
    expect(formatINR(-500)).toBe('-₹500')
  })
})

describe('formatLakhs', () => {
  it('formats amounts under 1 lakh as plain INR', () => {
    expect(formatLakhs(50_000)).toBe(formatINR(50_000))
  })

  it('formats exactly 1 lakh as lakhs, not plain INR (boundary is inclusive)', () => {
    expect(formatLakhs(100_000)).toBe('₹1.00L')
  })

  it('formats amounts between 1 lakh and 1 crore as lakhs', () => {
    expect(formatLakhs(4_500_000)).toBe('₹45.00L')
  })

  it('formats exactly 1 crore as crores, not lakhs (boundary is inclusive)', () => {
    expect(formatLakhs(10_000_000)).toBe('₹1.00Cr')
  })

  it('formats amounts at or above 1 crore as crores', () => {
    expect(formatLakhs(25_000_000)).toBe('₹2.50Cr')
  })

  it('formats zero as plain INR', () => {
    expect(formatLakhs(0)).toBe('₹0')
  })

  it('formats just under the 1-lakh boundary as plain INR', () => {
    expect(formatLakhs(99_999)).toBe(formatINR(99_999))
  })

  it('formats just under the 1-crore boundary as lakhs', () => {
    expect(formatLakhs(9_999_999)).toBe('₹100.00L')
  })
})

describe('toINR / toUSD', () => {
  it('toINR multiplies USD by the rate', () => {
    expect(toINR(100, SEED_FX_RATE)).toBeCloseTo(8_350, 6)
  })

  it('toUSD divides INR by the rate', () => {
    expect(toUSD(8_350, SEED_FX_RATE)).toBeCloseTo(100, 6)
  })

  it('toINR and toUSD are inverses of each other for a given rate', () => {
    const usd = 12_345.67
    expect(toUSD(toINR(usd, HARDCODED_FX_RATE), HARDCODED_FX_RATE)).toBeCloseTo(usd, 6)
  })

  it('toINR of zero is zero', () => {
    expect(toINR(0, HARDCODED_FX_RATE)).toBe(0)
  })

  it('toUSD of zero is zero', () => {
    expect(toUSD(0, HARDCODED_FX_RATE)).toBe(0)
  })

  it('toINR handles a negative USD amount (e.g. a liability) by scaling the sign through', () => {
    expect(toINR(-100, SEED_FX_RATE)).toBeCloseTo(-8_350, 6)
  })

  // PLACEHOLDER-BEHAVIOR: documents current (undefended) behavior at rate=0. Not a
  // spec — a live FX rate should never legitimately be 0.
  it('BUG-DOCUMENTING: toUSD at rate=0 produces Infinity/NaN rather than throwing', () => {
    expect(toUSD(100, 0)).toBe(Infinity)
    expect(toUSD(0, 0)).toBeNaN()
  })
})

describe('formatAmount', () => {
  it('mode "usd" ignores the rate and formats the USD figure directly', () => {
    expect(formatAmount(1000, 'usd', SEED_FX_RATE)).toBe(formatUSD(1000))
    expect(formatAmount(1000, 'usd', HARDCODED_FX_RATE)).toBe(formatUSD(1000))
  })

  it('mode "inr" converts at the given rate then formats as INR', () => {
    expect(formatAmount(100, 'inr', SEED_FX_RATE)).toBe(formatINR(8_350))
  })

  it('mode "inr_lakhs" converts at the given rate then formats as lakhs/crores', () => {
    expect(formatAmount(53_892.22, 'inr_lakhs', SEED_FX_RATE)).toBe(formatLakhs(53_892.22 * SEED_FX_RATE))
  })

  it('mode "inr_lakhs" for a small amount falls through to plain INR formatting', () => {
    expect(formatAmount(10, 'inr_lakhs', SEED_FX_RATE)).toBe(formatINR(10 * SEED_FX_RATE))
  })

  it('formats zero consistently across all three modes', () => {
    expect(formatAmount(0, 'usd', HARDCODED_FX_RATE)).toBe('$0')
    expect(formatAmount(0, 'inr', HARDCODED_FX_RATE)).toBe('₹0')
    expect(formatAmount(0, 'inr_lakhs', HARDCODED_FX_RATE)).toBe('₹0')
  })
})
