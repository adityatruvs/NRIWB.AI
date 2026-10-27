import { describe, it, expect } from 'vitest'
import {
  blankLine,
  formatAmountInput,
  holdingChoice,
  lineMissing,
  lineToHolding,
  missingCounts,
  parseAmountInput,
  placeLine,
  readyToSave,
  retypeHolding,
  retypeLine,
  type DraftLine,
} from '@/lib/quick-entry'
import { typeChoicesFor } from '@/lib/account-details'
import type { Holding } from '@/lib/portfolio'

const RATE = 95

const line = (over: Partial<DraftLine>): DraftLine => ({
  id: 'l1',
  country: 'IN',
  kind: 'asset',
  type: 'nre',
  name: 'HDFC NRE',
  institution: 'HDFC Bank',
  amount: 500000,
  currency: 'INR',
  ...over,
})

describe('typed amounts', () => {
  it('reads lakh, crore, k and grouped numbers', () => {
    expect(parseAmountInput('40L')).toBe(4_000_000)
    expect(parseAmountInput('1.2 Cr')).toBe(12_000_000)
    expect(parseAmountInput('95k')).toBe(95_000)
    expect(parseAmountInput('5,00,000')).toBe(500_000)
    expect(parseAmountInput('$1.5m')).toBe(1_500_000)
    expect(parseAmountInput('₹ 8 lakh')).toBe(800_000)
    expect(parseAmountInput('Rs. 2500')).toBe(2500)
  })

  it('blank is null; nonsense is NaN', () => {
    expect(parseAmountInput('  ')).toBeNull()
    expect(parseAmountInput('abc')).toBeNaN()
    expect(parseAmountInput('12 apples')).toBeNaN()
  })

  it('shows amounts grouped the way their currency is written', () => {
    expect(formatAmountInput(500000, 'INR')).toBe('5,00,000')
    expect(formatAmountInput(95000, 'USD')).toBe('95,000')
    expect(formatAmountInput(null, 'USD')).toBe('')
  })
})

// Story: nothing is saved until every line has a type and an amount.
describe('a line is ready only with a place, a type and an amount', () => {
  it('lists what each line still needs', () => {
    expect(lineMissing(line({}))).toEqual([])
    expect(lineMissing(line({ type: null }))).toEqual(['type'])
    expect(lineMissing(line({ amount: null }))).toEqual(['amount'])
    expect(lineMissing(line({ amount: 0 }))).toEqual(['amount'])
    expect(lineMissing(line({ country: null, type: null, amount: null }))).toEqual(['where', 'type', 'amount'])
  })

  it('the list saves only when every line is complete', () => {
    const done = line({})
    expect(readyToSave([done])).toBe(true)
    expect(readyToSave([done, line({ id: 'l2', type: null })])).toBe(false)
    expect(readyToSave([done, line({ id: 'l2', amount: null })])).toBe(false)
    expect(readyToSave([])).toBe(false)
  })

  it('counts lines that need a type and lines that need an amount', () => {
    const lines = [line({}), line({ id: 'a', type: null }), line({ id: 'b', type: null, amount: null }), line({ id: 'c', country: null })]
    expect(missingCounts(lines)).toEqual({ type: 3, amount: 1 })
  })

  it('refuses to turn an incomplete line into an account', () => {
    expect(() => lineToHolding(line({ type: null }), RATE)).toThrow()
    expect(() => lineToHolding(line({ amount: null }), RATE)).toThrow()
  })
})

