import { plaidClient } from '@/lib/plaid'
import { CountryCode, Products } from 'plaid'
import { PlaidLink } from '@/components/PlaidLink'

export default async function PlaidTestPage() {
  const { data } = await plaidClient.linkTokenCreate({
    user: { client_user_id: 'sandbox-test-user' },
    client_name: 'NRIWB',
    products: [Products.Auth],
    country_codes: [CountryCode.Us],
    language: 'en',
    ...(process.env.PLAID_REDIRECT_URI
      ? { redirect_uri: process.env.PLAID_REDIRECT_URI }
      : {}),
  })

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8">
      <div className="card-surface relative w-full max-w-md overflow-hidden p-8 text-center">
        <span aria-hidden className="gradient-hairline absolute inset-x-0 top-0" />
        <h1 className="text-xl font-semibold tracking-tight">Plaid Sandbox Test</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Use username <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">user_good</code>{' '}
          / password <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">pass_good</code>
        </p>
        <div className="mt-5">
          <PlaidLink linkToken={data.link_token} />
        </div>
      </div>
    </main>
  )
}
