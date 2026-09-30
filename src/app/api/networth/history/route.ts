import { prisma } from '@/lib/prisma'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import { isLiability, type Holding } from '@/lib/portfolio'
import { parseRate } from '@/lib/user-context'
import { buildHistory, isoDay, type HistoryRange } from '@/lib/networth-history'

export const runtime = 'nodejs'

/**
 * GET /api/networth/history?range=90d|12m&rate=… — the signed-in user's net-worth
 * series (all / US / India per point) from their balance snapshots.
 */
export async function GET(request: Request) {
  let userId: string
  try {
    userId = await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized()
    throw e
  }

  const url = new URL(request.url)
  const range: HistoryRange = url.searchParams.get('range') === '12m' ? '12m' : '90d'
  const rate = parseRate(url.searchParams.get('rate'))

  const accounts = await prisma.account.findMany({
    where: { userId },
    select: { id: true, country: true, kind: true, accountType: true },
  })
  // All of each account's snapshots: carry-forward needs the last one *before*
  // the range too. At one row per account per day this stays small.
  const snapshots = accounts.length
    ? await prisma.balanceSnapshot.findMany({
        where: { accountId: { in: accounts.map((a) => a.id) } },
        select: { accountId: true, day: true, recordedAt: true, balanceUsd: true, balanceInr: true },
      })
    : []

  const history = buildHistory({
    accounts: accounts.map((a) => ({
      id: a.id,
      country: a.country === 'IN' ? 'IN' : 'US',
      liability: isLiability({ kind: a.kind, accountType: a.accountType } as Holding),
    })),
    // Rows written before `day` existed fall back to their UTC recording date.
    snapshots: snapshots.map((s) => ({
      accountId: s.accountId,
      day: isoDay(s.day ?? s.recordedAt),
      balanceUsd: s.balanceUsd,
      balanceInr: s.balanceInr,
    })),
    rate,
    range,
    today: isoDay(new Date()),
  })
  return Response.json(history)
}
