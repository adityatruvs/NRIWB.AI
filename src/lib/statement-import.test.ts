import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import type { Holding } from '@/lib/portfolio'
import { compareStatementDate, findMatch, type ImportIdentity } from '@/lib/import-key'
import {
  validateStatementFile,
  parseExtractionResult,
  extractTextFromFile,
  buildExtractionContent,
  STATEMENT_MAX_FILE_BYTES,
} from '@/lib/statement-import'

describe('validateStatementFile', () => {
  it('accepts every supported extension within the size limit', () => {
    expect(validateStatementFile({ name: 'CAS.pdf', size: 1024 })).toEqual({ ok: true, ext: '.pdf' })
    expect(validateStatementFile({ name: 'cas-statement.DOCX', size: 1024 })).toEqual({ ok: true, ext: '.docx' })
    expect(validateStatementFile({ name: 'old-statement.doc', size: 1024 })).toEqual({ ok: true, ext: '.doc' })
    expect(validateStatementFile({ name: 'holdings.xlsx', size: 1024 })).toEqual({ ok: true, ext: '.xlsx' })
    expect(validateStatementFile({ name: 'holdings.xls', size: 1024 })).toEqual({ ok: true, ext: '.xls' })
    expect(validateStatementFile({ name: 'holdings.csv', size: 1024 })).toEqual({ ok: true, ext: '.csv' })
    expect(validateStatementFile({ name: 'photo.JPG', size: 1024 })).toEqual({ ok: true, ext: '.jpg' })
    expect(validateStatementFile({ name: 'scan.png', size: 1024 })).toEqual({ ok: true, ext: '.png' })
  })

  it('rejects an empty file', () => {
    const res = validateStatementFile({ name: 'CAS.pdf', size: 0 })
    expect(res.ok).toBe(false)
  })

  it('rejects a file over the size limit', () => {
    const res = validateStatementFile({ name: 'CAS.pdf', size: STATEMENT_MAX_FILE_BYTES + 1 })
    expect(res.ok).toBe(false)
  })

  it('rejects an unrelated file type', () => {
    const res = validateStatementFile({ name: 'video.mp4', size: 1024 })
    expect(res.ok).toBe(false)
  })
})

const NO_SKIPS = { stocks: 0, unsupportedCurrency: 0, invalid: 0 }
const TODAY = new Date('2026-10-06T00:00:00Z')

