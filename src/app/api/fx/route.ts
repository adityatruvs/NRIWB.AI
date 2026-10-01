import { getFxSnapshot } from '@/lib/fx'

export const runtime = 'nodejs'

/** GET /api/fx — the current cached USD/INR rate, read by CurrencyContext on the client. */
export async function GET() {
  const snapshot = await getFxSnapshot()
  return Response.json(snapshot)
}
