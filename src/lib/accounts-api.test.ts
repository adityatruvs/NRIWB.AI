import { describe, it, expect } from 'vitest'
import { TYPE_LABELS } from '@/lib/portfolio'
import {
  ACCOUNT_TYPES,
  createAccountSchema,
  updateAccountSchema,
  toHolding,
  toCreateData,
  toUpdateData,
  formatZodError,
  type AccountRecord,
} from '@/lib/accounts-api'

/** A representative DB row for mapping tests. */
function row(overrides: Partial<AccountRecord> = {}): AccountRecord {
  return {
    id: 'acc_1',
    nickname: 'HDFC NRE FD',
    institution: 'HDFC',
    accountType: 'fd',
    country: 'IN',
    balanceUsd: 0,
    balanceInr: 1_500_000,
    isPfic: false,
    source: 'manual',
    kind: 'asset',
    securedAgainstId: null,
    details: null,
    lastSyncedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('ACCOUNT_TYPES', () => {
  it('stays exhaustive against TYPE_LABELS (no missing/extra types)', () => {
    expect([...ACCOUNT_TYPES].sort()).toEqual(Object.keys(TYPE_LABELS).sort())
  })
})

describe('createAccountSchema', () => {
  it('accepts a minimal valid body and applies defaults', () => {
    const parsed = createAccountSchema.parse({
      nickname: 'Chase Checking',
      institution: 'Chase',
      accountType: 'checking',
      country: 'US',
    })
    expect(parsed).toMatchObject({
      balanceUsd: 0,
      balanceInr: 0,
      isPfic: false,
      source: 'manual',
      kind: 'asset',
    })
  })

  it('rejects an unknown account type', () => {
    const res = createAccountSchema.safeParse({
      nickname: 'x',
      institution: 'y',
      accountType: 'crypto',
      country: 'US',
    })
    expect(res.success).toBe(false)
  })

  it('rejects a negative balance', () => {
    const res = createAccountSchema.safeParse({
      nickname: 'x',
      institution: 'y',
      accountType: 'savings',
      country: 'US',
      balanceUsd: -5,
    })
    expect(res.success).toBe(false)
  })

  it('rejects a blank nickname and a bad country', () => {
    expect(
      createAccountSchema.safeParse({ nickname: '  ', institution: 'y', accountType: 'savings', country: 'US' }).success,
    ).toBe(false)
    expect(
      createAccountSchema.safeParse({ nickname: 'x', institution: 'y', accountType: 'savings', country: 'MX' }).success,
    ).toBe(false)
  })

  it('strips unknown keys and validates nested details', () => {
    const parsed = createAccountSchema.parse({
      nickname: 'FCNR',
      institution: 'ICICI',
      accountType: 'fcnr',
      country: 'IN',
      hacker: 'ignored',
      details: { interestRate: 6.5, depositCurrency: 'USD', bogus: 1 },
    })
    expect(parsed).not.toHaveProperty('hacker')
    expect(parsed.details).toEqual({ interestRate: 6.5, depositCurrency: 'USD' })
  })

  it('rejects a malformed maturityDate', () => {
    const res = createAccountSchema.safeParse({
      nickname: 'FD',
      institution: 'HDFC',
      accountType: 'fd',
      country: 'IN',
      details: { maturityDate: '01/01/2030' },
    })
    expect(res.success).toBe(false)
  })
})

describe('toHolding', () => {
  it('maps a row to the client Holding shape', () => {
    const h = toHolding(row({ balanceInr: 1_500_000, details: { interestRate: 7.1 } }))
    expect(h).toEqual({
      id: 'acc_1',
      nickname: 'HDFC NRE FD',
      institution: 'HDFC',
      accountType: 'fd',
      country: 'IN',
      balanceUsd: 0,
      balanceInr: 1_500_000,
      isPfic: false,
      source: 'manual',
      kind: 'asset',
      details: { interestRate: 7.1 },
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
    })
  })

  it('omits securedAgainstId and details when empty', () => {
    const h = toHolding(row({ details: {} }))
    expect(h).not.toHaveProperty('securedAgainstId')
    expect(h).not.toHaveProperty('details')
  })

  it('surfaces a liability kind + its secured-against link', () => {
    const h = toHolding(row({ accountType: 'mortgage', kind: 'liability', securedAgainstId: 'acc_home' }))
    expect(h.kind).toBe('liability')
    expect(h.securedAgainstId).toBe('acc_home')
  })
})

describe('toCreateData', () => {
  it('derives currency, isManual, and freshness for a manual India FD', () => {
    const input = createAccountSchema.parse({
      nickname: 'HDFC FD',
      institution: 'HDFC',
      accountType: 'fd',
      country: 'IN',
      balanceInr: 1_000_000,
    })
    const data = toCreateData(input, 'user_42')
    expect(data.userId).toBe('user_42')
    expect(data.currency).toBe('INR')
    expect(data.isManual).toBe(true)
    expect(data.lastSyncedAt).toBeInstanceOf(Date)
  })

  it('an FCNR deposit currency overrides the country default', () => {
    const input = createAccountSchema.parse({
      nickname: 'FCNR',
      institution: 'ICICI',
      accountType: 'fcnr',
      country: 'IN',
      details: { depositCurrency: 'USD' },
    })
    expect(toCreateData(input, 'u').currency).toBe('USD')
  })

  it('forces kind=liability for a liability type even if asset was passed', () => {
    const input = createAccountSchema.parse({
      nickname: 'Home loan',
      institution: 'SBI',
      accountType: 'home_loan',
      country: 'IN',
      kind: 'asset',
    })
    expect(toCreateData(input, 'u').kind).toBe('liability')
  })

  it('drops a secured-against link on an asset (only liabilities carry it)', () => {
    const input = createAccountSchema.parse({
      nickname: 'Brokerage',
      institution: 'Fidelity',
      accountType: 'brokerage',
      country: 'US',
      kind: 'asset',
      securedAgainstId: 'acc_home',
    })
    expect(toCreateData(input, 'u').securedAgainstId).toBeNull()
  })

  it('keeps a secured-against link on a liability', () => {
    const input = createAccountSchema.parse({
      nickname: 'Mortgage',
      institution: 'Wells',
      accountType: 'mortgage',
      country: 'US',
      securedAgainstId: 'acc_home',
    })
    expect(toCreateData(input, 'u').securedAgainstId).toBe('acc_home')
  })
})

describe('toUpdateData', () => {
  it('touches only provided keys and refreshes lastSyncedAt', () => {
    const patch = updateAccountSchema.parse({ balanceUsd: 5000 })
    const data = toUpdateData(patch)
    expect(data.balanceUsd).toBe(5000)
    expect(data.lastSyncedAt).toBeInstanceOf(Date)
    expect(data).not.toHaveProperty('nickname')
    expect(data).not.toHaveProperty('kind')
  })

  it('returns an empty object for an empty patch', () => {
    const data = toUpdateData(updateAccountSchema.parse({}))
    expect(Object.keys(data)).toHaveLength(0)
  })

  it('syncs isManual when source changes', () => {
    expect(toUpdateData(updateAccountSchema.parse({ source: 'plaid' })).isManual).toBe(false)
    expect(toUpdateData(updateAccountSchema.parse({ source: 'manual' })).isManual).toBe(true)
  })

  it('forces liability kind when the type changes to a debt type', () => {
    const data = toUpdateData(updateAccountSchema.parse({ accountType: 'credit_card' }))
    expect(data.kind).toBe('liability')
  })

  it('passes through null to clear securedAgainstId and details', () => {
    const data = toUpdateData(updateAccountSchema.parse({ securedAgainstId: null, details: null }))
    expect(data.securedAgainstId).toBeNull()
    expect(data.details).toBeNull()
  })

  it('clears details when the cleaned object is empty', () => {
    const data = toUpdateData(updateAccountSchema.parse({ details: {} }))
    expect(data.details).toBeNull()
  })
})

describe('formatZodError', () => {
  it('produces a readable path: message string', () => {
    const res = createAccountSchema.safeParse({ institution: 'y', accountType: 'savings', country: 'US' })
    expect(res.success).toBe(false)
    if (!res.success) expect(formatZodError(res.error)).toContain('nickname')
  })
})
