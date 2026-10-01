import { plaidClient } from '@/lib/plaid'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import { CountryCode, Products } from 'plaid'

export const runtime = 'nodejs'

/**
 * POST /api/plaid/create-link-token — a Link token for connecting a new bank, or,
 * with `{ item_id }`, one in update mode to re-login an item that needs reauth.
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
  const itemId: unknown = body?.item_id
  if (typeof itemId === 'string') {
    // Update mode: scoped to the caller's own item; the token never leaves the server.
    const item = await prisma.plaidItem.findFirst({ where: { itemId, userId } })
    if (!item) return Response.json({ error: 'Item not found' }, { status: 404 })
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: 'NRIWB',
      access_token: decrypt(item.accessTokenEncrypted),
      country_codes: [CountryCode.Us],
      language: 'en',
      ...(process.env.PLAID_REDIRECT_URI ? { redirect_uri: process.env.PLAID_REDIRECT_URI } : {}),
    })
    return Response.json({ link_token: response.data.link_token })
  }

  const response = await plaidClient.linkTokenCreate({
    // Tie the Link token to the real authenticated user, not a shared sandbox id.
    user: { client_user_id: userId },
    client_name: 'NRIWB',
    products: [Products.Auth],
    // Requested but not required — lets the balance sync pull loan interest rates
    // from institutions that support Liabilities, without blocking the Auth link.
    optional_products: [Products.Liabilities],
    country_codes: [CountryCode.Us],
    language: 'en',
    ...(process.env.PLAID_REDIRECT_URI
      ? { redirect_uri: process.env.PLAID_REDIRECT_URI }
      : {}),
  })

  return Response.json({ link_token: response.data.link_token })
}
