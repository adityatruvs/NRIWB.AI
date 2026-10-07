import { describe, it, expect } from 'vitest'
import type { Holding, HoldingDetails } from '@/lib/portfolio'
import {
  buildImportKey,
  compareStatementDate,
  findMatch,
  nameInstrumentId,
  normalizeAccountRef,
  normalizeInstrumentId,
  normalizeRef,
  validStatementDate,
  type ImportIdentity,
} from '@/lib/import-key'

function holding(over: Partial<Holding> & { details?: HoldingDetails }): Holding {
  return {
    id: 'h1', nickname: 'Existing', institution: 'HDFC Mutual Fund', accountType: 'mutual_fund', country: 'IN',
    balanceUsd: 0, balanceInr: 100, isPfic: true, source: 'pdf_upload', kind: 'asset', ...over,
  }
}

describe('normalizers', () => {
  it('normalizes refs: case, punctuation and leading zeros', () => {
    expect(normalizeRef(' 00x12-34/5 ')).toBe('X12345')
    expect(normalizeRef('***')).toBeUndefined()
    expect(normalizeRef(undefined)).toBeUndefined()
  })

  it('collapses US/CA ISINs to the CUSIP core so ISIN and CUSIP statements agree', () => {
    expect(normalizeInstrumentId({ isin: 'US9219378356' })).toBe('CUSIP:921937835')
    expect(normalizeInstrumentId({ cusip: '921937835' })).toBe('CUSIP:921937835')
    expect(normalizeInstrumentId({ isin: 'CA0679011084' })).toBe('CUSIP:067901108')
  })

  it('keeps other ISINs, falls back to SEDOL, and rejects malformed ids', () => {
    expect(normalizeInstrumentId({ isin: 'inf179k01xq1' })).toBe('ISIN:INF179K01XQ1')
    expect(normalizeInstrumentId({ sedol: 'B3Y1JG8' })).toBe('SEDOL:B3Y1JG8')
    expect(normalizeInstrumentId({ isin: 'not-an-isin' })).toBeUndefined()
  })
})

describe('findMatch — folio_fund (folio + ISIN)', () => {
  const incoming: ImportIdentity = { assetType: 'folio_fund', institution: 'HDFC Mutual Fund', folio: '123', instrumentId: 'ISIN:INF179K01XQ1' }
  const stored = (folio: string, id: string) =>
    holding({ details: { assetType: 'folio_fund', folio, instrumentId: id } })

  it('matches the same folio + ISIN even if the AMC is spelled differently', () => {
    const h = holding({ institution: 'HDFC MF', details: { assetType: 'folio_fund', folio: '123', instrumentId: 'ISIN:INF179K01XQ1' } })
    expect(findMatch(incoming, [h])).toEqual({ kind: 'match', holding: h })
  })

  it('does not merge one scheme held in two folios', () => {
    expect(findMatch(incoming, [stored('999', 'ISIN:INF179K01XQ1')])).toEqual({ kind: 'new' })
  })

  it('does not merge two schemes in one folio', () => {
    expect(findMatch(incoming, [stored('123', 'ISIN:INF000000000')])).toEqual({ kind: 'new' })
  })

  it('asks for confirmation when only a weak NAME id matches', () => {
    const weak = { ...incoming, instrumentId: nameInstrumentId('HDFC Flexi Cap')! }
    const h = stored('123', nameInstrumentId('HDFC Flexi Cap')!)
    expect(findMatch(weak, [h])).toEqual({ kind: 'confirm', holding: h })
  })

  it('finds a legacy import (folio only in the nickname) as a confirm, not a silent match', () => {
    const legacy = holding({ nickname: 'HDFC Flexi Cap (Folio 123)' })
    const res = findMatch({ ...incoming, instrumentId: nameInstrumentId('HDFC Flexi Cap ')! }, [legacy])
    expect(res).toEqual({ kind: 'confirm', holding: legacy })
  })
})

