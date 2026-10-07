import { z } from 'zod'
import mammoth from 'mammoth'
import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import WordExtractor from 'word-extractor'
import type Anthropic from '@anthropic-ai/sdk'
import type { RawAccount } from '@/lib/copilot-actions'
import type { AccountType } from '@/types/accounts'
import {
  IMPORT_ASSET_TYPES,
  normalizeInstrumentId,
  normalizeAccountRef,
  normalizeRef,
  nameInstrumentId,
  validStatementDate,
  type ImportAssetType,
  type ImportIdentity,
} from '@/lib/import-key'

export const STATEMENT_MAX_FILE_BYTES = 10 * 1024 * 1024

const TEXT_EXTENSIONS = ['.docx', '.doc', '.xlsx', '.xls', '.csv'] as const
const NATIVE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'] as const

export const STATEMENT_ACCEPTED_EXTENSIONS = [...TEXT_EXTENSIONS, ...NATIVE_EXTENSIONS] as const
export type StatementExtension = (typeof STATEMENT_ACCEPTED_EXTENSIONS)[number]

export type StatementFileValidation =
  | { ok: true; ext: StatementExtension }
  | { ok: false; error: string }

export function validateStatementFile(file: { name: string; size: number }): StatementFileValidation {
  if (file.size <= 0) return { ok: false, error: 'That file is empty.' }
  if (file.size > STATEMENT_MAX_FILE_BYTES) {
    return { ok: false, error: `File is too large — the limit is ${STATEMENT_MAX_FILE_BYTES / (1024 * 1024)}MB.` }
  }
  const lower = file.name.toLowerCase()
  const ext = STATEMENT_ACCEPTED_EXTENSIONS.find((e) => lower.endsWith(e))
  if (ext) return { ok: true, ext }
  return {
    ok: false,
    error: 'Unsupported file — upload a PDF, Word (.doc/.docx), Excel (.xls/.xlsx), CSV, or a photo (JPG/PNG) of your statement.',
  }
}

export async function extractTextFromFile(ext: (typeof TEXT_EXTENSIONS)[number], buffer: Buffer): Promise<string> {
  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }
  if (ext === '.doc') {
    const doc = await new WordExtractor().extract(buffer)
    return doc.getBody()
  }
  if (ext === '.csv') {
    return buffer.toString('utf-8')
  }
  if (ext === '.xls') {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    return workbook.SheetNames.map((name) => XLSX.utils.sheet_to_csv(workbook.Sheets[name])).join('\n')
  }

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
  const lines: string[] = []
  workbook.eachSheet((sheet) => {
    sheet.eachRow((row) => {
      const cells = (row.values as ExcelJS.CellValue[]).slice(1)
      const line = cells.map((c) => (c == null ? '' : String(c))).join(', ').trim()
      if (line.replace(/,/g, '').trim()) lines.push(line)
    })
  })
  return lines.join('\n')
}

const EXTRACTION_INSTRUCTION =
  'This is a custodial, brokerage, registrar or bank statement (or a spreadsheet of holdings) from any country. ' +
  'Extract every distinct holding using the report_holdings tool — one entry per fund/security per account or ' +
  'folio, or one per deposit/bank account. Classify each with assetType first: folio_fund (a fund held under a ' +
  'registrar folio, e.g. India mutual funds), custodial_security (a fund, ETF or bond held in a brokerage/custody ' +
  'account), deposit (savings, checking, fixed/term deposit, NRE/NRO/FCNR), stock (individual company shares only — ETFs and funds are NOT stocks even though they trade on an exchange), or other. ' +
  'Report stocks too, with assetType "stock", so they can be excluded. Only report rows with a current value — ' +
  'skip headers, disclaimers, transaction history rows, and totals. Copy folio, account, ISIN, CUSIP and SEDOL ' +
  'values exactly as printed (masked account numbers as shown). Report the statement date (the "as of" / ' +
  'valuation date) as YYYY-MM-DD in statementDate; for a spreadsheet with a date column, put each row\'s date ' +
  'in asOfDate. Never invent a date. If a value is not present, omit that field rather than guessing.'