describe('saving a line', () => {
  it('an India rupee line stores both balances at the live rate', () => {
    const h = lineToHolding(line({}), RATE)
    expect(h).toMatchObject({ accountType: 'nre', country: 'IN', kind: 'asset', source: 'manual', balanceInr: 500000 })
    expect(h.balanceUsd).toBeCloseTo(500000 / RATE)
  })

  it('an amount said in dollars keeps its dollars, even for India', () => {
    const h = lineToHolding(line({ type: 'fcnr', amount: 25000, currency: 'USD' }), RATE)
    expect(h.balanceUsd).toBe(25000)
    expect(h.balanceInr).toBe(25000 * RATE)
    expect(h.details?.depositCurrency).toBe('USD')
  })

  it('an NRE FD pick saves as an fd with its scheme', () => {
    const h = lineToHolding(line({ type: 'fd_nre', interestRate: 7 }), RATE)
    expect(h.accountType).toBe('fd')
    expect(h.details).toMatchObject({ fdScheme: 'NRE', interestRate: 7 })
  })

  it('a loan saves as a liability with its payment; an India fund is a PFIC', () => {
    const loan = lineToHolding(line({ kind: 'liability', type: 'home_loan', amount: 8_000_000, minPayment: 70000 }), RATE)
    expect(loan.kind).toBe('liability')
    expect(loan.details?.minPayment).toBe(70000)
    expect(lineToHolding(line({ type: 'mutual_fund' }), RATE).isPfic).toBe(true)
  })

  it('drops details the type does not have', () => {
    const h = lineToHolding(line({ type: 'property', interestRate: 7, maturityDate: '2030-01-01' }), RATE)
    expect(h.details).toBeUndefined()
  })

  it('needs an institution: a flat with none uses its name', () => {
    const h = lineToHolding(line({ type: 'property', name: 'Flat in Hyderabad', institution: '' }), RATE)
    expect(h.institution).toBe('Flat in Hyderabad')
  })
})

describe('editing lines', () => {
  it('an empty line follows its new type’s currency; a typed amount keeps its own', () => {
    expect(retypeLine(line({ amount: null }), 'fcnr').currency).toBe('USD')
    expect(retypeLine(line({ amount: 500000 }), 'fcnr').currency).toBe('INR')
    expect(retypeLine(line({ type: null, hint: 'savings' }), 'nro')).toMatchObject({ type: 'nro', hint: undefined })
  })

  it('placing a line clears a type that doesn’t exist there', () => {
    const l = line({ country: null, type: 'credit_card', kind: 'liability', amount: null })
    expect(placeLine(l, 'US', 'liability')).toMatchObject({ country: 'US', type: 'credit_card', currency: 'USD' })
    expect(placeLine(line({ country: null, type: 'nre' }), 'US', 'asset').type).toBeNull()
  })

  it('a tile adds a blank line with that type', () => {
    expect(blankLine('US', 'asset', '401k', '401(k)')).toMatchObject({ country: 'US', type: '401k', amount: null, currency: 'USD' })
  })
})

describe('inline edits on saved accounts', () => {
  const saved: Holding = {
    id: 'h1',
    nickname: 'SBI deposit',
    institution: 'SBI',
    accountType: 'nre',
    country: 'IN',
    balanceUsd: 10000,
    balanceInr: 950000,
    isPfic: false,
    source: 'manual',
    kind: 'asset',
    details: { interestRate: 3.5 },
  }

  it('re-typing keeps the balances and moves the scheme', () => {
    const h = retypeHolding(saved, 'fd_nro')
    expect(h).toMatchObject({ accountType: 'fd', balanceUsd: 10000, balanceInr: 950000 })
    expect(h.details).toEqual({ interestRate: 3.5, fdScheme: 'NRO' })
    expect(holdingChoice(h)).toBe('fd_nro')
  })

  it('re-typing drops details the new type lacks and sets the PFIC flag', () => {
    const h = retypeHolding(saved, 'mutual_fund')
    expect(h.details).toBeUndefined()
    expect(h.isPfic).toBe(true)
  })

  it('the sheet offers asset types for assets and debt types for debts', () => {
    expect(typeChoicesFor('IN', 'asset')).toContain('fd_nre')
    expect(typeChoicesFor('IN', 'liability')).toContain('home_loan')
    expect(typeChoicesFor('US', 'liability')).not.toContain('home_loan')
  })
})
