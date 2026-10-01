import { getFxSnapshot, refreshFxRate, FX_PAIR } from '@/lib/fx'

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
    console.error('[fx] refresh failed, keeping last-known rate:', (e as Error).message)
    const fallback = await getFxSnapshot()
    return Response.json(fallback)
  }
}
