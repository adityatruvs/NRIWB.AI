import Anthropic from '@anthropic-ai/sdk'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import {
  validateCasFile,
  buildExtractionContent,
  parseExtractionResult,
  CAS_EXTRACTION_TOOL,
} from '@/lib/cas-import'

// Touches an uploaded file + calls the model — must run on Node, never the edge.
export const runtime = 'nodejs'
// A multi-page PDF + a Claude round trip can run past the platform default.
export const maxDuration = 60

const client = new Anthropic() // reads ANTHROPIC_API_KEY from the environment
const MODEL = 'claude-sonnet-4-6'

const GENERIC_FAILURE =
  "Couldn't read that statement — it may be scanned, password-protected, or in an unexpected format. Add your holdings manually instead."

/**
 * POST /api/accounts/import-cas — parse an uploaded CAMS/KFintech CAS (PDF,
 * Word, or Excel) into reviewable mutual-fund holding proposals. Nothing is
 * saved here: the client reviews/edits each proposal, then accepting one goes
 * through the normal POST /api/accounts path (source: 'pdf_upload').
 *
 * Any failure returns a 4xx/5xx with a human-readable `error` — the client
 * treats that as a signal to fall back to manual entry.
 */
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

  const validation = validateCasFile({ name: file.name, size: file.size })
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 })
  }

  let content: Awaited<ReturnType<typeof buildExtractionContent>>
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    content = await buildExtractionContent(validation.ext, buffer)
  } catch (e) {
    console.error('CAS file extraction failed:', e)
    return Response.json({ error: GENERIC_FAILURE }, { status: 422 })
  }

  let message: Anthropic.Message
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      tools: [CAS_EXTRACTION_TOOL],
      tool_choice: { type: 'tool', name: CAS_EXTRACTION_TOOL.name },
      messages: [{ role: 'user', content }],
    })
  } catch (e) {
    console.error('CAS extraction call failed:', e)
    return Response.json(
      { error: "The statement couldn't be parsed right now. Add your holdings manually instead." },
      { status: 502 },
    )
  }

  const toolUse = message.content.find((b) => b.type === 'tool_use')
  const { proposals } = toolUse ? parseExtractionResult(toolUse.input) : { proposals: [] }

  if (proposals.length === 0) {
    return Response.json(
      { error: 'No mutual fund holdings were found in this statement. Add them manually instead.' },
      { status: 422 },
    )
  }

  return Response.json({ proposals })
}