describe('parseExtractionResult', () => {
  it('maps an India folio fund: folio + ISIN identity, PFIC, row date wins over statement date', () => {
    const { proposals, skipped } = parseExtractionResult(
      {
        statementDate: '2026-09-30',
        holdings: [
          {
            name: 'HDFC Flexi Cap Fund', assetType: 'folio_fund', institution: 'HDFC Mutual Fund',
            folioNumber: '1234567/89', isin: 'INF179K01XQ1', marketValue: 250000, currency: 'INR',
          },
        ],
      },
      TODAY,
    )
    expect(skipped).toEqual(NO_SKIPS)
    expect(proposals[0].account).toMatchObject({
      nickname: 'HDFC Flexi Cap Fund (Folio 1234567/89)',
      institution: 'HDFC Mutual Fund',
      accountType: 'mutual_fund',
      country: 'IN',
      balance: 250000,
      isPfic: true,
    })
    expect(proposals[0].import).toEqual({
      assetType: 'folio_fund',
      institution: 'HDFC Mutual Fund',
      folio: '123456789',
      instrumentId: 'ISIN:INF179K01XQ1',
      statementDate: '2026-09-30',
    })
  })

  it('maps a US custodial ETF: account + CUSIP identity, not a PFIC, country US', () => {
    const { proposals } = parseExtractionResult(
      {
        holdings: [
          {
            name: 'Vanguard Total Bond ETF', assetType: 'custodial_security', accountType: 'brokerage',
            institution: 'Fidelity', accountNumber: 'X1234-5678', isin: 'US9219378356', marketValue: 12000.4,
            currency: 'usd', asOfDate: '2026-09-15',
          },
        ],
      },
      TODAY,
    )
    expect(proposals[0].account).toMatchObject({ country: 'US', accountType: 'brokerage', balance: 12000, isPfic: false })
    expect(proposals[0].import).toMatchObject({
      assetType: 'custodial_security',
      accountRef: 'X12345678',
      instrumentId: 'CUSIP:921937835',
      statementDate: '2026-09-15',
    })
  })

  it('maps a deposit keyed on its account number only', () => {
    const { proposals } = parseExtractionResult(
      { holdings: [{ name: 'NRE Savings', assetType: 'deposit', institution: 'SBI', accountNumber: '****0042', marketValue: 90000, currency: 'INR' }] },
      TODAY,
    )
    expect(proposals[0].account.accountType).toBe('savings')
    expect(proposals[0].import.accountRef).toBe('*0042') // masked: kept as a tail, weak match only
    expect(proposals[0].import.instrumentId).toBeUndefined()
  })

  it('uses a weak NAME instrument id for a folio fund with no ISIN', () => {
    const { proposals } = parseExtractionResult(
      { holdings: [{ name: 'ICICI Bluechip Fund', assetType: 'folio_fund', folioNumber: '777', marketValue: 50000, currency: 'INR' }] },
      TODAY,
    )
    expect(proposals[0].import.instrumentId).toBe('NAME:icicibluechipfund')
    expect(proposals[0].account.institution).toBe('Mutual Fund')
  })

  it('excludes stocks and unsupported currencies, counting each', () => {
    const { proposals, skipped } = parseExtractionResult(
      {
        holdings: [
          { name: 'Apple Inc', assetType: 'stock', marketValue: 5000, currency: 'USD' },
          { name: 'UK Gilt Fund', assetType: 'custodial_security', accountNumber: '1', isin: 'GB00B3Y1JG82', marketValue: 100, currency: 'GBP' },
          { name: 'Keep Me', assetType: 'deposit', accountNumber: '9', marketValue: 100, currency: 'USD' },
        ],
      },
      TODAY,
    )
    expect(proposals.map((p) => p.account.nickname)).toEqual(['Keep Me (Acct 9)'])
    expect(skipped).toEqual({ stocks: 1, unsupportedCurrency: 1, invalid: 0 })
  })

  it('leaves the date undefined when the document gives none, or a future/invalid one', () => {
    const rows = [
      { name: 'A', assetType: 'deposit', accountNumber: '1', marketValue: 1, currency: 'USD' },
      { name: 'B', assetType: 'deposit', accountNumber: '2', marketValue: 1, currency: 'USD', asOfDate: '2099-01-01' },
      { name: 'C', assetType: 'deposit', accountNumber: '3', marketValue: 1, currency: 'USD', asOfDate: '31/12/2025' },
    ]
    const { proposals } = parseExtractionResult({ holdings: rows }, TODAY)
    expect(proposals.map((p) => p.import.statementDate)).toEqual([undefined, undefined, undefined])
  })

  it('drops zero-value or malformed rows without failing the whole batch', () => {
    const { proposals, skipped } = parseExtractionResult(
      {
        holdings: [
          { name: 'Valid Fund', assetType: 'folio_fund', marketValue: 1000, currency: 'INR' },
          { name: 'Redeemed Fund', assetType: 'folio_fund', marketValue: 0, currency: 'INR' },
          { name: '', assetType: 'folio_fund', marketValue: 500, currency: 'INR' },
          { marketValue: 500 },
          'not an object',
        ],
      },
      TODAY,
    )
    expect(proposals).toHaveLength(1)
    expect(skipped.invalid).toBe(4)
  })

  it('returns no proposals for a malformed top-level shape', () => {
    const empty = { proposals: [], skipped: NO_SKIPS }
    expect(parseExtractionResult(null)).toEqual(empty)
    expect(parseExtractionResult({ notHoldings: [] })).toEqual(empty)
    expect(parseExtractionResult('nonsense')).toEqual(empty)
  })
})

describe('buildExtractionContent', () => {
  it('sends a PDF as a native document block plus an instruction', async () => {
    const content = await buildExtractionContent('.pdf', Buffer.from('%PDF-1.4 fake'))
    expect(content).toHaveLength(2)
    expect(content[0]).toMatchObject({ type: 'document', source: { type: 'base64', media_type: 'application/pdf' } })
    expect(content[1]).toMatchObject({ type: 'text' })
  })

  it('sends jpg/jpeg/png as a native image block with the right media type', async () => {
    const jpg = await buildExtractionContent('.jpg', Buffer.from('fake-jpg'))
    const jpeg = await buildExtractionContent('.jpeg', Buffer.from('fake-jpeg'))
    const png = await buildExtractionContent('.png', Buffer.from('fake-png'))
    expect(jpg[0]).toMatchObject({ type: 'image', source: { media_type: 'image/jpeg' } })
    expect(jpeg[0]).toMatchObject({ type: 'image', source: { media_type: 'image/jpeg' } })
    expect(png[0]).toMatchObject({ type: 'image', source: { media_type: 'image/png' } })
    expect((jpg[0] as { source: { data: string } }).source.data).toBe(Buffer.from('fake-jpg').toString('base64'))
  })

  it('wraps extracted text (e.g. csv) in a single text block', async () => {
    const content = await buildExtractionContent('.csv', Buffer.from('Scheme,Value\nHDFC Flexi Cap,250000'))
    expect(content).toHaveLength(1)
    expect(content[0].type).toBe('text')
    expect((content[0] as { text: string }).text).toContain('HDFC Flexi Cap')
  })

  it('throws when a text-based file has no extractable content', async () => {
    await expect(buildExtractionContent('.csv', Buffer.from('   \n  '))).rejects.toThrow()
  })
})

