import Anthropic from '@anthropic-ai/sdk'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import { AI_MODEL, AI_QUICK } from '@/lib/ai'
import {
  validateStatementFile,
  buildExtractionContent,
  parseExtractionResult,
  STATEMENT_EXTRACTION_TOOL,
  type StatementSkipped,
} from '@/lib/statement-import'

export const runtime = 'nodejs'
export const maxDuration = 60

const client = new Anthropic()
const MODEL = AI_MODEL

const GENERIC_FAILURE =
  "Couldn't read that statement — it may be scanned, password-protected, or in an unexpected format. Add your holdings manually instead."

function noHoldingsMessage(skipped: StatementSkipped): string {
  const why: string[] = []
  if (skipped.stocks) why.push(`${skipped.stocks} stock row${skipped.stocks === 1 ? '' : 's'} skipped (stocks aren't supported yet)`)
  if (skipped.unsupportedCurrency) {
    why.push(`${skipped.unsupportedCurrency} row${skipped.unsupportedCurrency === 1 ? '' : 's'} in a currency other than USD or INR`)
  }
  return `No supported holdings were found in this statement${why.length ? ` — ${why.join('; ')}` : ''}. Add them manually instead.`
}

export async function POST(request: Request) {
  try {
    await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized()
    throw e
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ error: 'Could not read the upload.' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return Response.json({ error: 'No file was uploaded.' }, { status: 400 })
  }

  const validation = validateStatementFile({ name: file.name, size: file.size })
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 })
  }

  let content: Awaited<ReturnType<typeof buildExtractionContent>>
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    content = await buildExtractionContent(validation.ext, buffer)
  } catch (e) {
    console.error('Statement file extraction failed:', e)
    return Response.json({ error: GENERIC_FAILURE }, { status: 422 })
  }

  let message: Anthropic.Message
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      ...AI_QUICK,
      tools: [STATEMENT_EXTRACTION_TOOL],
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content }],
    })
  } catch (e) {
    console.error('Statement extraction call failed:', e)
    return Response.json(
      { error: "The statement couldn't be parsed right now. Add your holdings manually instead." },
      { status: 502 },
    )
  }

  const truncated = message.stop_reason === 'max_tokens'
  const toolUse = message.content.find((b) => b.type === 'tool_use')
  const { proposals, skipped } = toolUse
    ? parseExtractionResult(toolUse.input)
    : { proposals: [], skipped: { stocks: 0, unsupportedCurrency: 0, invalid: 0 } }

  if (proposals.length === 0) {
    return Response.json(
      {
        error: truncated
          ? 'This statement is too long to read in one go. Split it into smaller files (or upload one section at a time), or add the holdings manually.'
          : noHoldingsMessage(skipped),
      },
      { status: 422 },
    )
  }

  return Response.json({ proposals, skipped, truncated })
}
