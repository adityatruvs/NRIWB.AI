import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  validateCasFile,
  parseExtractionResult,
  extractTextFromFile,
  buildExtractionContent,
  CAS_MAX_FILE_BYTES,
} from '@/lib/cas-import'

describe('validateCasFile', () => {
  it('accepts every supported extension within the size limit', () => {
    expect(validateCasFile({ name: 'CAS.pdf', size: 1024 })).toEqual({ ok: true, ext: '.pdf' })
    expect(validateCasFile({ name: 'cas-statement.DOCX', size: 1024 })).toEqual({ ok: true, ext: '.docx' })
    expect(validateCasFile({ name: 'old-statement.doc', size: 1024 })).toEqual({ ok: true, ext: '.doc' })
    expect(validateCasFile({ name: 'holdings.xlsx', size: 1024 })).toEqual({ ok: true, ext: '.xlsx' })
    expect(validateCasFile({ name: 'holdings.xls', size: 1024 })).toEqual({ ok: true, ext: '.xls' })
    expect(validateCasFile({ name: 'holdings.csv', size: 1024 })).toEqual({ ok: true, ext: '.csv' })
    expect(validateCasFile({ name: 'photo.JPG', size: 1024 })).toEqual({ ok: true, ext: '.jpg' })
    expect(validateCasFile({ name: 'scan.png', size: 1024 })).toEqual({ ok: true, ext: '.png' })
  })

  it('rejects an empty file', () => {
    const res = validateCasFile({ name: 'CAS.pdf', size: 0 })
    expect(res.ok).toBe(false)
  })

  it('rejects a file over the size limit', () => {
    const res = validateCasFile({ name: 'CAS.pdf', size: CAS_MAX_FILE_BYTES + 1 })
    expect(res.ok).toBe(false)
  })

  it('rejects an unrelated file type', () => {
    const res = validateCasFile({ name: 'video.mp4', size: 1024 })
    expect(res.ok).toBe(false)
  })
})

describe('parseExtractionResult', () => {
  it('maps a valid holding to an add_account RawAccount proposal, flagged PFIC', () => {
    const { proposals, skipped } = parseExtractionResult({
      holdings: [
        { schemeName: 'HDFC Flexi Cap Fund', amcName: 'HDFC Mutual Fund', folioNumber: '12345678', units: 100, marketValueInr: 250000 },
      ],
    })
    expect(skipped).toBe(0)
    expect(proposals).toHaveLength(1)
    expect(proposals[0].account).toMatchObject({
      nickname: 'HDFC Flexi Cap Fund (Folio 12345678)',
      institution: 'HDFC Mutual Fund',
      accountType: 'mutual_fund',
      country: 'IN',
      balance: 250000,
      kind: 'asset',
      isPfic: true,
    })
    expect(proposals[0].summary).toContain('HDFC Flexi Cap Fund')
  })

  it('omits the folio suffix and defaults the institution when not provided', () => {
    const { proposals } = parseExtractionResult({
      holdings: [{ schemeName: 'ICICI Bluechip Fund', marketValueInr: 50000 }],
    })
    expect(proposals[0].account.nickname).toBe('ICICI Bluechip Fund')
    expect(proposals[0].account.institution).toBe('Mutual Fund')
  })

  it('drops zero/negative-value or malformed rows without failing the whole batch', () => {
    const { proposals, skipped } = parseExtractionResult({
      holdings: [
        { schemeName: 'Valid Fund', marketValueInr: 1000 },
        { schemeName: 'Redeemed Fund', marketValueInr: 0 },
        { schemeName: '', marketValueInr: 500 },
        { marketValueInr: 500 },
        'not an object',
      ],
    })
    expect(proposals).toHaveLength(1)
    expect(proposals[0].account.nickname).toBe('Valid Fund')
    expect(skipped).toBe(4)
  })

  it('returns no proposals for a malformed top-level shape', () => {
    expect(parseExtractionResult(null)).toEqual({ proposals: [], skipped: 0 })
    expect(parseExtractionResult({ notHoldings: [] })).toEqual({ proposals: [], skipped: 0 })
    expect(parseExtractionResult('nonsense')).toEqual({ proposals: [], skipped: 0 })
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
