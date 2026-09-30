import { prisma } from '@/lib/prisma'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import { toHolding } from '@/lib/accounts-api'
import { syncPlaidItem } from '@/lib/plaid-sync'

export const runtime = 'nodejs'

/** Fallback USD/INR until the live FX service (later story) populates the FxRate table. */
const DEFAULT_USD_INR = 83

/**
 * POST /api/plaid/sync — refresh live balances for the user's linked institutions
 * (optionally just one `item_id`). See `syncPlaidItem` for what a sync does.
 * Returns the updated accounts as Holdings so the client can merge them.
 */
export async function POST(request: Request) {
  let userId: string
  try {
    userId = await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized()
    throw e
  }

  const body = await request.json().catch(() => null)
  const rate = Number(body?.rate) > 0 ? Number(body.rate) : DEFAULT_USD_INR
  const onlyItemId: string | null = typeof body?.item_id === 'string' ? body.item_id : null

  // Every non-disconnected linked institution for this user (scoped — never trust a client id).
  const items = await prisma.plaidItem.findMany({
    where: { userId, status: { not: 'disconnected' }, ...(onlyItemId ? { itemId: onlyItemId } : {}) },
  })
  if (items.length === 0) {
    return Response.json({ accounts: [], reauth: [], synced: 0 })
  }

  const now = new Date()
  const updated = []
  const reauth: string[] = []
  for (const item of items) {
    const outcome = await syncPlaidItem(item, { rate, now })
    if (outcome.status === 'reauth') reauth.push(item.itemId)
    updated.push(...outcome.accounts)
  }

  console.log('[plaid] sync — user:', userId, 'updated:', updated.length, 'reauth:', reauth.length)
  return Response.json({ accounts: updated.map(toHolding), reauth, synced: updated.length })
}