const IMAGE_MEDIA_TYPES: Record<'.jpg' | '.jpeg' | '.png', 'image/jpeg' | 'image/png'> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
}

export async function buildExtractionContent(
  ext: StatementExtension,
  buffer: Buffer,
): Promise<Array<Anthropic.Messages.TextBlockParam | Anthropic.Messages.DocumentBlockParam | Anthropic.Messages.ImageBlockParam>> {
  if (ext === '.pdf') {
    return [
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') },
      },
      { type: 'text', text: EXTRACTION_INSTRUCTION },
    ]
  }
  if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
    return [
      {
        type: 'image',
        source: { type: 'base64', media_type: IMAGE_MEDIA_TYPES[ext], data: buffer.toString('base64') },
      },
      { type: 'text', text: `${EXTRACTION_INSTRUCTION} This is a photo or scan of a printed/handwritten statement.` },
    ]
  }
  const text = await extractTextFromFile(ext, buffer)
  if (!text.trim()) throw new Error('No extractable text in file')
  return [{ type: 'text', text: `${EXTRACTION_INSTRUCTION}\n\n<statement>\n${text}\n</statement>` }]
}

const EXTRACTABLE_ACCOUNT_TYPES = [
  'mutual_fund', 'brokerage', 'bond', 'cd', 'savings', 'checking', 'fd', 'nre', 'nro', 'fcnr', 'gold', 'other',
] as const satisfies readonly AccountType[]

const DEFAULT_ACCOUNT_TYPE: Record<ImportAssetType, AccountType> = {
  folio_fund: 'mutual_fund',
  custodial_security: 'brokerage',
  deposit: 'savings',
  other: 'other',
}

export const STATEMENT_EXTRACTION_TOOL: Anthropic.Tool = {
  name: 'report_holdings',
  description: 'Report every holding found in the statement; stocks are reported with assetType "stock" so they can be excluded.',
  input_schema: {
    type: 'object',
    properties: {
      statementDate: { type: 'string', description: 'Statement / valuation "as of" date, YYYY-MM-DD, if the document has one' },
      holdings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Holding name, e.g. "HDFC Flexi Cap Fund - Direct Growth", "Vanguard Total Bond ETF", "NRE Savings Account"' },
            assetType: {
              type: 'string',
              enum: [...IMPORT_ASSET_TYPES, 'stock'],
              description: 'folio_fund | custodial_security | deposit | other | stock',
            },
            accountType: { type: 'string', enum: [...EXTRACTABLE_ACCOUNT_TYPES], description: 'Closest account type' },
            institution: { type: 'string', description: 'Fund house, brokerage, custodian or bank name' },
            folioNumber: { type: 'string', description: 'Folio number, if shown' },
            accountNumber: { type: 'string', description: 'Brokerage/custody/bank account number exactly as printed (may be masked)' },
            isin: { type: 'string', description: 'ISIN of the fund/security, if shown' },
            cusip: { type: 'string', description: 'CUSIP, if shown' },
            sedol: { type: 'string', description: 'SEDOL, if shown' },
            units: { type: 'number', description: 'Units / shares held' },
            marketValue: { type: 'number', description: 'Current market value or balance, in the statement currency' },
            currency: { type: 'string', description: 'ISO 4217 currency of marketValue, e.g. INR, USD' },
            asOfDate: { type: 'string', description: "This row's valuation date, YYYY-MM-DD (spreadsheet date column)" },
            fdScheme: { type: 'string', enum: ['NRE', 'NRO'], description: 'India fixed deposit scheme, if stated' },
          },
          required: ['name', 'assetType', 'marketValue', 'currency'],
        },
      },
    },
    required: ['holdings'],
  },
}

const optionalText = z.string().trim().min(1).optional().catch(undefined)

