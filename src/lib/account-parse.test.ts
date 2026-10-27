import { describe, it, expect } from 'vitest'
import { MAX_LINES, buildParseSystem, linesFromModel, parseJsonObject } from '@/lib/account-parse'
import { typeChoicesFor } from '@/lib/account-details'

// Story: what I said is turned into one line per account, so I only have to check it.
describe('reading what was said into lines', () => {
  it('one element per account — "two accounts at HDFC" is two lines, with no guessed type', () => {
    const lines = linesFromModel({
      accounts: [
        { group: 'IN_asset', type: null, institution: 'HDFC Bank', name: 'HDFC Bank account 1', amount: null, currency: 'INR', said: 'Two accounts at HDFC' },
        { group: 'IN_asset', type: null, institution: 'HDFC Bank', name: 'HDFC Bank account 2', amount: null, currency: 'INR', said: 'Two accounts at HDFC' },
        { group: 'IN_asset', type: 'fd_nre', institution: 'Axis Bank', name: 'Axis Bank NRE Fixed Deposit', amount: 500000, currency: 'INR' },
        { group: 'US_asset', type: 'brokerage', institution: 'Charles Schwab', name: 'Charles Schwab Brokerage', amount: 95000, currency: 'USD' },
      ],
    })
    expect(lines).toHaveLength(4)
    expect(lines.map((l) => l.type)).toEqual([null, null, 'fd_nre', 'brokerage'])
    expect(lines[0]).toMatchObject({ country: 'IN', kind: 'asset', amount: null, currency: 'INR', hint: 'savings' })
    expect(lines[2]).toMatchObject({ amount: 500000, currency: 'INR' })
    expect(lines[3]).toMatchObject({ country: 'US', amount: 95000, currency: 'USD' })
    expect(new Set(lines.map((l) => l.id)).size).toBe(4)
  })

  it('drops a type that isn’t allowed in its group, and an invented one', () => {
    const lines = linesFromModel({
      accounts: [
        { group: 'US_asset', type: 'nre', name: 'Chase' },
        { group: 'IN_asset', type: 'crypto_wallet', name: 'Wallet' },
        { group: 'IN_liability', type: 'mortgage', name: 'Loan' },
      ],
    })
    expect(lines.map((l) => l.type)).toEqual([null, null, null])
  })

  it('no country: a type only India has places it; a shared type leaves it for the user', () => {
    const [nre, card] = linesFromModel({
      accounts: [
        { group: 'unknown', type: 'nre', name: 'Some NRE' },
        { group: 'unknown', type: 'credit_card', name: 'My card' },
      ],
    })
    expect(nre).toMatchObject({ country: 'IN', kind: 'asset', type: 'nre' })
    expect(card).toMatchObject({ country: null, kind: 'liability', type: 'credit_card' })
  })

  it('keeps the currency said, never converting; blanks bad numbers', () => {
    const [a, b, c] = linesFromModel({
      accounts: [
        { group: 'IN_asset', type: 'nre', name: 'x', amount: 5000, currency: 'USD' },
        { group: 'IN_asset', type: 'nre', name: 'y', amount: 'lots', currency: 'INR' },
        { group: 'IN_asset', type: 'nre', name: 'z', amount: -4, currency: 'INR' },
      ],
    })
    expect(a).toMatchObject({ amount: 5000, currency: 'USD' })
    expect(b.amount).toBeNull()
    expect(c.amount).toBeNull()
  })

  it('an India FD without a scheme is nudged NRE-or-NRO FD', () => {
    const [fd] = linesFromModel({ accounts: [{ group: 'IN_asset', type: null, name: 'SBI FD', said: 'an FD at SBI' }] })
    expect(fd.hint).toBe('fd')
  })

  it('keeps rates, maturity and a loan’s monthly payment when well-formed', () => {
    const [loan, fd] = linesFromModel({
      accounts: [
        { group: 'IN_liability', type: 'home_loan', name: 'HDFC home loan', amount: 8000000, currency: 'INR', interestRate: 8.5, monthlyPayment: 70000 },
        { group: 'IN_asset', type: 'fd_nre', name: 'FD', interestRate: 700, maturityDate: 'soon' },
      ],
    })
    expect(loan).toMatchObject({ kind: 'liability', interestRate: 8.5, minPayment: 70000 })
    expect(fd.interestRate).toBeUndefined()
    expect(fd.maturityDate).toBeUndefined()
  })

  it('skips junk and caps the list', () => {
    expect(linesFromModel({ accounts: 'nope' })).toEqual([])
    expect(linesFromModel({ accounts: [null, 3, 'x'] })).toEqual([])
    const many = Array.from({ length: MAX_LINES + 10 }, () => ({ group: 'US_asset', type: 'checking', name: 'c' }))
    expect(linesFromModel({ accounts: many })).toHaveLength(MAX_LINES)
  })

  it('names a line from its institution when the model gave no name', () => {
    const [l] = linesFromModel({ accounts: [{ group: 'US_asset', type: '401k', institution: 'Fidelity' }] })
    expect(l.name).toBe('Fidelity 401(k)')
  })
})

describe('the model reply', () => {
  it('tolerates code fences and prose around the JSON', () => {
    expect(parseJsonObject('Sure!\n```json\n{"accounts":[]}\n```')).toEqual({ accounts: [] })
    expect(() => parseJsonObject('no json here')).toThrow()
  })

  it('the prompt lists every type the pickers offer', () => {
    const p = buildParseSystem('2026-10-22')
    for (const c of ['IN', 'US'] as const)
      for (const k of ['asset', 'liability'] as const) for (const t of typeChoicesFor(c, k)) expect(p).toContain(t)
    expect(p).toContain('Do NOT guess the type')
  })
})