describe('extractTextFromFile', () => {
  it('reads a .csv file as plain text', async () => {
    const text = await extractTextFromFile('.csv', Buffer.from('Scheme,Value\nHDFC Flexi Cap,250000', 'utf-8'))
    expect(text).toContain('HDFC Flexi Cap')
  })

  it('reads a legacy .xls workbook via the SheetJS-patched build', async () => {
    const wb = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([['Scheme', 'Value'], ['HDFC Flexi Cap Fund', 250000]])
    XLSX.utils.book_append_sheet(wb, sheet, 'Holdings')
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xls' }) as Buffer

    const text = await extractTextFromFile('.xls', buffer)
    expect(text).toContain('HDFC Flexi Cap Fund')
    expect(text).toContain('250000')
  })

  it('reads a modern .xlsx workbook via exceljs', async () => {
    const wb = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([['Scheme', 'Value'], ['ICICI Bluechip Fund', 50000]])
    XLSX.utils.book_append_sheet(wb, sheet, 'Holdings')
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    const text = await extractTextFromFile('.xlsx', buffer)
    expect(text).toContain('ICICI Bluechip Fund')
    expect(text).toContain('50000')
  })

  it('propagates a mammoth failure for a corrupt .docx', async () => {
    await expect(extractTextFromFile('.docx', Buffer.from('not a real docx'))).rejects.toThrow()
  })

  it('propagates a word-extractor failure for a corrupt .doc', async () => {
    await expect(extractTextFromFile('.doc', Buffer.from('not a real doc'))).rejects.toThrow()
  })
})

describe('re-uploading the same statement (story acceptance)', () => {
  // What the review panel stores when a row is accepted: the proposal's account + its identity parts.
  const stored = (p: ReturnType<typeof parseExtractionResult>['proposals'][number], id: string): Holding => {
    const { assetType, folio, accountRef, instrumentId, statementDate } = p.import
    return {
      id, nickname: p.account.nickname!, institution: p.account.institution!, accountType: p.account.accountType!,
      country: p.account.country!, balanceUsd: 0, balanceInr: p.account.balance!, isPfic: !!p.account.isPfic,
      source: 'pdf_upload', kind: 'asset',
      details: { assetType, ...(folio ? { folio } : {}), ...(accountRef ? { accountRef } : {}), ...(instrumentId ? { instrumentId } : {}), statementDate },
    }
  }

  const statement = {
    statementDate: '2026-09-30',
    holdings: [
      { name: 'HDFC Flexi Cap Fund', assetType: 'folio_fund', institution: 'HDFC Mutual Fund', folioNumber: '1234567/89', isin: 'INF179K01XQ1', marketValue: 250000, currency: 'INR' },
      { name: 'Vanguard Total Bond ETF', assetType: 'custodial_security', institution: 'Fidelity', accountNumber: 'X1234-5678', isin: 'US9219378356', marketValue: 12000, currency: 'USD' },
      { name: 'NRE Savings', assetType: 'deposit', institution: 'SBI', accountNumber: '00123456789', marketValue: 90000, currency: 'INR' },
      { name: 'Apple Inc', assetType: 'stock', marketValue: 5000, currency: 'USD' },
    ],
  }

  it('finds every holding it created the first time, as already up to date — no duplicates, stocks excluded', () => {
    const first = parseExtractionResult(statement, TODAY).proposals
    expect(first).toHaveLength(3)
    const ledger = first.map((p, i) => stored(p, `acc_${i}`))

    const second = parseExtractionResult(statement, TODAY).proposals
    second.forEach((p, i) => {
      const m = findMatch(p.import as ImportIdentity, ledger)
      expect(m).toMatchObject({ kind: 'match' })
      expect((m as { holding: Holding }).holding.id).toBe(`acc_${i}`)
      expect(compareStatementDate(p.import.statementDate!, ledger[i].details?.statementDate)).toBe('same')
    })
  })

  it('still matches when the model respells the institution or reformats the numbers', () => {
    const ledger = parseExtractionResult(statement, TODAY).proposals.map((p, i) => stored(p, `acc_${i}`))
    const respelled = {
      ...statement,
      holdings: [
        { ...statement.holdings[0], institution: 'HDFC MF', folioNumber: '1234567 / 89' },
        { ...statement.holdings[1], accountNumber: 'x1234 5678', isin: undefined, cusip: '921937835' },
        { ...statement.holdings[2], accountNumber: '123456789' },
      ],
    }
    const second = parseExtractionResult(respelled, TODAY).proposals
    expect(second.map((p) => findMatch(p.import as ImportIdentity, ledger).kind)).toEqual(['match', 'match', 'match'])
  })

  it('treats a later statement as an update and an earlier one as older', () => {
    const ledger = parseExtractionResult(statement, TODAY).proposals.map((p, i) => stored(p, `acc_${i}`))
    const later = parseExtractionResult({ ...statement, statementDate: '2026-10-05' }, TODAY).proposals[0]
    const earlier = parseExtractionResult({ ...statement, statementDate: '2026-06-30' }, TODAY).proposals[0]
    expect(compareStatementDate(later.import.statementDate!, ledger[0].details?.statementDate)).toBe('newer')
    expect(compareStatementDate(earlier.import.statementDate!, ledger[0].details?.statementDate)).toBe('older')
  })
})