const extractedHoldingSchema = z.object({
  name: z.string().trim().min(1),
  assetType: z.enum([...IMPORT_ASSET_TYPES, 'stock']),
  accountType: z.enum(EXTRACTABLE_ACCOUNT_TYPES).optional().catch(undefined),
  institution: optionalText,
  folioNumber: optionalText,
  accountNumber: optionalText,
  isin: optionalText,
  cusip: optionalText,
  sedol: optionalText,
  units: z.number().finite().positive().optional().catch(undefined),
  marketValue: z.coerce.number().finite().nonnegative(),
  currency: z.string().trim().toUpperCase(),
  asOfDate: optionalText,
  fdScheme: z.enum(['NRE', 'NRO']).optional().catch(undefined),
})

const extractionResultSchema = z.object({
  statementDate: z.unknown().optional(),
  holdings: z.array(z.unknown()),
})

export interface StatementImportMeta extends ImportIdentity {
  statementDate?: string
}

export interface StatementProposal {
  summary: string
  account: RawAccount
  import: StatementImportMeta
}

export interface StatementSkipped {
  stocks: number
  unsupportedCurrency: number
  invalid: number
}

const CURRENCY_COUNTRY: Record<string, { country: 'US' | 'IN'; symbol: string; locale: string }> = {
  INR: { country: 'IN', symbol: '₹', locale: 'en-IN' },
  USD: { country: 'US', symbol: '$', locale: 'en-US' },
}

export function parseExtractionResult(
  toolInput: unknown,
  today: Date = new Date(),
): { proposals: StatementProposal[]; skipped: StatementSkipped } {
  const skipped: StatementSkipped = { stocks: 0, unsupportedCurrency: 0, invalid: 0 }
  const parsed = extractionResultSchema.safeParse(toolInput)
  if (!parsed.success) return { proposals: [], skipped }

  const docDate = validStatementDate(parsed.data.statementDate, today)
  const proposals: StatementProposal[] = []
  for (const raw of parsed.data.holdings) {
    const h = extractedHoldingSchema.safeParse(raw)
    if (!h.success || h.data.marketValue <= 0) {
      skipped.invalid++
      continue
    }
    const d = h.data
    if (d.assetType === 'stock') {
      skipped.stocks++
      continue
    }
    const cur = CURRENCY_COUNTRY[d.currency]
    if (!cur) {
      skipped.unsupportedCurrency++
      continue
    }

    const assetType = d.assetType
    const institution = d.institution ?? (assetType === 'folio_fund' ? 'Mutual Fund' : 'Imported')
    const folio = normalizeRef(d.folioNumber)
    const accountRef = normalizeAccountRef(d.accountNumber)
    const instrumentId =
      normalizeInstrumentId({ isin: d.isin, cusip: d.cusip, sedol: d.sedol }) ??
      (assetType === 'folio_fund' ? nameInstrumentId(d.name) : undefined)

    const ref = d.folioNumber ? `Folio ${d.folioNumber}` : d.accountNumber ? `Acct ${d.accountNumber}` : undefined
    const accountType = d.accountType ?? DEFAULT_ACCOUNT_TYPE[assetType]
    const balance = Math.round(d.marketValue)
    proposals.push({
      summary: `Import ${d.name} — ${cur.symbol}${balance.toLocaleString(cur.locale)}`,
      account: {
        nickname: ref ? `${d.name} (${ref})` : d.name,
        institution,
        accountType,
        country: cur.country,
        balance,
        kind: 'asset',
        isPfic: cur.country === 'IN' && accountType === 'mutual_fund',
        ...(d.fdScheme ? { fdScheme: d.fdScheme } : {}),
      },
      import: {
        assetType,
        institution,
        ...(folio ? { folio } : {}),
        ...(accountRef ? { accountRef } : {}),
        ...(instrumentId ? { instrumentId } : {}),
        statementDate: validStatementDate(d.asOfDate, today) ?? docDate,
      },
    })
  }
  return { proposals, skipped }
}
