import { Prisma } from '@/generated/prisma'
import { plaidClient } from '@/lib/plaid'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { plaidAccountFields, extractLoanRates, type PlaidAccountInput, type LoanLiabilities } from '@/lib/plaid-map'
import { writeDailySnapshot } from '@/lib/snapshots'

type AccountRow = Prisma.AccountGetPayload<object>
type PlaidItemRow = Prisma.PlaidItemGetPayload<object>

export type SyncOutcome =
  | { status: 'synced'; accounts: AccountRow[] }
  | { status: 'reauth'; accounts: [] }
  | { status: 'failed'; accounts: []; error: string }

/** Pull the Plaid error_code out of a thrown SDK/axios error, if present. */
export function plaidErrorCode(e: unknown): string | null {
  const err = e as { response?: { data?: { error_code?: string } } }
  return err?.response?.data?.error_code ?? null
}

/**
 * Refresh one linked institution: current balances (the cached `accountsGet`,
 * which Plaid doesn't bill per call — never the paid real-time balance endpoint),
 * loan rates where available, one balance snapshot per account per UTC day, and
 * the item's status. Never throws — the outcome says what happened, so a caller
 * looping over many items isolates each one.
 */
export async function syncPlaidItem(
  item: PlaidItemRow,
  opts: { rate: number; now?: Date },
): Promise<SyncOutcome> {
  const now = opts.now ?? new Date()
  try {
    const access_token = decrypt(item.accessTokenEncrypted)

    let accounts: PlaidAccountInput[]
    try {
      const { data } = await plaidClient.accountsGet({ access_token })
      accounts = data.accounts as PlaidAccountInput[]
    } catch (e) {
      if (plaidErrorCode(e) === 'ITEM_LOGIN_REQUIRED') {
        await prisma.plaidItem.update({ where: { id: item.id }, data: { status: 'requires_reauth' } })
        return { status: 'reauth', accounts: [] }
      }
      throw e
    }

    // Loan interest rates, where the institution supports the Liabilities product.
    let loanRates: Record<string, number> = {}
    try {
      const { data } = await plaidClient.liabilitiesGet({ access_token })
      loanRates = extractLoanRates(data.liabilities as unknown as LoanLiabilities)
    } catch {
      // Institution/account doesn't support Liabilities — balances still sync.
    }

    const updated: AccountRow[] = []
    for (const a of accounts) {
      const fields = plaidAccountFields(a, {
        userId: item.userId,
        institutionName: item.institutionName,
        rate: opts.rate,
      })

      // Merge a discovered loan rate into details without dropping existing detail fields.
      const existing = await prisma.account.findUnique({
        where: { plaidAccountId: a.account_id },
        select: { details: true },
      })
      const foundRate = loanRates[a.account_id]
      const details =
        foundRate != null
          ? { ...((existing?.details as Record<string, unknown> | null) ?? {}), interestRate: foundRate }
          : undefined

      // Upsert so a brand-new account discovered on sync is created too (self-healing).
      const row = await prisma.account.upsert({
        where: { plaidAccountId: a.account_id },
        update: {
          balanceUsd: fields.balanceUsd,
          balanceInr: fields.balanceInr,
          plaidItemId: item.itemId,
          lastSyncedAt: now,
          ...(details ? { details: details as Prisma.InputJsonValue } : {}),
        },
        create: {
          ...fields,
          plaidItemId: item.itemId,
          lastSyncedAt: now,
          ...(details ? { details: details as Prisma.InputJsonValue } : {}),
        },
      })

      await writeDailySnapshot(row.id, row.balanceUsd, row.balanceInr, now)
      updated.push(row)
    }

    // A successful pull clears any prior reauth flag.
    if (item.status !== 'active') {
      await prisma.plaidItem.update({ where: { id: item.id }, data: { status: 'active' } })
    }
    return { status: 'synced', accounts: updated }
  } catch (e) {
    const error = (e as Error).message ?? String(e)
    console.error('[plaid] sync failed for item', item.itemId, error)
    return { status: 'failed', accounts: [], error }
  }
}
