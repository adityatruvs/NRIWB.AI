import { plaidClient } from '@/lib/plaid'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'

// Disconnect a linked institution: revoke Plaid's access AND delete the stored token.
// Backs the user's right to delete (CCPA) and the Safeguards Rule's secure-disposal duty.
export async function POST(request: Request) {
  let userId: string
  try {
    userId = await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized()
    throw e
  }

  const { item_id } = await request.json()
  if (!item_id || typeof item_id !== 'string') {
    return Response.json({ error: 'item_id is required' }, { status: 400 })
  }

  // Scope the lookup to the authenticated user — never trust a client-supplied item_id alone.
  const item = await prisma.plaidItem.findFirst({ where: { itemId: item_id, userId } })
  if (!item) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  // Revoke at Plaid so the token can no longer be used, even if our DB copy lingered.
  try {
    await plaidClient.itemRemove({ access_token: decrypt(item.accessTokenEncrypted) })
  } catch (e) {
    // Already-removed / invalid tokens are fine — we still purge our copy below.
    console.warn('[plaid] itemRemove failed (continuing to delete local record):', (e as Error).message)
  }

  await prisma.plaidItem.delete({ where: { id: item.id } })

  console.log('[plaid] item disconnected — item_id:', item_id, 'user:', userId)
  return Response.json({ success: true })
}
