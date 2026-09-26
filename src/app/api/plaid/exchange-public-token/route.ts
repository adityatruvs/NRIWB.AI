import { plaidClient } from '@/lib/plaid'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import { plaidAccountFields, type PlaidAccountInput } from '@/lib/plaid-map'
import { toHolding } from '@/lib/accounts-api'
import { getFxSnapshot } from '@/lib/fx'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  let userId: string
  try {
    userId = await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized()
    throw e
  }

  const body = await request.json().catch(() => null)
  const public_token: unknown = body?.public_token
  if (!public_token || typeof public_token !== 'string') {
    return Response.json({ error: 'public_token is required' }, { status: 400 })
  }
  // Friendly institution name comes from Plaid Link metadata on the client; the
  // token exchange only yields an institution_id. Rate is used to derive INR.
  const institutionName: string =
    typeof body?.institutionName === 'string' && body.institutionName.trim()
      ? body.institutionName.trim()
      : 'Bank'
  const rate = Number(body?.rate) > 0 ? Number(body.rate) : (await getFxSnapshot()).rate

  const { data: tokenData } = await plaidClient.itemPublicTokenExchange({ public_token })
  const { access_token, item_id } = tokenData

  // Fetch institution + accounts. The access_token never leaves the server.
  const { data: accountsData } = await plaidClient.accountsGet({ access_token })
  const institutionId = accountsData.item.institution_id ?? 'unknown'

  // Encrypt the access_token at rest (FTC Safeguards Rule) before it touches the DB.
  // Scoped to the authenticated userId so one user can never read another's items.
  await prisma.plaidItem.upsert({
    where: { itemId: item_id },
    update: {
      accessTokenEncrypted: encrypt(access_token),
      institutionId,
      institutionName,
      status: 'active',
      userId,
    },
    create: {
      userId,
      itemId: item_id,
      accessTokenEncrypted: encrypt(access_token),
      institutionId,
      institutionName,
      status: 'active',
    },
  })

  // Create a real Account row per linked account (source=plaid), deduping by the
  // globally-unique plaidAccountId so re-linking refreshes balances in place rather
  // than duplicating. User edits (nickname/type) are preserved on re-link.
  const now = new Date()
  const rows = await prisma.$transaction(
    (accountsData.accounts as PlaidAccountInput[]).map((a) => {
      const fields = plaidAccountFields(a, { userId, institutionName, rate })
      return prisma.account.upsert({
        where: { plaidAccountId: a.account_id },
        update: {
          balanceUsd: fields.balanceUsd,
          balanceInr: fields.balanceInr,
          lastSyncedAt: now,
        },
        create: { ...fields, lastSyncedAt: now },
      })
    }),
  )

  // Log a non-sensitive identifier only — never the access_token.
  console.log('[plaid] item linked — item_id:', item_id, 'user:', userId, 'accounts:', rows.length)

  // Return the persisted accounts as Holdings so the client merges them straight
  // into the ledger (no second write from the client).
  return Response.json({ success: true, item_id, accounts: rows.map(toHolding) })
}
