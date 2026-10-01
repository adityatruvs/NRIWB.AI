import { describe, it, expect } from 'vitest'
import {
  IN_ASSET_CHOICES,
  fdRetypePatch,
  fromTypeChoice,
  mistypedFdScheme,
  typeChoice,
  typeChoiceLabel,
} from '@/lib/account-details'
import { byAssetClass, type Holding } from '@/lib/portfolio'

// Regression: an "HDFC NRE FD" typed `nre` was filed under Cash & Banking while
// other FDs sat under Fixed Deposits. The pickers now offer each FD per scheme.
describe('type choices', () => {
  it('offers India FDs per scheme, never a bare Fixed Deposit', () => {
    expect(IN_ASSET_CHOICES).toContain('fd_nre')
    expect(IN_ASSET_CHOICES).toContain('fd_nro')
    expect(IN_ASSET_CHOICES).not.toContain('fd')
    expect(typeChoiceLabel('fd_nre')).toBe('NRE Fixed Deposit')
    expect(typeChoiceLabel('nre')).toBe('NRE Savings')
  })

  it('an FD choice stores type fd + its scheme; other choices store the type alone', () => {
    expect(fromTypeChoice('fd_nre')).toEqual({ accountType: 'fd', fdScheme: 'NRE' })
    expect(fromTypeChoice('fd_nro')).toEqual({ accountType: 'fd', fdScheme: 'NRO' })
    expect(fromTypeChoice('nre')).toEqual({ accountType: 'nre' })
  })

  it('round-trips a stored FD back to its choice (a legacy FD without a scheme reads as NRE)', () => {
    expect(typeChoice('IN', 'fd', 'NRO')).toBe('fd_nro')
    expect(typeChoice('IN', 'fd', undefined)).toBe('fd_nre')
    expect(typeChoice('IN', 'nre')).toBe('nre')
  })

  it('files NRE FDs, NRO FDs and FCNR deposits together under Fixed Deposits', () => {
    const h = (accountType: Holding['accountType'], fdScheme?: 'NRE' | 'NRO'): Holding => ({
      nickname: 'x',
      institution: 'Bank',
      accountType,
      country: 'IN',
      balanceUsd: 0,
      balanceInr: 100_000,
      isPfic: false,
      source: 'manual',
      ...(fdScheme && { details: { fdScheme } }),
    })
    const slices = byAssetClass([h('fd', 'NRE'), h('fd', 'NRO'), h('fcnr')], 83)
    expect(slices.map((s) => s.key)).toEqual(['fixedDeposits'])
  })
})

describe('mistypedFdScheme (suggestion only)', () => {
  it('flags an India NRE/NRO savings account named like an FD', () => {
    expect(mistypedFdScheme({ country: 'IN', accountType: 'nre', nickname: 'HDFC NRE FD' })).toBe('NRE')
    expect(mistypedFdScheme({ country: 'IN', accountType: 'nro', nickname: 'SBI Fixed Deposit' })).toBe('NRO')
    expect(mistypedFdScheme({ country: 'IN', accountType: 'nre', nickname: 'ICICI term deposit' })).toBe('NRE')
  })

  it('leaves real savings accounts, US accounts and actual FDs alone', () => {
    expect(mistypedFdScheme({ country: 'IN', accountType: 'nre', nickname: 'HDFC NRE Savings' })).toBeNull()
    expect(mistypedFdScheme({ country: 'US', accountType: 'nre', nickname: 'NRE FD' })).toBeNull()
    expect(mistypedFdScheme({ country: 'IN', accountType: 'fd', nickname: 'HDFC NRE FD' })).toBeNull()
    // "FD" must be a word — not part of one.
    expect(mistypedFdScheme({ country: 'IN', accountType: 'nre', nickname: 'Fdelity NRE' })).toBeNull()
  })
})

describe('fdRetypePatch (one-off migration)', () => {
  const row = { country: 'IN', accountType: 'nre', nickname: 'HDFC NRE FD', details: null as unknown }

  it('re-types a mistyped row to fd, adding the scheme', () => {
    expect(fdRetypePatch(row)).toEqual({ accountType: 'fd', details: { fdScheme: 'NRE' } })
  })

  it('keeps every stored detail and a scheme already set', () => {
    const patch = fdRetypePatch({ ...row, accountType: 'nro', details: { interestRate: 7, tdsRate: 30, fdScheme: 'NRE' } })
    expect(patch).toEqual({ accountType: 'fd', details: { interestRate: 7, tdsRate: 30, fdScheme: 'NRE' } })
  })

  it('returns null for rows that look right', () => {
    expect(fdRetypePatch({ ...row, nickname: 'HDFC NRE Savings' })).toBeNull()
    expect(fdRetypePatch({ ...row, accountType: 'fd' })).toBeNull()
  })
})
