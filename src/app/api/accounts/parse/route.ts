import Anthropic from '@anthropic-ai/sdk'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import { AI_MODEL, AI_QUICK } from '@/lib/ai'
import { MAX_SAID_CHARS, buildParseSystem, linesFromModel, parseJsonObject } from '@/lib/account-parse'

export const runtime = 'nodejs'

const client = new Anthropic() // reads ANTHROPIC_API_KEY from the environment

/**
 * POST /api/accounts/parse — { text } → { lines: DraftLine[] }.
 * Turns a spoken or typed description into one draft line per account. Nothing
 * is saved here: the Accounts page shows the lines for the user to check.
 */
export async function POST(req: Request) {
  // Sends what the user said about their accounts to Anthropic (a subprocessor) — require auth.
  try {
    await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized()
    throw e
  }

  let body: { text?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return Response.json({ error: 'Tell us at least one account first.' }, { status: 400 })
  if (text.length > MAX_SAID_CHARS) {
    return Response.json({ error: 'That’s too long for one go. Split it into two parts.' }, { status: 400 })
  }

  try {
    const resp = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 8000,
      ...AI_QUICK,
      system: buildParseSystem(new Date().toISOString().slice(0, 10)),
      messages: [{ role: 'user', content: text }],
    })
    const reply = resp.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    return Response.json({ lines: linesFromModel(parseJsonObject(reply)) })
  } catch (err) {
    console.error('Account parse failed:', err)
    return Response.json({ error: 'NRIWB AI couldn’t read that just now. Try again in a moment.' }, { status: 502 })
  }
}
