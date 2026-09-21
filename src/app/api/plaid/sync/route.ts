import { Prisma } from '@/generated/prisma'
import { plaidClient } from '@/lib/plaid'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import { plaidAccountFields, extractLoanRates, type PlaidAccountInput, type LoanLiabilities } from '@/lib/plaid-map'
import { toHolding } from '@/lib/accounts-api'

export const runtime = 'nodejs'

/** Fallback USD/INR until the live FX service (later story) populates the FxRate table. */
const DEFAULT_USD_INR = 83

/** Pull the Plaid error_code out of a thrown SDK/axios error, if present. */
function plaidErrorCode(e: unknown): string | null {
  const err = e as { response?: { data?: { error_code?: string } } }
  return err?.response?.data?.error_code ?? null
}

/** Write at most one BalanceSnapshot per account per day (update today's if it exists). */
async function writeDailySnapshot(accountId: string, balanceUsd: number, balanceInr: number, now: Date) {
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)
  const todays = await prisma.balanceSnapshot.findFirst({
    where: { accountId, recordedAt: { gte: startOfDay } },
    select: { id: true },
  })
  if (todays) {
    await prisma.balanceSnapshot.update({
      where: { id: todays.id },
      data: { balanceUsd, balanceInr, recordedAt: now },
    })
  } else {
    await prisma.balanceSnapshot.create({ data: { accountId, balanceUsd, balanceInr } })
  }
}

/**
 * POST /api/plaid/sync — refresh live balances for the user's linked institutions.
 * Pulls current balances (and loan rates where available), updates each Account +
 * lastSyncedAt, records a daily balance snapshot, and flags items needing re-auth.
 * Returns the updated accounts as Holdings so the client can merge them.
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
  const rate = Number(body?.rate) > 0 ? Number(body.rate) : DEFAULT_USD_INR
  const onlyItemId: string | null = typeof body?.item_id === 'string' ? body.item_id : null

  // Every non-disconnected linked institution for this user (scoped — never trust a client id).
  const items = await prisma.plaidItem.findMany({
    where: { userId, status: { not: 'disconnected' }, ...(onlyItemId ? { itemId: onlyItemId } : {}) },
  })
  if (items.length === 0) {
    return Response.json({ accounts: [], reauth: [], synced: 0 })
  }

  const now = new Date()
  const updated: Prisma.AccountGetPayload<object>[] = []
  const reauth: string[] = []

  for (const item of items) {
    const access_token = decrypt(item.accessTokenEncrypted)

    // Current balances. A login-required error means the user must reconnect.
    let accounts: PlaidAccountInput[]
    try {
      const { data } = await plaidClient.accountsGet({ access_token })
      accounts = data.accounts as PlaidAccountInput[]
    } catch (e) {
      if (plaidErrorCode(e) === 'ITEM_LOGIN_REQUIRED') {
        await prisma.plaidItem.update({ where: { id: item.id }, data: { status: 'requires_reauth' } })
        reauth.push(item.itemId)
        continue
      }
      console.error('[plaid] accountsGet failed for item', item.itemId, (e as Error).message)
      continue
    }

    // Loan interest rates, where the institution supports the Liabilities product.
    let loanRates: Record<string, number> = {}
    try {
      const { data } = await plaidClient.liabilitiesGet({ access_token })
      loanRates = extractLoanRates(data.liabilities as unknown as LoanLiabilities)
    } catch {
      // Institution/account doesn't support Liabilities — balances still sync.
    }

    for (const a of accounts) {
      const fields = plaidAccountFields(a, { userId, institutionName: item.institutionName, rate })

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
          lastSyncedAt: now,
          ...(details ? { details: details as Prisma.InputJsonValue } : {}),
        },
        create: {
          ...fields,
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
  }

  console.log('[plaid] sync — user:', userId, 'updated:', updated.length, 'reauth:', reauth.length)
  return Response.json({ accounts: updated.map(toHolding), reauth, synced: updated.length })
}
