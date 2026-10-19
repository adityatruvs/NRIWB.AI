import { prisma } from '@/lib/prisma'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import { toHolding } from '@/lib/accounts-api'
import { resolveRate } from '@/lib/user-context'
import { recordedFbarPeak } from '@/lib/fbar'

export const runtime = 'nodejs'

/**
 * GET /api/fbar?rate=… — the user's recorded FBAR peak this calendar year (the
 * sum of each India account's highest recorded balance), or `{ recorded: null }`
 * when there's no balance history this year and only current balances are known.
 */
export async function GET(request: Request) {
  let userId: string
  try {
    userId = await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized()
    throw e
  }

  const rate = await resolveRate(new URL(request.url).searchParams.get('rate'))
  const year = new Date().getUTCFullYear()
  const [accounts, snapshots] = await Promise.all([
    prisma.account.findMany({ where: { userId, country: 'IN' } }),
    prisma.balanceSnapshot.findMany({
      where: { account: { userId, country: 'IN' }, recordedAt: { gte: new Date(Date.UTC(year, 0, 1)) } },
      select: { accountId: true, day: true, recordedAt: true, balanceInr: true, balanceUsd: true },
    }),
  ])
  const recorded = recordedFbarPeak(
    accounts.map(toHolding),
    snapshots.map((s) => ({
      accountId: s.accountId,
      day: (s.day ?? s.recordedAt).toISOString().slice(0, 10),
      balanceInr: s.balanceInr,
      balanceUsd: s.balanceUsd,
    })),
    rate,
    year,
  )
  return Response.json({ recorded })
}
