import { describe, it, expect } from 'vitest'
import {
  mapPlaidType,
  plaidBalanceUsd,
  plaidAccountFields,
  extractLoanRates,
  type PlaidAccountInput,
} from '@/lib/plaid-map'

function acct(overrides: Partial<PlaidAccountInput> = {}): PlaidAccountInput {
  return {
    account_id: 'plaid_abc',
    name: 'Checking',
    type: 'depository',
    subtype: 'checking',
    balances: { current: 1234.56, available: 1000 },
    ...overrides,
  }
}

describe('mapPlaidType', () => {
  it('maps common subtypes to our account types', () => {
    expect(mapPlaidType('checking', 'depository')).toBe('checking')
    expect(mapPlaidType('savings', 'depository')).toBe('savings')
    expect(mapPlaidType('money market', 'depository')).toBe('savings')
    expect(mapPlaidType('401k', 'investment')).toBe('401k')
    expect(mapPlaidType('roth', 'investment')).toBe('roth_ira')
    expect(mapPlaidType('credit card', 'credit')).toBe('credit_card')
  })

  it('is case-insensitive on subtype', () => {
    expect(mapPlaidType('Roth IRA', 'investment')).toBe('roth_ira')
  })

  it('falls back to the top-level type when the subtype is unknown', () => {
    expect(mapPlaidType('weird-subtype', 'investment')).toBe('brokerage')
    expect(mapPlaidType(null, 'credit')).toBe('credit_card')
    expect(mapPlaidType(null, 'loan')).toBe('personal_loan')
  })

  it('defaults to "other" when nothing matches', () => {
    expect(mapPlaidType('mystery', 'mystery')).toBe('other')
  })
})

describe('plaidBalanceUsd', () => {
  it('prefers current, then available, then 0', () => {
    expect(plaidBalanceUsd(acct({ balances: { current: 500, available: 400 } }))).toBe(500)
    expect(plaidBalanceUsd(acct({ balances: { current: null, available: 400 } }))).toBe(400)
    expect(plaidBalanceUsd(acct({ balances: { current: null, available: null } }))).toBe(0)
  })
})

describe('plaidAccountFields', () => {
  const opts = { userId: 'user_1', institutionName: 'Chase', rate: 83 }

  it('builds a persistable asset row with USD-native balances', () => {
    const f = plaidAccountFields(acct({ name: 'Total Checking', balances: { current: 2000, available: 1900 } }), opts)
    expect(f).toMatchObject({
      userId: 'user_1',
      nickname: 'Chase Total Checking',
      institution: 'Chase',
      accountType: 'checking',
      country: 'US',
      balanceUsd: 2000,
      balanceInr: 2000 * 83,
      currency: 'USD',
      isManual: false,
      source: 'plaid',
      kind: 'asset',
      isPfic: false,
      plaidAccountId: 'plaid_abc',
    })
  })

  it('marks a linked credit card as a liability', () => {
    const f = plaidAccountFields(
      acct({ type: 'credit', subtype: 'credit card', name: 'Sapphire', balances: { current: 850, available: null } }),
      opts,
    )
    expect(f.accountType).toBe('credit_card')
    expect(f.kind).toBe('liability')
    expect(f.balanceUsd).toBe(850)
  })
})

describe('extractLoanRates', () => {
  it('reads mortgage note rate, student rate, and credit purchase APR', () => {
    const rates = extractLoanRates({
      mortgage: [{ account_id: 'm1', interest_rate: { percentage: 3.5 } }],
      student: [{ account_id: 's1', interest_rate_percentage: 6.8 }],
      credit: [
        {
          account_id: 'c1',
          aprs: [
            { apr_percentage: 15, apr_type: 'balance_transfer_apr' },
            { apr_percentage: 22.9, apr_type: 'purchase_apr' },
          ],
        },
      ],
    })
    expect(rates).toEqual({ m1: 3.5, s1: 6.8, c1: 22.9 })
  })

  it('falls back to the first APR when there is no purchase APR', () => {
    const rates = extractLoanRates({
      credit: [{ account_id: 'c2', aprs: [{ apr_percentage: 19.99, apr_type: 'cash_apr' }] }],
    })
    expect(rates.c2).toBe(19.99)
  })

  it('skips entries with missing ids or rates, and tolerates null/empty', () => {
    expect(extractLoanRates(null)).toEqual({})
    expect(
      extractLoanRates({ mortgage: [{ account_id: 'm', interest_rate: { percentage: null } }] }),
    ).toEqual({})
  })
})
