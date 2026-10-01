import { timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { syncPlaidItem } from '@/lib/plaid-sync'

export const runtime = 'nodejs'
// A run walks every linked item; give it room beyond the default function timeout.
export const maxDuration = 300

/** Fallback USD/INR until the live FX service populates the FxRate table. */
const DEFAULT_USD_INR = 83

/** Constant-time check of `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends this). */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const got = Buffer.from(request.headers.get('authorization') ?? '')
  return got.length === expected.length && timingSafeEqual(got, expected)
}

/**
 * GET /api/cron/plaid-sync — daily balance sync for every non-disconnected Plaid
 * item across all users (scheduled in vercel.json). Each item is isolated: one
 * failure never stops the rest. Snapshots are one per account per UTC day, so a
 * second run the same day updates rather than duplicates.
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const fx = await prisma.fxRate.findUnique({ where: { pair: 'USD/INR' } }).catch(() => null)
  const rate = fx?.rate && fx.rate > 0 ? fx.rate : DEFAULT_USD_INR

  const items = await prisma.plaidItem.findMany({ where: { status: { not: 'disconnected' } } })
  const now = new Date()
  const counts = { items: items.length, synced: 0, failed: 0, reauth: 0, accounts: 0 }

  for (const item of items) {
    const outcome = await syncPlaidItem(item, { rate, now })
    counts[outcome.status]++
    counts.accounts += outcome.accounts.length
  }

  console.log('[cron] plaid-sync', JSON.stringify(counts))
  return Response.json(counts)
}
