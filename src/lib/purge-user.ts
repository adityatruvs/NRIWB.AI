import { plaidClient } from '@/lib/plaid'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'

/**
 * Permanently erase every trace of a user's financial data.
 *
 * Revokes Plaid access tokens at the source first, then deletes all owned rows.
 * Idempotent — safe to run when some or all of the data is already gone.
 *
 * Backs the CCPA right-to-delete and the FTC Safeguards Rule's secure-disposal
 * duty. Called from the Clerk `user.deleted` webhook (see app/api/webhooks/clerk)
 * and available to wire to a future user-facing delete trigger.
 */
export async function purgeUserData(userId: string): Promise<void> {
  // 1. Revoke Plaid access at the source BEFORE dropping our token copies —
  //    otherwise the tokens would keep working even after the DB row is gone.
  const items = await prisma.plaidItem.findMany({ where: { userId } })
  for (const item of items) {
    try {
      await plaidClient.itemRemove({ access_token: decrypt(item.accessTokenEncrypted) })
    } catch (e) {
      // Already-removed / invalid tokens are fine — we still purge our copy below.
      console.warn('[purge] itemRemove failed (continuing):', (e as Error).message)
    }
  }

  // 2. Delete all owned rows atomically. BalanceSnapshot cascades from Account
  //    (onDelete: Cascade in the schema), so deleting accounts clears snapshots too.
  await prisma.$transaction([
    prisma.account.deleteMany({ where: { userId } }),
    prisma.plaidItem.deleteMany({ where: { userId } }),
    prisma.conversation.deleteMany({ where: { userId } }),
    prisma.complianceData.deleteMany({ where: { userId } }),
  ])

  console.log('[purge] erased all data for user:', userId)
}
