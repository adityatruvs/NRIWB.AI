import { timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { syncPlaidItem } from '@/lib/plaid-sync'
import { getFxSnapshot } from '@/lib/fx'

export const runtime = 'nodejs'
// A run walks every linked item; give it room beyond the default function timeout.
export const maxDuration = 300

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

  // The live rate (cached, refreshed when stale). The old lookup used the wrong
  // pair key ('USD/INR' vs 'USD_INR'), so every sync fell back to a fixed ₹83.
  const fx = await getFxSnapshot().catch((e: Error) => {
    console.error('[cron] plaid-sync skipped, no USD/INR rate:', e.message)
    return null
  })
  // Never sync at a made-up rate: with no live or saved rate, skip this run.
  if (!fx) return Response.json({ error: 'No USD/INR rate available' }, { status: 503 })
  const { rate } = fx

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
