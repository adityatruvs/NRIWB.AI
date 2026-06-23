import { plaidClient } from '@/lib/plaid'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'

export async function POST(request: Request) {
  let userId: string
  try {
    userId = await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized()
    throw e
  }

  const { public_token } = await request.json()
  if (!public_token || typeof public_token !== 'string') {
    return Response.json({ error: 'public_token is required' }, { status: 400 })
  }

  const { data: tokenData } = await plaidClient.itemPublicTokenExchange({ public_token })
  const { access_token, item_id } = tokenData

  // Fetch institution + accounts to display. The access_token never leaves the server.
  const { data: accountsData } = await plaidClient.accountsGet({ access_token })
  const institutionId = accountsData.item.institution_id ?? 'unknown'

  // Encrypt the access_token at rest (FTC Safeguards Rule) before it touches the DB.
  // Scoped to the authenticated userId so one user can never read another's items.
  await prisma.plaidItem.upsert({
    where: { itemId: item_id },
    update: {
      accessTokenEncrypted: encrypt(access_token),
      institutionId,
      status: 'active',
      userId,
    },
    create: {
      userId,
      itemId: item_id,
      accessTokenEncrypted: encrypt(access_token),
      institutionId,
      institutionName: institutionId, // resolved to a display name in a later sync
      status: 'active',
    },
  })

  // Log a non-sensitive identifier only — never the access_token.
  console.log('[plaid] item linked — item_id:', item_id, 'user:', userId)

  return Response.json({
    success: true,
    item_id,
    accounts: accountsData.accounts,
    institution: accountsData.item,
  })
}
