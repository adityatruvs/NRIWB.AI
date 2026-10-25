import { describe, it, expect } from 'vitest'
import {
  blankLine,
  formatAmountInput,
  holdingChoice,
  lineMissing,
  lineToHolding,
  missingCounts,
  parseAmountInput,
  readAmount,
  nameError,
  NAME_MAX,
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
    expect(lineMissing(line({ amount: 0 }))).toEqual([]) // zero is an answer (a paid-off card), blank is not
    expect(lineMissing(line({ amount: -5 }))).toEqual(['amount']) // negatives never get in
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
    expect(missingCounts(lines)).toEqual({ type: 3, amount: 1, name: 0 })
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

describe('amount rules (shared by quick entry, the Add account form and the sheet)', () => {
  const value = (t: string) => {
    const r = readAmount(t)
    return r.ok ? r.value : `ERR: ${r.error}`
  }

  it.each([
    ['40L', 4_000_000],
    ['1.2Cr', 12_000_000],
    ['95k', 95_000],
    ['1.5M', 1_500_000],
    ['1.5m', 1_500_000],
    ['2 million', 2_000_000],
    ['5,00,000', 500_000],
    ['₹ 8 lakh', 800_000],
    ['$95,000', 95_000],
    ['12.34', 12.34],
    ['0.5k', 500],
    ['.5', 0.5],
    ['5.', 5],
  ])('accepts %s', (text, expected) => expect(value(text)).toBe(expected))

  it('zero is allowed', () => {
    expect(value('0')).toBe(0)
    expect(value('0.00')).toBe(0)
    expect(value('$0')).toBe(0)
  })

  it('blank is no amount, not an error', () => {
    expect(value('')).toBeNull()
    expect(value('   ')).toBeNull()
  })

  it.each(['-500', '−500', '–500', '-$500', '$-500', '-5k', '(500)', '-0'])('rejects the negative %s and says to enter what you owe as positive', (text) => {
    expect(value(text)).toMatch(/can’t be negative.*positive/)
  })

  it.each(['1.234', '0.001', '1.005', '12.345678k'])('rejects more than 2 decimals: %s', (text) => {
    expect(value(text)).toBe('ERR: Use at most 2 decimal places.')
  })

  it('counts decimals after the unit is applied, so 1.2345L (₹1,23,450) is fine', () => {
    expect(value('1.2345L')).toBe(123_450)
    expect(value('0.125k')).toBe(125)
  })

  it('does not drift on floating point: 0.1 + units, 1.15Cr, 19.99k', () => {
    expect(value('1.15Cr')).toBe(11_500_000)
    expect(value('19.99k')).toBe(19_990)
    expect(value('0.07')).toBe(0.07)
  })

  it.each(['abc', '12 apples', '1e5', '1,2,x', '4..5', '40LL', 'k', '5constructor', '5__proto__', '5tostring', '0x10', '1/2'])(
    'says how to type it when %s cannot be read',
    (text) => expect(value(text)).toBe('ERR: Use numbers, or 40L / 1.2Cr / 95k / 1.5M'),
  )

  it('refuses an absurdly large amount instead of saving Infinity', () => {
    expect(value('99999999999Cr')).toBe('ERR: That amount is too large.')
    expect(value('9'.repeat(400))).toBe('ERR: That amount is too large.')
  })

  it('parseAmountInput stays a plain number for callers that only want the value', () => {
    expect(parseAmountInput('40L')).toBe(4_000_000)
    expect(parseAmountInput('')).toBeNull()
    expect(parseAmountInput('-5')).toBeNaN()
  })
})

describe('name rule', () => {
  it(`allows ${NAME_MAX} characters and says how far over otherwise`, () => {
    expect(nameError('a'.repeat(NAME_MAX))).toBeNull()
    expect(nameError('')).toBeNull() // blank names fall back to the bank / type when saved
    expect(nameError('a'.repeat(NAME_MAX + 1))).toBe('Names can be up to 60 characters. This one is 61.')
  })
  it('ignores spaces at either end, as saving does', () => {
    expect(nameError(`  ${'a'.repeat(NAME_MAX)}  `)).toBeNull()
  })
  it('a long name holds back the whole list and is counted', () => {
    const long = line({ name: 'x'.repeat(61) })
    expect(readyToSave([line({}), long])).toBe(false)
    expect(missingCounts([line({}), long])).toEqual({ type: 0, amount: 0, name: 1 })
  })
})
