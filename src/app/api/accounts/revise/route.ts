import Anthropic from '@anthropic-ai/sdk'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import { AI_MODEL, AI_QUICK } from '@/lib/ai'
import { MAX_SAID_CHARS, parseJsonObject } from '@/lib/account-parse'
import { MAX_REVISE_LINES, buildReviseSystem, buildReviseUser, readSnapshot, resolveRevision } from '@/lib/account-revise'

export const runtime = 'nodejs'

const client = new Anthropic() // reads ANTHROPIC_API_KEY from the environment

/**
 * POST /api/accounts/revise — { text, lines } → { adds, updates, ambiguous?, notFound? }.
 * Turns "the HDFC ones are NRE and NRO" or "also a flat in Hyderabad" into changes
 * to the quick-entry list. Nothing is saved here and nothing is applied: the page
 * applies the changes and highlights them. If a change could point at more than
 * one account, the reply carries only `ambiguous` and no changes.
 */
export async function POST(req: Request) {
  // Sends the list and what the user said to Anthropic (a subprocessor) — require auth.
  try {
    await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized()
    throw e
  }

  let body: { text?: unknown; lines?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return Response.json({ error: 'Tell us what to add or change first.' }, { status: 400 })
  if (text.length > MAX_SAID_CHARS) {
    return Response.json({ error: 'That’s too long for one go. Split it into two parts.' }, { status: 400 })
  }
  if (Array.isArray(body.lines) && body.lines.length > MAX_REVISE_LINES) {
    return Response.json(
      { error: `Your list has more than ${MAX_REVISE_LINES} lines. Save some of them first, then change the rest.` },
      { status: 400 },
    )
  }
  const snapshot = readSnapshot(body.lines ?? [])
  if (!snapshot) return Response.json({ error: 'That list couldn’t be read. Reload and try again.' }, { status: 400 })

  try {
    const resp = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 8000,
      ...AI_QUICK,
      system: buildReviseSystem(new Date().toISOString().slice(0, 10)),
      messages: [{ role: 'user', content: buildReviseUser(snapshot, text) }],
    })
    const reply = resp.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    return Response.json(resolveRevision(snapshot, parseJsonObject(reply)))
  } catch (err) {
    console.error('Account revise failed:', err)
    return Response.json({ error: 'NRIWB AI couldn’t read that just now. Try again in a moment.' }, { status: 502 })
  }
}