describe('findMatch — custodial_security (account + instrument)', () => {
  const incoming: ImportIdentity = { assetType: 'custodial_security', institution: 'Fidelity', accountRef: 'X1', instrumentId: 'CUSIP:921937835' }
  const stored = (over: Partial<Holding> = {}, d: HoldingDetails = {}) =>
    holding({ institution: 'Fidelity', accountType: 'brokerage', country: 'US', details: { assetType: 'custodial_security', accountRef: 'X1', instrumentId: 'CUSIP:921937835', ...d }, ...over })

  it('matches on account + instrument at the same institution', () => {
    const h = stored()
    expect(findMatch(incoming, [h])).toEqual({ kind: 'match', holding: h })
  })

  it('does not merge the same fund held in two accounts', () => {
    expect(findMatch(incoming, [stored({}, { accountRef: 'X2' })])).toEqual({ kind: 'new' })
  })

  it('asks to confirm when account + instrument match but the institution differs', () => {
    const h = stored({ institution: 'Schwab' })
    expect(findMatch(incoming, [h])).toEqual({ kind: 'confirm', holding: h })
  })

  it('asks to confirm when the statement has no account number but instrument + institution match', () => {
    const h = stored()
    expect(findMatch({ ...incoming, accountRef: undefined }, [h])).toEqual({ kind: 'confirm', holding: h })
  })
})

describe('findMatch — deposit (account number)', () => {
  const incoming: ImportIdentity = { assetType: 'deposit', institution: 'State Bank of India', accountRef: '42' }
  const stored = (over: Partial<Holding> = {}) =>
    holding({ institution: 'State Bank of India', accountType: 'savings', details: { assetType: 'deposit', accountRef: '42' }, ...over })

  it('matches on account number at the same institution', () => {
    const h = stored()
    expect(findMatch(incoming, [h])).toEqual({ kind: 'match', holding: h })
  })

  it('treats a masked number that collides across banks as a confirm, not a match', () => {
    const h = stored({ institution: 'HDFC Bank' })
    expect(findMatch(incoming, [h])).toEqual({ kind: 'confirm', holding: h })
  })

  it('is new when there is no account number to match on', () => {
    expect(findMatch({ ...incoming, accountRef: undefined }, [stored()])).toEqual({ kind: 'new' })
  })

  it('ignores holdings with no import identity (manual / Plaid) and liabilities', () => {
    expect(findMatch(incoming, [holding({ source: 'manual', nickname: 'Savings' })])).toEqual({ kind: 'new' })
    expect(findMatch(incoming, [stored({ kind: 'liability' })])).toEqual({ kind: 'new' })
  })
})

describe('statement dates', () => {
  it('compares incoming against the recorded date', () => {
    expect(compareStatementDate('2026-09-30', undefined)).toBe('newer')
    expect(compareStatementDate('2026-09-30', '2026-06-30')).toBe('newer')
    expect(compareStatementDate('2026-09-30', '2026-09-30')).toBe('same')
    expect(compareStatementDate('2026-03-31', '2026-09-30')).toBe('older')
  })

  it('accepts only real, non-future YYYY-MM-DD dates', () => {
    const today = new Date('2026-10-06T12:00:00Z')
    expect(validStatementDate('2026-10-06', today)).toBe('2026-10-06')
    expect(validStatementDate('2026-10-07', today)).toBeUndefined()
    expect(validStatementDate('2026-02-30', today)).toBeUndefined()
    expect(validStatementDate('06/10/2026', today)).toBeUndefined()
    expect(validStatementDate(undefined, today)).toBeUndefined()
  })
})

describe('buildImportKey', () => {
  it('builds a per-type key, leaving the AMC out of folio funds', () => {
    expect(buildImportKey({ assetType: 'folio_fund', institution: 'HDFC MF', folio: '1', instrumentId: 'ISIN:A' })).toBe('ff|1|ISIN:A')
    expect(buildImportKey({ assetType: 'custodial_security', institution: 'Fidelity', accountRef: 'X1', instrumentId: 'CUSIP:Z' })).toBe('cs|fidelity|X1|CUSIP:Z')
    expect(buildImportKey({ assetType: 'deposit', institution: 'SBI', accountRef: '42' })).toBe('dp|sbi|42')
  })

  it('returns null when the holding cannot be identified, or only weakly', () => {
    expect(buildImportKey({ assetType: 'folio_fund', institution: 'X', folio: '1' })).toBeNull()
    expect(buildImportKey({ assetType: 'folio_fund', institution: 'X', folio: '1', instrumentId: 'NAME:abc' })).toBeNull()
    expect(buildImportKey({ assetType: 'custodial_security', institution: 'X', instrumentId: 'CUSIP:Z' })).toBeNull()
    expect(buildImportKey({ assetType: 'deposit', institution: 'X' })).toBeNull()
  })
})

