import { clerkClient } from '@clerk/nextjs/server'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import { purgeUserData } from '@/lib/purge-user'

// User-initiated account deletion. Works today with no external setup — the
// caller must be signed in (requireUserId), so no signature check is needed.
//
// Order matters: purge our financial data FIRST (revoke Plaid + delete rows),
// then delete the Clerk identity. If the Clerk delete failed after purging, the
// user is left with an empty-but-valid account they can retry deleting — far
// safer than deleting the identity first and orphaning the financial data.
//
// The `user.deleted` webhook (app/api/webhooks/clerk) stays as a backstop for
// deletions initiated outside the app (e.g. the Clerk Dashboard) once wired.
export async function DELETE() {
  let userId: string
  try {
    userId = await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized()
    throw e
  }

  await purgeUserData(userId)

  const client = await clerkClient()
  await client.users.deleteUser(userId)

  console.log('[user] account deleted — user:', userId)
  return Response.json({ success: true })
}
