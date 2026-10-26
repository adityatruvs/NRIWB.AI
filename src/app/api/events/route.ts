import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import { cleanProps } from '@/lib/analytics'

export const runtime = 'nodejs'

/**
 * POST /api/events — { name, props } → 204.
 * Product-usage events (see lib/analytics.ts). Only allowlisted names and numeric
 * properties are kept, and no user id or account detail is recorded: each event
 * is one structured log line for the product team to query.
 */
export async function POST(req: Request) {
  try {
    await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized()
    throw e
  }
  let body: { name?: unknown; props?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const name = typeof body.name === 'string' ? body.name : ''
  const props = cleanProps(name, body.props)
  if (!props) return Response.json({ error: 'Unknown event' }, { status: 400 })
  console.info(JSON.stringify({ type: 'product_event', name, props, at: new Date().toISOString() }))
  return new Response(null, { status: 204 })
}