describe('masked account numbers', () => {
  it('keeps a masked or short tail as a weak *tail ref and a full number as-is', () => {
    expect(normalizeAccountRef('XXXX1234')).toBe('*1234')
    expect(normalizeAccountRef('****-1234')).toBe('*1234')
    expect(normalizeAccountRef('1234')).toBe('*1234')
    expect(normalizeAccountRef('0012 3456 7890')).toBe('1234567890')
    expect(normalizeAccountRef('X1234-5678')).toBe('X12345678')
    expect(normalizeAccountRef('***')).toBeUndefined()
  })

  const incoming: ImportIdentity = { assetType: 'deposit', institution: 'SBI', accountRef: '*1234' }
  const stored = (accountRef: string) =>
    holding({ institution: 'SBI', accountType: 'savings', details: { assetType: 'deposit', accountRef } })

  it('never treats a masked tail as a certain match — two accounts can share the last 4', () => {
    const h = stored('*1234')
    expect(findMatch(incoming, [h])).toEqual({ kind: 'confirm', holding: h })
  })

  it('offers a full stored number as a probable match for a masked tail, not an unrelated one', () => {
    const full = stored('99991234')
    expect(findMatch(incoming, [full])).toEqual({ kind: 'confirm', holding: full })
    expect(findMatch(incoming, [stored('99995678')])).toEqual({ kind: 'new' })
  })

  it('gives masked refs no DB uniqueness key', () => {
    expect(buildImportKey({ assetType: 'deposit', institution: 'SBI', accountRef: '*1234' })).toBeNull()
    expect(buildImportKey({ assetType: 'custodial_security', institution: 'F', accountRef: '*1234', instrumentId: 'CUSIP:Z' })).toBeNull()
  })
})

describe('findMatch — model inconsistency between uploads', () => {
  it('offers a folio fund as a probable match when the new upload lost its ISIN', () => {
    const h = holding({ details: { assetType: 'folio_fund', folio: '123', instrumentId: 'ISIN:INF179K01XQ1' } })
    const res = findMatch({ assetType: 'folio_fund', institution: 'HDFC Mutual Fund', folio: '123', instrumentId: nameInstrumentId('HDFC Flexi Cap') }, [h])
    expect(res).toEqual({ kind: 'confirm', holding: h })
  })

  it('still treats two different ISINs in one folio as different schemes', () => {
    const h = holding({ details: { assetType: 'folio_fund', folio: '123', instrumentId: 'ISIN:INF179K01XQ1' } })
    expect(findMatch({ assetType: 'folio_fund', institution: 'HDFC', folio: '123', instrumentId: 'ISIN:INF000000000' }, [h])).toEqual({ kind: 'new' })
  })

  it('offers a probable match when the same number + instrument was classified as a different recipe', () => {
    const h = holding({ details: { assetType: 'folio_fund', folio: '123', instrumentId: 'ISIN:INF179K01XQ1' } })
    const res = findMatch({ assetType: 'custodial_security', institution: 'HDFC Mutual Fund', accountRef: '123', instrumentId: 'ISIN:INF179K01XQ1' }, [h])
    expect(res).toEqual({ kind: 'confirm', holding: h })
  })

  it('does not cross-match unrelated holdings that merely share a recipe-less number', () => {
    const h = holding({ institution: 'SBI', accountType: 'savings', details: { assetType: 'deposit', accountRef: '99999' } })
    expect(findMatch({ assetType: 'other', institution: 'HDFC Bank', accountRef: '99999' }, [h])).toEqual({ kind: 'new' })
  })
})
