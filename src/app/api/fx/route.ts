import { getFxSnapshot, FxUnavailableError } from '@/lib/fx'

export const runtime = 'nodejs'

/**
 * GET /api/fx — the live USD/INR rate (or the last saved live rate), read by
 * CurrencyContext on the client. 503 when there is no rate at all yet.
 */
export async function GET() {
  try {
    return Response.json(await getFxSnapshot())
  } catch (e) {
    if (e instanceof FxUnavailableError) return Response.json({ error: e.message }, { status: 503 })
    throw e
  }
}
