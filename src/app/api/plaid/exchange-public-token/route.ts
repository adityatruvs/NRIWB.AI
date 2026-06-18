import { plaidClient } from '@/lib/plaid'

export async function POST(request: Request) {
  const { public_token } = await request.json()

  const { data: tokenData } = await plaidClient.itemPublicTokenExchange({ public_token })
  const { access_token, item_id } = tokenData

  // TODO Sprint 2: encrypt access_token and store in PlaidItem table
  console.log('[plaid] item linked — item_id:', item_id)

  const { data: accountsData } = await plaidClient.accountsGet({ access_token })

  return Response.json({
    success: true,
    item_id,
    accounts: accountsData.accounts,
    institution: accountsData.item,
  })
}
