import { plaidClient } from '@/lib/plaid'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import { CountryCode, Products } from 'plaid'

export async function POST() {
  let userId: string
  try {
    userId = await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized()
    throw e
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
