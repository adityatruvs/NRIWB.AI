import { getFxSnapshot, refreshFxRate, FX_PAIR, FxUnavailableError } from '@/lib/fx'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    console.error('[fx] CRON_SECRET is not configured — refusing to run')
    return Response.json({ error: 'Not configured' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${expected}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const snapshot = await refreshFxRate()
    console.log(`[fx] refreshed ${FX_PAIR}: ${snapshot.rate}`)
    return Response.json(snapshot)
  } catch (e) {
    console.error('[fx] refresh failed, keeping the last saved live rate:', (e as Error).message)
    try {
      return Response.json(await getFxSnapshot())
    } catch (err) {
      if (err instanceof FxUnavailableError) return Response.json({ error: err.message }, { status: 503 })
      throw err
    }
  }
}
