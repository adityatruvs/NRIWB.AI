import { z } from 'zod'
import mammoth from 'mammoth'
import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import WordExtractor from 'word-extractor'
import type Anthropic from '@anthropic-ai/sdk'
import type { RawAccount } from '@/lib/copilot-actions'

export const CAS_MAX_FILE_BYTES = 10 * 1024 * 1024

const TEXT_EXTENSIONS = ['.docx', '.doc', '.xlsx', '.xls', '.csv'] as const
const NATIVE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'] as const

export const CAS_ACCEPTED_EXTENSIONS = [...TEXT_EXTENSIONS, ...NATIVE_EXTENSIONS] as const
export type CasExtension = (typeof CAS_ACCEPTED_EXTENSIONS)[number]

export type CasFileValidation =
  | { ok: true; ext: CasExtension }
  | { ok: false; error: string }

export function validateCasFile(file: { name: string; size: number }): CasFileValidation {
  if (file.size <= 0) return { ok: false, error: 'That file is empty.' }
  if (file.size > CAS_MAX_FILE_BYTES) {
    return { ok: false, error: `File is too large — the limit is ${CAS_MAX_FILE_BYTES / (1024 * 1024)}MB.` }
  }
  const lower = file.name.toLowerCase()
  const ext = CAS_ACCEPTED_EXTENSIONS.find((e) => lower.endsWith(e))
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
  // @ts-expect-error
  await workbook.xlsx.load(buffer)
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
  'This is a Consolidated Account Statement (CAS) from a CAMS or KFintech-style India mutual fund registrar, ' +
  'or an equivalent fund/folio statement. Extract every distinct mutual fund holding (one entry per scheme/folio) ' +
  'using the report_holdings tool. Only report rows that are actual fund holdings with a current market value — ' +
  'skip headers, disclaimers, transaction history rows, and totals. If a value is not present, omit that field ' +
  'rather than guessing.'

const IMAGE_MEDIA_TYPES: Record<'.jpg' | '.jpeg' | '.png', 'image/jpeg' | 'image/png'> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
}

export async function buildExtractionContent(
  ext: CasExtension,
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

export const CAS_EXTRACTION_TOOL: Anthropic.Tool = {
  name: 'report_holdings',
  description: 'Report every mutual fund holding found in the statement.',
  input_schema: {
    type: 'object',
    properties: {
      holdings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            schemeName: { type: 'string', description: 'The mutual fund scheme name, e.g. "HDFC Flexi Cap Fund - Direct Growth"' },
            amcName: { type: 'string', description: 'The fund house / AMC name, e.g. "HDFC Mutual Fund"' },
            folioNumber: { type: 'string', description: 'The folio number, if shown' },
            units: { type: 'number', description: 'Units held' },
            marketValueInr: { type: 'number', description: 'Current market value of the holding, in INR' },
          },
          required: ['schemeName', 'marketValueInr'],
        },
      },
    },
    required: ['holdings'],
  },
}

const extractedHoldingSchema = z.object({
  schemeName: z.string().trim().min(1),
  amcName: z.string().trim().min(1).optional(),
  folioNumber: z.string().trim().min(1).optional(),
  units: z.number().finite().positive().optional(),
  marketValueInr: z.coerce.number().finite().nonnegative(),
})

const extractionResultSchema = z.object({
  holdings: z.array(z.unknown()),
})

export interface CasProposal {
  summary: string
  account: RawAccount
}

export function parseExtractionResult(toolInput: unknown): { proposals: CasProposal[]; skipped: number } {
  const parsed = extractionResultSchema.safeParse(toolInput)
  if (!parsed.success) return { proposals: [], skipped: 0 }

  const proposals: CasProposal[] = []
  let skipped = 0
  for (const raw of parsed.data.holdings) {
    const h = extractedHoldingSchema.safeParse(raw)
    if (!h.success || h.data.marketValueInr <= 0) {
      skipped++
      continue
    }
    const { schemeName, amcName, folioNumber, marketValueInr } = h.data
    const nickname = folioNumber ? `${schemeName} (Folio ${folioNumber})` : schemeName
    const balance = Math.round(marketValueInr)
    proposals.push({
      summary: `Import ${schemeName} — ₹${balance.toLocaleString('en-IN')}`,
      account: {
        nickname,
        institution: amcName ?? 'Mutual Fund',
        accountType: 'mutual_fund',
        country: 'IN',
        balance,
        kind: 'asset',
        isPfic: true,
      },
    })
  }
  return { proposals, skipped }
}
