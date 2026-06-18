import { plaidClient } from '@/lib/plaid'
import { CountryCode, Products } from 'plaid'

export async function POST() {
  const response = await plaidClient.linkTokenCreate({
    user: { client_user_id: 'sandbox-test-user' },
    client_name: 'NRIWB',
    products: [Products.Auth],
    country_codes: [CountryCode.Us],
    language: 'en',
    ...(process.env.PLAID_REDIRECT_URI
      ? { redirect_uri: process.env.PLAID_REDIRECT_URI }
      : {}),
  })

  return Response.json({ link_token: response.data.link_token })
}
