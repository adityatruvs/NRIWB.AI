import { describe, it, expect } from 'vitest'
import { TYPE_LABELS, ownershipLabel } from '@/lib/portfolio'
import {
  ACCOUNT_TYPES,
  createAccountSchema,
  updateAccountSchema,
  toHolding,
  toCreateData,
  toUpdateData,
  formatZodError,
  isOlderStatement,
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
    ownership: 'self',
    coOwners: null,
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

describe('ownership', () => {
  const base = { nickname: 'Home', institution: 'Self', accountType: 'property', country: 'IN' } as const

  it('defaults to self with no co-owners', () => {
    const data = toCreateData(createAccountSchema.parse(base), 'u')
    expect(data.ownership).toBe('self')
    expect(data.coOwners).toBeUndefined()
    const h = toHolding(row())
    expect(h).not.toHaveProperty('ownership')
    expect(h).not.toHaveProperty('coOwners')
  })

  it('persists joint co-owners and drops them for self', () => {
    const joint = createAccountSchema.parse({ ...base, ownership: 'joint', coOwners: [{ name: ' Ramesh ', relation: 'father' }] })
    expect(toCreateData(joint, 'u').coOwners).toEqual([{ name: 'Ramesh', relation: 'father' }])
    const self = createAccountSchema.parse({ ...base, ownership: 'self', coOwners: [{ name: 'x', relation: 'father' }] })
    expect(toCreateData(self, 'u').coOwners).toBeUndefined()
  })

  it('rejects an unknown ownership or relation', () => {
    expect(createAccountSchema.safeParse({ ...base, ownership: 'trust' }).success).toBe(false)
    expect(createAccountSchema.safeParse({ ...base, coOwners: [{ name: 'x', relation: 'cousin' }] }).success).toBe(false)
  })

  it('maps a family-held row back to a Holding', () => {
    const h = toHolding(row({ ownership: 'family', coOwners: [{ name: '', relation: 'mother' }] }))
    expect(h.ownership).toBe('family')
    expect(h.coOwners).toEqual([{ name: '', relation: 'mother' }])
  })

  it('switching to self on PATCH clears co-owners', () => {
    const data = toUpdateData(updateAccountSchema.parse({ ownership: 'self', coOwners: [{ name: 'x', relation: 'spouse' }] }))
    expect(data.ownership).toBe('self')
    expect(data.coOwners).toBeNull()
  })

  it('labels who holds title', () => {
    expect(ownershipLabel({})).toBeNull()
    expect(ownershipLabel({ ownership: 'joint', coOwners: [{ name: 'Ramesh', relation: 'father' }] })).toBe('You + Father (Ramesh)')
    expect(ownershipLabel({ ownership: 'family', coOwners: [{ name: '', relation: 'mother' }] })).toBe('Mother')
    expect(ownershipLabel({ ownership: 'joint', coOwners: [{ name: 'Anita', relation: 'other' }] })).toBe('You + Anita')
  })
})

describe('formatZodError', () => {
  it('produces a readable path: message string', () => {
    const res = createAccountSchema.safeParse({ institution: 'y', accountType: 'savings', country: 'US' })
    expect(res.success).toBe(false)
    if (!res.success) expect(formatZodError(res.error)).toContain('nickname')
  })
})

describe('statement-import identity', () => {
  const identity = { assetType: 'folio_fund', folio: '123', instrumentId: 'ISIN:INF179K01XQ1', statementDate: '2026-09-30' } as const
  const base = { nickname: 'HDFC Flexi Cap (Folio 123)', institution: 'HDFC Mutual Fund', accountType: 'mutual_fund', country: 'IN' } as const

  it('stores identity in columns + importKey, not in the details JSON', () => {
    const input = createAccountSchema.parse({ ...base, details: { ...identity, expectedReturn: 11 } })
    const data = toCreateData(input, 'user_1') as Record<string, unknown>
    expect(data).toMatchObject({
      importAssetType: 'folio_fund', folio: '123', instrumentId: 'ISIN:INF179K01XQ1',
      statementDate: '2026-09-30', importKey: 'ff|123|ISIN:INF179K01XQ1',
    })
    expect(data.details).toEqual({ expectedReturn: 11 })
  })

  it('round-trips the columns back into holding.details', () => {
    const h = toHolding(row({ importAssetType: 'folio_fund', folio: '123', instrumentId: 'ISIN:X', statementDate: '2026-09-30', details: { expectedReturn: 11 } }))
    expect(h.details).toEqual({ expectedReturn: 11, assetType: 'folio_fund', folio: '123', instrumentId: 'ISIN:X', statementDate: '2026-09-30' })
  })

  it('leaves manual rows without identity columns', () => {
    const data = toCreateData(createAccountSchema.parse({ ...base, details: { expectedReturn: 11 } }), 'user_1') as Record<string, unknown>
    expect(data).not.toHaveProperty('importKey')
  })

  it('a plain edit (details without identity) does not touch the identity columns', () => {
    const data = toUpdateData(updateAccountSchema.parse({ details: { expectedReturn: 12 } }), 'HDFC')
    expect(data).not.toHaveProperty('importKey')
    expect(data).not.toHaveProperty('folio')
    expect(data.details).toEqual({ expectedReturn: 12 })
  })

  it('an import update refreshes the identity columns using the existing institution', () => {
    const data = toUpdateData(updateAccountSchema.parse({ details: { assetType: 'deposit', accountRef: '42', statementDate: '2026-10-01' } }), 'State Bank of India')
    expect(data).toMatchObject({ importAssetType: 'deposit', accountRef: '42', statementDate: '2026-10-01', importKey: 'dp|statebankofindia|42' })
  })

  it('flags only a strictly older statement', () => {
    expect(isOlderStatement('2026-03-31', '2026-09-30')).toBe(true)
    expect(isOlderStatement('2026-09-30', '2026-09-30')).toBe(false)
    expect(isOlderStatement('2026-10-31', '2026-09-30')).toBe(false)
    expect(isOlderStatement('2026-03-31', null)).toBe(false)
    expect(isOlderStatement(undefined, '2026-09-30')).toBe(false)
  })
})
