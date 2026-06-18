import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

const envMap: Record<string, string> = {
  production: PlaidEnvironments.production,
  development: PlaidEnvironments.development,
  sandbox: PlaidEnvironments.sandbox,
}

const basePath = envMap[process.env.PLAID_ENV ?? 'sandbox'] ?? PlaidEnvironments.sandbox

export const plaidClient = new PlaidApi(
  new Configuration({
    basePath,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  })
)
